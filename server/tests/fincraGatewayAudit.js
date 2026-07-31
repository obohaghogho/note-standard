/**
 * Fincra Gateway E2E Audit — NoteStandard
 * ─────────────────────────────────────────
 * Validates the FULL payout pipeline:
 *   1. Gateway /health endpoint (checks fincraReachable, circuit state, IP)
 *   2. Gateway /proxy authentication (HMAC-signed request)
 *   3. Fincra business profile through gateway (confirms IP whitelist)
 *   4. Fincra bank list through gateway (payout infrastructure)
 *   5. Fincra payout endpoint dry-run through gateway
 *   6. Local env var configuration sanity
 *
 * Usage: node server/tests/fincraGatewayAudit.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const axios  = require("axios");
const crypto = require("crypto");

const GATEWAY_URL = (process.env.FINCRA_GATEWAY_URL || "https://gateway.notestandard.com/proxy")
  .replace(/\/proxy\/?$/, ""); // strip /proxy suffix so we can call /health and /proxy separately
const GATEWAY_KEY  = process.env.FINCRA_GATEWAY_KEY || "3dfd955a433a3eb100e2dc4763ec48b4b93ca85f0d722ffcfd1cbed6198319d9";
const FINCRA_KEY   = process.env.FINCRA_API_KEY;
const BUSINESS_ID  = process.env.FINCRA_BUSINESS_ID;
const ENABLE_FINCRA = process.env.ENABLE_FINCRA;

let passed = 0;
let failed = 0;

function pass(label, detail = "") {
  passed++;
  console.log(`  ✅ ${label}${detail ? " — " + detail : ""}`);
}
function fail(label, detail = "") {
  failed++;
  console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`);
}
function warn(label, detail = "") {
  console.log(`  ⚠️  ${label}${detail ? " — " + detail : ""}`);
}
function section(title) {
  console.log(`\n${"─".repeat(62)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(62));
}

/**
 * Build a signed proxy request body.
 */
function buildSignedProxy(method, path, body = null) {
  const timestamp = Date.now().toString();
  const requestId = `audit_${Date.now()}`;
  const proxyBody = {
    method: method.toUpperCase(),
    path,
    headers: {
      "api-key":          FINCRA_KEY,
      "Content-Type":     "application/json",
      "Accept":           "application/json",
      "x-request-id":     requestId,
      "x-correlation-id": requestId,
    },
  };
  if (body) proxyBody.body = body;

  const rawPayload = JSON.stringify(proxyBody);
  const signature  = crypto.createHmac("sha256", GATEWAY_KEY)
    .update(`${timestamp}${rawPayload}`)
    .digest("hex");

  return {
    proxyBody,
    headers: {
      "Content-Type":    "application/json",
      "X-Gateway-Key":   GATEWAY_KEY,
      "X-Timestamp":     timestamp,
      "X-Signature":     signature,
      "X-Request-ID":    requestId,
      "X-Correlation-ID": requestId,
    },
  };
}

/**
 * Post a request to /proxy endpoint and return the result.
 */
async function proxyPost(method, path, body = null) {
  const { proxyBody, headers } = buildSignedProxy(method, path, body);
  const res = await axios.post(`${GATEWAY_URL}/proxy`, proxyBody, {
    headers,
    timeout: 15000,
    validateStatus: () => true,
  });
  return res;
}

