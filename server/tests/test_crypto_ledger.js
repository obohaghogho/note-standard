require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const CryptoLedgerService = require('../services/CryptoLedgerService');
const pool = require('../config/pgPool');
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');

async function testPhase2Gate() {
  console.log("=== [PHASE 2 VERIFICATION GATE] Testing CryptoLedgerService & Double-Entry Ledger ===");

  try {
    // Query existing users from profiles table
    const profilesRes = await pool.query(`SELECT id FROM public.profiles LIMIT 2`);
    let userA, userB;
    if (profilesRes.rows.length >= 2) {
      userA = profilesRes.rows[0].id;
      userB = profilesRes.rows[1].id;
    } else if (profilesRes.rows.length === 1) {
      userA = profilesRes.rows[0].id;
      userB = uuidv4(); // Try fallback or create
    } else {
      userA = uuidv4();
      userB = uuidv4();
    }

    console.log(`Using Test Users: User A = ${userA}, User B = ${userB}`);

    // Test 1: Wallet Auto-Provisioning
    console.log("\n[Test 1] Auto-provisioning crypto wallets for User A...");
    const walletsA = await CryptoLedgerService.getWallets(userA);
    assert.strictEqual(walletsA.length, 4, "Expected 4 wallets (BTC, ETH, USDT, USDC)");
    console.log("✓ User A Wallets provisioned:", walletsA.map(w => `${w.currency}: ${w.available_balance}`));

    // Get current balance of User A USDT
    const initWalletA = walletsA.find(w => w.currency === 'USDT');
    const initAvailA = parseFloat(initWalletA.available_balance);

    // Test 2: Credit Deposit + Double Entry + Idempotency
    console.log("\n[Test 2] Crediting 100 USDT deposit to User A...");
    const keyDep = `dep_key_${uuidv4()}`;
    const dep1 = await CryptoLedgerService.creditDeposit({
      userId: userA,
      currency: 'USDT',
      amount: 100.00,
      txHash: '0x123abc456def',
      idempotencyKey: keyDep,
      metadata: { network: 'TRC20' }
    });

    assert.strictEqual(dep1.success, true);
    const expectedAfterDep = (initAvailA + 100).toFixed(8);
    console.log(`✓ Deposit credited. New Available USDT balance: ${dep1.updatedWallet.available_balance}`);

    // Verify Double-Entry Journal line
    const entries = await pool.query(
      `SELECT le.*, da.account_code as debit_code, ca.account_code as credit_code
       FROM public.crypto_ledger_entries le
       JOIN public.crypto_accounts da ON le.debit_account_id = da.id
       JOIN public.crypto_accounts ca ON le.credit_account_id = ca.id
       WHERE le.transaction_id = $1`,
      [dep1.transaction.id]
    );
    assert.strictEqual(entries.rowCount, 1, "Expected 1 double-entry journal line");
    assert.strictEqual(entries.rows[0].debit_code, '1000-NOWPAYMENTS-USDT');
    assert.strictEqual(entries.rows[0].credit_code, '2000-USER-LIABILITIES');
    console.log("✓ Double-entry journal verified: Debit", entries.rows[0].debit_code, "-> Credit", entries.rows[0].credit_code);

    // Idempotency Retry
    console.log("\n[Test 2b] Testing Idempotency on duplicate deposit webhook...");
    const dep2 = await CryptoLedgerService.creditDeposit({
      userId: userA,
      currency: 'USDT',
      amount: 100.00,
      txHash: '0x123abc456def',
      idempotencyKey: keyDep
    });
    assert.strictEqual(dep2.idempotent, true, "Duplicate call must return idempotent=true");

    // Test 3: Lock Funds & Finalize Payout
    console.log("\n[Test 3] Testing Fund Locking & Payout Finalization...");
    const keyWd = `wd_key_${uuidv4()}`;
    const lockRes = await CryptoLedgerService.lockFunds({
      userId: userA,
      currency: 'USDT',
      amount: 30.00,
      fee: 2.00,
      idempotencyKey: keyWd
    });
    assert.strictEqual(lockRes.success, true);
    console.log("✓ Funds locked. Available:", lockRes.wallet.available_balance, "Locked:", lockRes.wallet.locked_balance);

    const payoutRes = await CryptoLedgerService.finalizePayout({
      transactionId: lockRes.transaction.id,
      providerId: 'NOWPAYMENTS',
      txHash: '0x789payout'
    });
    console.log("✓ Payout finalized. Remaining locked balance:", payoutRes.wallet.locked_balance);

    // Test 4: Internal Transfer (User A -> User B)
    if (userB && userB !== userA) {
      console.log("\n[Test 4] Testing Instant Internal Transfer (User A -> User B)...");
      const transferRes = await CryptoLedgerService.internalTransfer({
        senderId: userA,
        recipientId: userB,
        currency: 'USDT',
        amount: 20.00,
        fee: 0,
        idempotencyKey: `tx_key_${uuidv4()}`
      });
      assert.strictEqual(transferRes.success, true);
      console.log("✓ Internal transfer successful! Tx ID:", transferRes.transaction.id);
    }

    // Test 5: Atomic Swap
    console.log("\n[Test 5] Testing Atomic Swap (User A: 10 USDT -> BTC)...");
    const swapRes = await CryptoLedgerService.executeSwap({
      userId: userA,
      fromCurrency: 'USDT',
      toCurrency: 'BTC',
      fromAmount: 10.00,
      toAmount: 0.0002,
      fee: 0,
      idempotencyKey: `swap_key_${uuidv4()}`
    });
    assert.strictEqual(swapRes.success, true);
    console.log("✓ Swap completed! Tx ID:", swapRes.transaction.id);

    console.log("\n============================================================");
    console.log("=== [PHASE 2 VERIFICATION GATE] PASSED 100% CLEANLY ===");
    console.log("============================================================");
  } catch (err) {
    console.error("❌ Phase 2 Gate FAILED:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testPhase2Gate();
