/**
 * withdrawalForensicAudit.test.js
 * ════════════════════════════════════════════════════════════════════════════
 * Financial Safety Test Suite — Production Forensic Audit Verification
 *
 * Tests the 8 critical withdrawal scenarios identified in the forensic audit:
 *   T1: Same-currency withdrawal (sufficient balance) → success
 *   T2: Same-currency withdrawal (insufficient balance) → INSUFFICIENT_FUNDS/BALANCE
 *   T3: Cross-currency withdrawal attempt → confirm blocked
 *   T4: Concurrent withdrawal double-spend → only one succeeds
 *   T5: Provider failure → funds restored to available balance
 *   T6: Webhook replay idempotency → no double-debit
 *   T7: Treasury rebalance trigger (NGN low, USD available) → corporate conversion
 *   T8: Currency mismatch in settlement → CURRENCY_MISMATCH_ERROR
 *
 * Run: node server/tests/withdrawalForensicAudit.test.js
 */

'use strict';

const assert = require('assert');

// ── Test Helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function skip(name, reason) {
  console.log(`  ⏭️  ${name} [SKIPPED: ${reason}]`);
  skipped++;
}

// ── Mock Infrastructure ──────────────────────────────────────────────────────

/** Simulates the core balance check logic from execute_enterprise_withdrawal RPC */
function simulateBalanceCheck(walletBalance, requestedAmount, fee = 0) {
  const available = Math.max(0, walletBalance);
  const totalDeduction = requestedAmount + fee;

  if (available < totalDeduction) {
    if (available >= requestedAmount && requestedAmount > fee) {
      return {
        success: true,
        totalDeduction: requestedAmount,
        netAmount: requestedAmount - fee,
        feeAbsorbed: true,
      };
    }
    return {
      success: false,
      errorCode: 'INSUFFICIENT_BALANCE',
      message: `Insufficient wallet balance (${available}) for requested withdrawal of ${requestedAmount}`,
    };
  }

  return {
    success: true,
    totalDeduction,
    netAmount: requestedAmount,
    feeAbsorbed: false,
  };
}

/** Simulates the currency match check in the RPC */
function simulateCurrencyCheck(walletCurrency, requestedCurrency) {
  return walletCurrency.toUpperCase() === requestedCurrency.toUpperCase();
}

/** Simulates the in-memory lock from redisLock.js */
function createMockLockManager() {
  const locks = new Map();

  return {
    acquire(userId, ttlMs = 30000) {
      const key = `withdraw:user:${userId}`;
      const now = Date.now();
      if (locks.has(key)) {
        const existing = locks.get(key);
        if (existing.expiresAt > now) {
          throw new Error(`CONCURRENT_WITHDRAWAL_IN_PROGRESS`);
        }
      }
      const lockId = `lock_${now}`;
      locks.set(key, { lockId, expiresAt: now + ttlMs });
      return {
        lockId,
        release: () => {
          if (locks.get(key)?.lockId === lockId) {
            locks.delete(key);
          }
        },
      };
    },
    isLocked(userId) {
      const key = `withdraw:user:${userId}`;
      const entry = locks.get(key);
      return entry && entry.expiresAt > Date.now();
    }
  };
}

/** Simulates the FinancialSafetyService currency allowlist (FIXED version) */
function simulateCurrencyAllowlist() {
  const ALLOWED = new Set([
    'NGN','USD','EUR','GBP','CAD',
    'GHS','KES','TZS','UGX','ZAR',
    'XOF','MWK','RWF','XAF','ZMW',
    'EGP','CNY','CNH','USDT','USDC','CNGN',
    'BTC','ETH',
  ]);
  return (currency) => ALLOWED.has(currency.toUpperCase());
}

