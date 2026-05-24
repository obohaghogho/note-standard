const { executeChaosTest } = require("./chaosExecutor");
const { CHAOS_THRESHOLDS } = require("./thresholdPolicy");
const { formatReport, writeReportToFile } = require("./reportFormatter");

// Phase 8.2 & 8.3 imports — self-contained, no server required
const { runChaos } = require("../accChaosLab");
const { certifyRun } = require("../replayCertification");

// ACC mock adapter for standalone CI execution (no live server required)
// The war-game contracts call acc.markLease / acc.sendMessage etc.
const accMock = {
  markLease: async ({ deviceId, leaseId }) => ({ leaseId, deviceId, status: "OK" }),
  evaluateSnapshot: async (snapshot) => ({ accepted: false }),
  markDelivered: async ({ messageId }) => ({ status: "OK", decision: "ALLOW" }),
  sendMessage: async ({ messageId, attempt }) => ({
    status: attempt > 0 ? "DELAY" : "OK",
    decision: attempt > 0 ? "DELAY" : "ALLOW"
  }),
  processWithClientTime: async ({ clientTime }) => ({ status: "OK", decision: "ALLOW" })
};

async function runCIGate() {
  const conversationId = `ci-${Date.now()}`;

  console.log("==== PHASE 6.3 — MESSAGING CHAOS GATE ====");
  const chaosResult = await executeChaosTest({
    baseUrl: process.env.API_URL || "http://localhost:3000",
    conversationId
  });

  console.log("==== PHASE 8.2 — ACC CHAOS LAB (Level 2) ====");
  const accResult = await runChaos(2, accMock);

  console.log("==== PHASE 8.3 — REPLAY CERTIFICATION ====");
  const certificate = await certifyRun(accResult.events);

  const report = formatReport(chaosResult, accResult, certificate);

  console.log("\n==== CHAOS GATE REPORT ====");
  console.log(JSON.stringify(report, null, 2));

  writeReportToFile(report);

  // ── HARD FAIL CONDITIONS ──────────────────────────────────────

  // Phase 6.3 checks
  if (!chaosResult.success) {
    console.error("❌ MESSAGING CHAOS GATE FAILED: Chaos result unsuccessful.");
    process.exit(1);
  }
  if (report.summary.totalAnomalies > CHAOS_THRESHOLDS.maxAnomalies) {
    console.error(`❌ MESSAGING CHAOS GATE FAILED: Anomalies (${report.summary.totalAnomalies}) > threshold (${CHAOS_THRESHOLDS.maxAnomalies}).`);
    process.exit(1);
  }
  if (report.summary.leaseConflicts > CHAOS_THRESHOLDS.maxLeaseConflicts) {
    console.error(`❌ MESSAGING CHAOS GATE FAILED: Lease conflicts (${report.summary.leaseConflicts}) > threshold (${CHAOS_THRESHOLDS.maxLeaseConflicts}).`);
    process.exit(1);
  }

  // Phase 8.2 checks
  if (report.summary.accViolations > CHAOS_THRESHOLDS.acc.maxViolations) {
    console.error(`❌ ACC CHAOS GATE FAILED: Invariant violations (${report.summary.accViolations}) > threshold (${CHAOS_THRESHOLDS.acc.maxViolations}).`);
    process.exit(1);
  }
  if (report.summary.accP95Latency > CHAOS_THRESHOLDS.acc.maxP95LatencyMs) {
    console.error(`❌ ACC CHAOS GATE FAILED: P95 latency (${report.summary.accP95Latency}ms) > budget (${CHAOS_THRESHOLDS.acc.maxP95LatencyMs}ms).`);
    process.exit(1);
  }

  // Phase 8.3 check
  if (CHAOS_THRESHOLDS.strictModes.blockOnCertificationFailure && !certificate.certified) {
    console.error(`❌ CERTIFICATION GATE FAILED: Replay certification was not granted. Hash: ${certificate.ledgerHash}`);
    process.exit(1);
  }

  console.log("\n✅ ALL CHAOS GATES PASSED");
  console.log(`   Ledger Hash : ${certificate.ledgerHash}`);
  console.log(`   State Hash  : ${certificate.stateHash}`);
  console.log(`   Certified   : ${certificate.certified}`);
  process.exit(0);
}

if (require.main === module) {
  runCIGate();
}

module.exports = { runCIGate };
