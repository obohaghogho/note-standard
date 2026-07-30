require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
global.BOOT_STATE = { ready: true, services: { api: true, workers: true } };

const app = require('../app');
const pool = require('../config/pgPool');
const supabase = require('../config/database');
const cryptoLedgerService = require('../services/CryptoLedgerService');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');

async function testPhase6Gate() {
  console.log("=== [PHASE 6 VERIFICATION GATE] Testing Crypto REST APIs & Admin Endpoints ===");

  let server;
  const PORT = 5999;
  const BASE_URL = `http://localhost:${PORT}`;

  try {
    const profilesRes = await pool.query(`SELECT id, email FROM public.profiles LIMIT 2`);
    let userA, userB, emailA;
    if (profilesRes.rows.length >= 2) {
      userA = profilesRes.rows[0].id;
      emailA = profilesRes.rows[0].email;
      userB = profilesRes.rows[1].id;
    } else {
      userA = profilesRes.rows[0].id;
      emailA = profilesRes.rows[0].email;
      userB = profilesRes.rows[0].id;
    }

    // Mock Supabase Auth for integration test
    supabase.auth.getUser = async (token) => {
      if (token && token.length > 5) {
        return { data: { user: { id: userA, email: emailA } }, error: null };
      }
      return { data: { user: null }, error: { status: 401, message: "Invalid token" } };
    };

    // Start temporary HTTP server
    server = app.listen(PORT);
    await new Promise(r => setTimeout(r, 500));

    const tokenA = "mock_valid_token_test_1234567890";
    const authHeaders = { Authorization: `Bearer ${tokenA}` };

    // Test 1: GET /api/crypto/wallet
    console.log("\n[Test 1] Testing GET /api/crypto/wallet...");
    const resWallet = await axios.get(`${BASE_URL}/api/crypto/wallet`, { headers: authHeaders });
    assert.strictEqual(resWallet.status, 200);
    assert.strictEqual(resWallet.data.success, true);
    assert.ok(Array.isArray(resWallet.data.wallets), "Wallets array must be returned");
    console.log("✓ GET /api/crypto/wallet succeeded. Portfolio Value USD: $" + resWallet.data.portfolioValueUsd);

    // Test 2: GET /api/crypto/history
    console.log("\n[Test 2] Testing GET /api/crypto/history...");
    const resHistory = await axios.get(`${BASE_URL}/api/crypto/history`, { headers: authHeaders });
    assert.strictEqual(resHistory.status, 200);
    assert.strictEqual(resHistory.data.success, true);
    assert.ok(Array.isArray(resHistory.data.transactions));
    console.log("✓ GET /api/crypto/history succeeded. Txs count:", resHistory.data.transactions.length);

    // Test 3: POST /api/crypto/transfer with Idempotency Key
    console.log("\n[Test 3] Testing POST /api/crypto/transfer...");
    await cryptoLedgerService.creditDeposit({ userId: userA, currency: 'USDT', amount: 500, txHash: '0xapitest' });

    const transferKey = `api_tx_${uuidv4()}`;
    const resTransfer = await axios.post(
      `${BASE_URL}/api/crypto/transfer`,
      { recipientId: userB, currency: 'USDT', amount: 25.00 },
      { headers: { ...authHeaders, 'X-Idempotency-Key': transferKey } }
    );

    assert.strictEqual(resTransfer.status, 200);
    assert.strictEqual(resTransfer.data.success, true);
    console.log("✓ POST /api/crypto/transfer succeeded. Tx ID:", resTransfer.data.transaction.id);

    // Test 4: POST /api/crypto/withdraw ($15,000 multi-sig trigger)
    console.log("\n[Test 4] Testing POST /api/crypto/withdraw ($15,000 multi-sig trigger)...");
    // Credit 20,000 USDT to ensure sufficient balance for multi-sig withdrawal test
    await cryptoLedgerService.creditDeposit({ userId: userA, currency: 'USDT', amount: 20000, txHash: '0xbigdeposit' });

    const withdrawKey = `api_wd_${uuidv4()}`;
    const resWithdraw = await axios.post(
      `${BASE_URL}/api/crypto/withdraw`,
      {
        currency: 'USDT',
        amount: 15000,
        network: 'TRC20',
        destinationAddress: 'TYDzsYUEpvnYmQk4zGP9sWWcTEd2MiAtW6'
      },
      { headers: { ...authHeaders, 'X-Idempotency-Key': withdrawKey } }
    );

    assert.strictEqual(resWithdraw.status, 200);
    assert.strictEqual(resWithdraw.data.status, 'PENDING_APPROVAL');
    assert.strictEqual(resWithdraw.data.requiredApprovals, 2);
    console.log("✓ POST /api/crypto/withdraw held for multi-sig approval queue. Required approvals:", resWithdraw.data.requiredApprovals);

    // Test 5: Admin Endpoints
    console.log("\n[Test 5] Testing Admin Endpoints (Custody & Approvals Queue)...");
    const resCustody = await axios.get(`${BASE_URL}/api/admin/crypto/custody`, { headers: authHeaders });
    assert.strictEqual(resCustody.status, 200);
    assert.strictEqual(resCustody.data.success, true);
    console.log("✓ GET /api/admin/crypto/custody succeeded. Reserve Ratios count:", resCustody.data.reserveRatios.length);

    const resApprovals = await axios.get(`${BASE_URL}/api/admin/crypto/approvals`, { headers: authHeaders });
    assert.strictEqual(resApprovals.status, 200);
    assert.ok(resApprovals.data.pendingApprovals.length > 0, "Pending approvals queue should contain the $15k withdrawal");
    console.log("✓ GET /api/admin/crypto/approvals verified pending queue count:", resApprovals.data.pendingApprovals.length);

    console.log("\n============================================================");
    console.log("=== [PHASE 6 VERIFICATION GATE] PASSED 100% CLEANLY ===");
    console.log("============================================================");
  } catch (err) {
    console.error("❌ Phase 6 Gate FAILED:", err.response?.data || err.message);
    process.exit(1);
  } finally {
    if (server) server.close();
    await pool.end();
  }
}

testPhase6Gate();