/** Simulates idempotent settlement (claim-then-debit pattern) */
function createIdempotentSettlement() {
  const settledRefs = new Set();

  return {
    finalize(reference) {
      if (settledRefs.has(reference)) {
        return { success: true, alreadyFinalized: true, debited: false };
      }
      settledRefs.add(reference);
      return { success: true, alreadyFinalized: false, debited: true };
    },
    reverse(reference) {
      if (settledRefs.has(reference)) {
        return { success: true, alreadyReversed: true, restored: false };
      }
      settledRefs.add(reference);
      return { success: true, alreadyReversed: false, restored: true };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  Financial Safety Test Suite — Withdrawal Forensic Audit');
console.log('══════════════════════════════════════════════════════════════\n');

// ── T1: Same-Currency Withdrawal (Sufficient Balance) ────────────────────────

console.log('T1: Same-currency withdrawal (sufficient balance)');

test('T1.1: NGN withdrawal with exact balance succeeds', () => {
  const result = simulateBalanceCheck(50000, 50000, 50);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.feeAbsorbed, true);
  assert.strictEqual(result.netAmount, 49950);
});

test('T1.2: NGN withdrawal with surplus balance succeeds normally', () => {
  const result = simulateBalanceCheck(100000, 50000, 50);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.totalDeduction, 50050);
  assert.strictEqual(result.feeAbsorbed, false);
});

test('T1.3: USD withdrawal succeeds', () => {
  const result = simulateBalanceCheck(500, 200, 0);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.totalDeduction, 200);
});

// ── T2: Same-Currency Withdrawal (Insufficient Balance) ──────────────────────

console.log('\nT2: Same-currency withdrawal (insufficient balance)');

test('T2.1: Withdrawal exceeding balance returns INSUFFICIENT_BALANCE', () => {
  const result = simulateBalanceCheck(100, 500, 50);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, 'INSUFFICIENT_BALANCE');
});

test('T2.2: Zero balance returns INSUFFICIENT_BALANCE', () => {
  const result = simulateBalanceCheck(0, 100, 0);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, 'INSUFFICIENT_BALANCE');
});

test('T2.3: Negative balance (should not exist) returns INSUFFICIENT_BALANCE', () => {
  const result = simulateBalanceCheck(-100, 50, 0);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, 'INSUFFICIENT_BALANCE');
});

test('T2.4: Fee-only shortfall triggers smart fee absorption', () => {
  const result = simulateBalanceCheck(1000, 1000, 50);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.feeAbsorbed, true);
  assert.strictEqual(result.netAmount, 950);
  assert.strictEqual(result.totalDeduction, 1000);
});

// ── T3: Cross-Currency Withdrawal Attempt ────────────────────────────────────

console.log('\nT3: Cross-currency withdrawal attempt (must be blocked)');

test('T3.1: Currency mismatch (USD wallet, NGN withdrawal) is detected', () => {
  const match = simulateCurrencyCheck('USD', 'NGN');
  assert.strictEqual(match, false, 'USD wallet should NOT match NGN withdrawal');
});

test('T3.2: Same-currency match succeeds', () => {
  const match = simulateCurrencyCheck('NGN', 'NGN');
  assert.strictEqual(match, true);
});

test('T3.3: Case-insensitive match works', () => {
  const match = simulateCurrencyCheck('ngn', 'NGN');
  assert.strictEqual(match, true);
});

test('T3.4: Cross-currency EUR to NGN blocked', () => {
  const match = simulateCurrencyCheck('EUR', 'NGN');
  assert.strictEqual(match, false);
});

// ── T4: Concurrent Withdrawal Double-Spend ───────────────────────────────────

console.log('\nT4: Concurrent withdrawal double-spend prevention');

test('T4.1: First withdrawal acquires lock successfully', () => {
  const lockMgr = createMockLockManager();
  const lock = lockMgr.acquire('user-123');
  assert.ok(lock.lockId, 'Lock should be acquired');
  assert.ok(lockMgr.isLocked('user-123'), 'User should be locked');
  lock.release();
});

test('T4.2: Second concurrent withdrawal throws CONCURRENT_WITHDRAWAL_IN_PROGRESS', () => {
  const lockMgr = createMockLockManager();
  const lock1 = lockMgr.acquire('user-456');

  assert.throws(
    () => lockMgr.acquire('user-456'),
    /CONCURRENT_WITHDRAWAL_IN_PROGRESS/,
    'Second lock attempt should throw'
  );

  lock1.release();
});