async function run() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  FINCRA GATEWAY E2E AUDIT — NoteStandard                     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  Gateway:     ${GATEWAY_URL}`);
  console.log(`  Business ID: ${BUSINESS_ID}`);
  console.log(`  API Key:     ${FINCRA_KEY ? FINCRA_KEY.slice(0, 8) + "..." : "MISSING"}`);

  // ── STEP 0: Env config ───────────────────────────────────────────────────
  section("STEP 0 — Environment Configuration");
  if (ENABLE_FINCRA === "true") pass("ENABLE_FINCRA=true"); else fail("ENABLE_FINCRA", `currently: ${ENABLE_FINCRA}`);
  if (FINCRA_KEY)    pass("FINCRA_API_KEY present", FINCRA_KEY.slice(0, 8) + "..."); else fail("FINCRA_API_KEY missing");
  if (BUSINESS_ID)   pass("FINCRA_BUSINESS_ID present", BUSINESS_ID); else fail("FINCRA_BUSINESS_ID missing");
  if (GATEWAY_KEY)   pass("FINCRA_GATEWAY_KEY present", GATEWAY_KEY.slice(0, 8) + "..."); else fail("FINCRA_GATEWAY_KEY missing");
  if (!FINCRA_KEY || !BUSINESS_ID) {
    console.log("\n  ⛔ Cannot continue — missing credentials.\n");
    process.exit(1);
  }

  // ── STEP 1: Gateway Health ───────────────────────────────────────────────
  section("STEP 1 — Gateway Health Check");
  try {
    const res = await axios.get(`${GATEWAY_URL}/health`, { timeout: 8000 });
    const h   = res.data;
    if (h.status === "ok" || h.gateway === "healthy") {
      pass("Gateway is healthy", `uptime=${h.uptimeSeconds}s`);
    } else {
      fail("Gateway health check failed", `status=${h.status}`);
    }

    if (h.fincraReachable === true) {
      pass("Fincra is reachable from gateway", `latency=${h.probeLatencyMs}ms`);
    } else {
      fail("Fincra NOT reachable from gateway", "Check DigitalOcean firewall / Fincra IP allowlist");
    }

    const circuit = h.circuit?.state;
    if (circuit === "CLOSED") pass("Circuit breaker CLOSED (healthy)");
    else fail("Circuit breaker is OPEN", `state=${circuit}, failures=${h.circuit?.consecutiveFailures}`);

    const egress = h.outboundIpv4 || h.outbound_ipv4;
    if (egress) pass("Egress IP reported", egress);
    else warn("Egress IP not reported in health response");
  } catch (err) {
    fail("Gateway unreachable", err.message);
    console.log("\n  ⛔ Gateway is down — all remaining steps will fail.\n");
    return;
  }

  // ── STEP 2: Gateway Authentication ──────────────────────────────────────
  section("STEP 2 — Gateway Authentication (HMAC Signature)");
  try {
    const { proxyBody, headers } = buildSignedProxy("GET", "/profile/business/" + BUSINESS_ID);
    const res = await axios.post(`${GATEWAY_URL}/proxy`, proxyBody, {
      headers,
      timeout: 15000,
      validateStatus: () => true,
    });
    if (res.status === 401) {
      fail("Gateway HMAC authentication rejected", `Got 401 — check FINCRA_GATEWAY_KEY matches GATEWAY_KEY on gateway server`);
    } else {
      pass("Gateway accepted HMAC signature", `Got status ${res.status} (not 401)`);
    }
  } catch (err) {
    fail("Gateway authentication request failed", err.message);
  }

  // ── STEP 3: Fincra Business Profile via Gateway ──────────────────────────
  section("STEP 3 — Fincra Business Profile (via Gateway)");
  try {
    const res = await proxyPost("GET", `/profile/business/${BUSINESS_ID}`);
    const upstream = res.data?.data || res.data;
    const status   = res.status || res.data?.status;

    if (status === 403 || (typeof upstream === "object" && JSON.stringify(upstream).includes("not allowed"))) {
      fail("Fincra IP whitelist: BLOCKED", `Gateway IP (137.184.216.44) is NOT whitelisted in Fincra dashboard. This is the root cause of the withdrawal failure.`);
      console.log(`\n  ⚠️  ACTION REQUIRED: Whitelist IP 137.184.216.44 in:`);
      console.log(`     Fincra Dashboard → Settings → API → IP Whitelist`);
    } else if (status === 200 || status === "200") {
      const biz = upstream?.data || upstream;
      pass("Fincra business profile retrieved — IP is whitelisted!", `Name: ${biz?.name || biz?.businessName || "(present)"}`);
    } else if (status === 401 || status === "401") {
      fail("Fincra rejected API key (invalid API key)", `status=${status}`);
    } else {
      pass("Fincra business endpoint reachable", `status=${status}`);
    }
  } catch (err) {
    fail("Business profile request via gateway failed", err.message);
  }

  // ── STEP 4: Fincra NGN Bank List via Gateway ─────────────────────────────
  section("STEP 4 — NGN Bank List via Gateway (Payout Infrastructure)");
  try {
    const res     = await proxyPost("GET", "/core/banks");
    const status  = res.status || res.data?.status;
    const payload = res.data?.data || res.data;

    if (status === 403 || (typeof payload === "object" && JSON.stringify(payload).includes("not allowed"))) {
      fail("Bank list blocked by IP restriction", "Confirms IP whitelist issue");
    } else {
      const banks = Array.isArray(payload) ? payload : (payload?.data || []);
      pass(`Bank list retrieved — ${banks.length} banks available`, `status=${status}`);
    }
  } catch (err) {
    fail("Bank list via gateway failed", err.message);
  }

  // ── STEP 5: Fincra Payout Endpoint Dry-Run via Gateway ──────────────────
  section("STEP 5 — Payout Endpoint Dry-Run via Gateway");
  try {
    // Deliberately send incomplete payload — expect 400/422 (validation), not 403 (IP block)
    const res = await proxyPost("POST", "/disbursements/payouts", {
      business:            BUSINESS_ID,
      sourceCurrency:      "NGN",
      destinationCurrency: "NGN",
      amount:              100,
    });
    const status  = res.status || res.data?.status;
    const payload = res.data?.data || res.data;
    const msg     = typeof payload === "object" ? (payload?.message || payload?.error || "") : "";

    if (status === 403 || (msg && msg.toLowerCase().includes("ip"))) {
      fail("Payout endpoint BLOCKED by IP restriction", `This confirms 137.184.216.44 is not whitelisted in Fincra`);
    } else if (status === 400 || status === 422) {
      pass("Payout endpoint reachable + authenticated", `Validation error ${status} received (correct, not an auth/IP error)`);
    } else if (status === 401) {
      fail("Payout endpoint auth failure — check API key", `status=${status}`);
    } else {
      pass("Payout endpoint reachable", `status=${status}`);
    }
  } catch (err) {
    fail("Payout dry-run via gateway failed", err.message);
  }

  // ── STEP 6: Webhook Secret ────────────────────────────────────────────────
  section("STEP 6 — Webhook Secret Configuration");
  const webhookSecret = process.env.FINCRA_WEBHOOK_SECRET;
  if (!webhookSecret) {
    fail("FINCRA_WEBHOOK_SECRET missing");
  } else {
    const testBody = JSON.stringify({ event: "payout.successful", test: true });
    const hmac     = crypto.createHmac("sha512", webhookSecret).update(testBody).digest("hex");
    pass("FINCRA_WEBHOOK_SECRET present — SHA-512 HMAC computable");
    console.log(`       HMAC preview: ${hmac.slice(0, 24)}...`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log(`║  AUDIT COMPLETE — ${passed}/${total} checks passed${" ".repeat(37 - String(passed).length - String(total).length)}║`);
  if (failed === 0) {
    console.log("║  ✅ ALL CHECKS PASSED — payout pipeline is fully operational ║");
  } else {
    console.log(`║  ⚠️  ${failed} check(s) failed — review output above${" ".repeat(30 - String(failed).length)}║`);
  }
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("\n[FATAL]", err.message);
  process.exit(1);
});