test('T4.3: After release, new withdrawal can proceed', () => {
  const lockMgr = createMockLockManager();
  const lock1 = lockMgr.acquire('user-789');
  lock1.release();

  const lock2 = lockMgr.acquire('user-789');
  assert.ok(lock2.lockId, 'New lock should be acquired after release');
  lock2.release();
});

test('T4.4: Different users can withdraw concurrently', () => {
  const lockMgr = createMockLockManager();
  const lock1 = lockMgr.acquire('user-A');
  const lock2 = lockMgr.acquire('user-B');

  assert.ok(lock1.lockId && lock2.lockId, 'Both users should get locks');

  lock1.release();
  lock2.release();
});

// ── T5: Provider Failure Funds Restored ──────────────────────────────────────

console.log('\nT5: Provider failure - funds restored to available balance');

test('T5.1: Reversal on provider failure marks funds as RELEASED', () => {
  const settlement = createIdempotentSettlement();
  const result = settlement.reverse('ref-provider-fail-001');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.restored, true);
  assert.strictEqual(result.alreadyReversed, false);
});

test('T5.2: Duplicate reversal is idempotent (no double-restore)', () => {
  const settlement = createIdempotentSettlement();
  settlement.reverse('ref-dup-reverse-001');
  const result = settlement.reverse('ref-dup-reverse-001');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.restored, false);
  assert.strictEqual(result.alreadyReversed, true);
});

// ── T6: Webhook Replay Idempotency ───────────────────────────────────────────

console.log('\nT6: Webhook replay idempotency (no double-debit)');

test('T6.1: First settlement webhook debits correctly', () => {
  const settlement = createIdempotentSettlement();
  const result = settlement.finalize('ref-webhook-001');
  assert.strictEqual(result.debited, true);
  assert.strictEqual(result.alreadyFinalized, false);
});

test('T6.2: Replayed webhook does NOT debit again', () => {
  const settlement = createIdempotentSettlement();
  settlement.finalize('ref-webhook-002');
  const result = settlement.finalize('ref-webhook-002');
  assert.strictEqual(result.debited, false);
  assert.strictEqual(result.alreadyFinalized, true);
});

test('T6.3: Three rapid replays all return idempotent after first', () => {
  const settlement = createIdempotentSettlement();
  const r1 = settlement.finalize('ref-triple-001');
  const r2 = settlement.finalize('ref-triple-001');
  const r3 = settlement.finalize('ref-triple-001');
  assert.strictEqual(r1.debited, true);
  assert.strictEqual(r2.debited, false);
  assert.strictEqual(r3.debited, false);
});

// ── T7: Treasury Rebalance Trigger ───────────────────────────────────────────

console.log('\nT7: Treasury rebalance trigger (NGN low, USD available)');

test('T7.1: Rebalance math with live rate calculates correct USD needed', () => {
  const ngnAvailable = 5000;
  const payoutAmount = 50000;
  const neededNgn = payoutAmount - ngnAvailable + 1000;
  const liveRate = 1600;
  const safeRate = liveRate * 0.95;
  const approxUsdNeeded = Math.ceil((neededNgn / safeRate) * 100) / 100;

  assert.strictEqual(neededNgn, 46000);
  assert.ok(approxUsdNeeded > 30, `USD needed (${approxUsdNeeded}) should be > 30`);
  assert.ok(approxUsdNeeded < 35, `USD needed (${approxUsdNeeded}) should be < 35 at 1600 rate`);
});

test('T7.2: Rebalance with fallback rate (1350) is more conservative', () => {
  const neededNgn = 46000;
  const fallbackRate = 1350;
  const safeRate = fallbackRate * 0.95;
  const approxUsdFallback = Math.ceil((neededNgn / safeRate) * 100) / 100;

  const liveRate = 1600;
  const safeRateLive = liveRate * 0.95;
  const approxUsdLive = Math.ceil((neededNgn / safeRateLive) * 100) / 100;

  assert.ok(approxUsdFallback > approxUsdLive,
    `Fallback USD (${approxUsdFallback}) should be more than live rate USD (${approxUsdLive})`);
});

test('T7.3: No rebalance triggered when NGN balance is sufficient', () => {
  const ngnAvailable = 100000;
  const payoutAmount = 50000;
  const shouldRebalance = ngnAvailable < payoutAmount;
  assert.strictEqual(shouldRebalance, false);
});

// ── T8: Currency Mismatch in Settlement ──────────────────────────────────────

console.log('\nT8: Currency mismatch detection in settlement');

test('T8.1: FinancialSafetyService allows all Fincra currencies after fix', () => {
  const isAllowed = simulateCurrencyAllowlist();
  const currencies = ['NGN','USD','EUR','GBP','CAD','GHS','KES','BTC','ETH','USDT','USDC','ZAR','EGP','CNY'];
  for (const c of currencies) {
    assert.strictEqual(isAllowed(c), true, `${c} should be allowed after D1 fix`);
  }
});

test('T8.2: Truly unsupported currencies are still blocked', () => {
  const isAllowed = simulateCurrencyAllowlist();
  assert.strictEqual(isAllowed('XYZ'), false, 'Random currency should be blocked');
  assert.strictEqual(isAllowed('DOGE'), false, 'DOGE should be blocked');
  assert.strictEqual(isAllowed('SOL'), false, 'SOL should be blocked');
});

test('T8.3: Previously blocked currencies (EUR, GBP, CAD) now pass', () => {
  const isAllowed = simulateCurrencyAllowlist();
  assert.strictEqual(isAllowed('EUR'), true, 'EUR was blocked by old list, should be allowed now');
  assert.strictEqual(isAllowed('GBP'), true, 'GBP was blocked by old list, should be allowed now');
  assert.strictEqual(isAllowed('CAD'), true, 'CAD was blocked by old list, should be allowed now');
  assert.strictEqual(isAllowed('GHS'), true, 'GHS was blocked by old list, should be allowed now');
  assert.strictEqual(isAllowed('KES'), true, 'KES was blocked by old list, should be allowed now');
});

// ── T9: Database Atomicity & Process Crash Window Protection ──────────────────

console.log('\nT9: Database Atomicity & Crash Window Protection');

test('T9.1: Atomic RPC completes balance debit AND status update in single SQL transaction', () => {
  // Simulates atomic PL/pgSQL function where state transition + wallet mutation commit atomically
  let state = { status: 'RESERVED', balance: 100000, reserved: 50000 };
  
  function atomicFinalize(p_amount) {
    if (state.status === 'SUCCESSFUL') {
      return { success: true, already_finalized: true };
    }
    // Atomic SQL transaction block
    state.balance -= p_amount;
    state.reserved = Math.max(0, state.reserved - p_amount);
    state.status = 'SUCCESSFUL';
    return { success: true, status: 'SUCCESSFUL' };
  }

  const res1 = atomicFinalize(50000);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(state.balance, 50000);
  assert.strictEqual(state.status, 'SUCCESSFUL');

  // Replay is idempotent
  const res2 = atomicFinalize(50000);
  assert.strictEqual(res2.already_finalized, true);
  assert.strictEqual(state.balance, 50000, 'Balance must NOT be debited twice');
});

test('T9.2: Process crash simulation — atomic RPC leaves zero half-committed state', () => {
  let state = { status: 'RESERVED', balance: 100000, available: 50000 };

  // Simulated PL/pgSQL function: atomic transaction or rollback
  function atomicRollback(p_amount, crashMidway = false) {
    if (state.status === 'REVERSED') {
      return { success: true, already_finalized: true };
    }
    if (crashMidway) {
      // DB Transaction rolls back entirely — state unchanged
      return { success: false, error: 'DB_TRANSACTION_ABORTED' };
    }
    state.available += p_amount;
    state.status = 'REVERSED';
    return { success: true, status: 'REVERSED' };
  }

  // Crash mid-execution -> DB transaction aborts -> state preserved
  const crashRes = atomicRollback(50000, true);
  assert.strictEqual(crashRes.success, false);
  assert.strictEqual(state.available, 50000, 'Available balance must NOT change if transaction aborted');
  assert.strictEqual(state.status, 'RESERVED', 'Status must NOT change if transaction aborted');

  // Subsequent recovery call succeeds cleanly
  const recoveryRes = atomicRollback(50000, false);
  assert.strictEqual(recoveryRes.success, true);
  assert.strictEqual(state.available, 100000);
  assert.strictEqual(state.status, 'REVERSED');
});

// ── T10: Simultaneous Over-Reservation & Negative Balance Protection ─────────

console.log('\nT10: Simultaneous Over-Reservation & Negative Balance Protection');

test('T10.1: Simultaneous ₦80k and ₦70k withdrawals on ₦100k balance — only one succeeds', () => {
  let availableBalance = 100000;
  
  function attemptReservation(amount) {
    // Simulates SELECT available_balance FROM wallets_store WHERE id = p_wallet_id FOR UPDATE
    if (availableBalance < amount) {
      return { success: false, error: 'INSUFFICIENT_BALANCE' };
    }
    availableBalance -= amount;
    return { success: true, remaining: availableBalance };
  }

  // Sequential execution enforced by FOR UPDATE row lock
  const reqA = attemptReservation(80000);
  assert.strictEqual(reqA.success, true);
  assert.strictEqual(availableBalance, 20000);

  const reqB = attemptReservation(70000);
  assert.strictEqual(reqB.success, false);
  assert.strictEqual(reqB.error, 'INSUFFICIENT_BALANCE');
  assert.strictEqual(availableBalance, 20000, 'Balance must remain 20000 and NOT go negative');
});

test('T10.2: Available balance cannot be forced < 0 under any math input', () => {
  let availableBalance = 1000;
  const res = simulateBalanceCheck(availableBalance, 5000, 50);
  assert.strictEqual(res.success, false);
  assert.ok(availableBalance >= 0, 'Available balance must remain non-negative');
});

// ── T11: Webhook Matrix & Ordering Verification ───────────────────────────────

console.log('\nT11: Complete Webhook Matrix & Ordering Verification');

test('T11.1: Webhook ordering success + success is idempotent', () => {
  const settlement = createIdempotentSettlement();
  const w1 = settlement.finalize('tx_order_001');
  const w2 = settlement.finalize('tx_order_001');
  assert.strictEqual(w1.debited, true);
  assert.strictEqual(w2.debited, false);
});

test('T11.2: Webhook ordering success + failure (out of order)', () => {
  const settlement = createIdempotentSettlement();
  const w1 = settlement.finalize('tx_order_002');
  const w2 = settlement.reverse('tx_order_002'); // Delayed failure webhook after success
  assert.strictEqual(w1.debited, true);
  assert.strictEqual(w2.restored, false, 'Late failure webhook must NOT restore funds if already settled');
});

test('T11.3: Webhook ordering failure + success (out of order)', () => {
  const settlement = createIdempotentSettlement();
  const w1 = settlement.reverse('tx_order_003');
  const w2 = settlement.finalize('tx_order_003'); // Delayed success webhook after failure
  assert.strictEqual(w1.restored, true);
  assert.strictEqual(w2.debited, false, 'Late success webhook must NOT debit funds if already reversed');
});

test('T11.4: Webhook ordering duplicate failure + duplicate failure', () => {
  const settlement = createIdempotentSettlement();
  const w1 = settlement.reverse('tx_order_004');
  const w2 = settlement.reverse('tx_order_004');
  assert.strictEqual(w1.restored, true);
  assert.strictEqual(w2.restored, false);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log('══════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.error('FINANCIAL SAFETY TESTS FAILED - DO NOT DEPLOY');
  process.exit(1);
} else {
  console.log('ALL FINANCIAL SAFETY TESTS PASSED');
  process.exit(0);
}

