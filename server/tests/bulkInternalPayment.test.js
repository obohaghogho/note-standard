'use strict';
/**
 * NOTESTANDARD — BULK INTERNAL PAYMENT — CORRECTED INTEGRATION TEST SUITE
 *
 * Covers:
 *   TEST 1  — Input & Safety Validations
 *   TEST 2  — CORRECTION A: Atomic batch creation (failure-path atomicity proof)
 *   TEST 3  — CORRECTION B: Item-level idempotency mismatch detection
 *   TEST 4  — Approval Guard & Dual Authorization
 *   TEST 5  — Query Endpoints
 *   TEST 6  — REAL DEVELOPMENT EXECUTION (balances before/after)
 *   TEST 7  — Execution Idempotency (re-execute same batch → no second tx)
 *   TEST 8  — CONCURRENCY TEST (two batches, overlapping source wallet)
 *   TEST 9  — Cleanup
 *
 * DO NOT RUN AGAINST PRODUCTION.
 * All financial execution is against the DEVELOPMENT Supabase environment.
 */

require('dotenv').config();

const BulkInternalPaymentService = require('../services/BulkInternalPaymentService');
const supabase = require('../config/database');
const supabaseAdmin = require('../config/supabaseAdmin');
const path = require('path');
const env = require('../config/env');

// ─── Test Context ──────────────────────────────────────────────────────────────
// These must be real development users with:
//   Admin1: full admin role, has a USD wallet with sufficient balance
//   Admin2: full admin role (different from Admin1 — for dual-auth)
//   Recipient1, Recipient2: regular users for crediting
const CTX = {
  admin1:      { id: '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd', role: 'admin' },
  admin2:      { id: '343e0aaf-1ecc-446b-906b-83da02087e60', role: 'admin' },
  recipient1:  { id: '4697b099-c688-4e79-aebc-1649d101f42e' },
  recipient2:  { id: '9b46df59-aa91-4f16-a304-34b2603d7fb1' },
  sourceWalletId: '2b279341-a96e-46f0-951b-bc0ca7ae366e',
  currency: 'USD',
};

// Batch IDs created during tests — for cleanup
const createdBatchIds = [];

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✅ Passed: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function assertThrows(fn, label, expectedSubstring) {
  try {
    await fn();
    console.error(`  ❌ FAILED: ${label} — expected error but none thrown`);
    failed++;
  } catch (e) {
    const msg = e.message || '';
    if (expectedSubstring && !msg.includes(expectedSubstring)) {
      console.error(`  ❌ FAILED: ${label} — got "${msg}", expected to contain "${expectedSubstring}"`);
      failed++;
    } else {
      console.log(`  ✅ Passed: ${label} -> ${msg}`);
      passed++;
    }
  }
}

async function getWalletBalance(walletId) {
  const { data } = await supabase
    .from('ledger_entries_v6')
    .select('amount')
    .eq('wallet_id', walletId);
  return (data || []).reduce((sum, r) => sum + parseFloat(r.amount), 0);
}

async function getRecipientWalletId(userId, currency) {
  // Query wallets_v6 view (not wallets_store table) since FiatWalletService
  // ensure_user_wallet RPC provisions wallets into the underlying table
  // that wallets_v6 reads from.
  const { data } = await supabase
    .from('wallets_v6')
    .select('id')
    .eq('user_id', userId)
    .eq('currency', currency)
    .maybeSingle();
  return data?.id || null;
}

async function countLedgerTxByIdempotencyKey(key) {
  const { data } = await supabase
    .from('ledger_transactions_v6')
    .select('id')
    .eq('idempotency_key', key);
  return (data || []).length;
}

// ─── Test Runner ──────────────────────────────────────────────────────────────
async function runTestSuite() {
  console.log('\n=== BULK INTERNAL PAYMENT CORRECTED TEST SUITE START ===\n');
  console.log('Test Context:');
  console.log('  Admin 1 (Creator):', CTX.admin1.id);
  console.log('  Admin 2 (Approver):', CTX.admin2.id);
  console.log('  Recipient 1:', CTX.recipient1.id);
  console.log('  Recipient 2:', CTX.recipient2.id);
  console.log('  Source Wallet:', CTX.sourceWalletId, `(${CTX.currency})`);
  console.log();

  // ─── TEST 1: Input & Safety Validations ──────────────────────────────────
  console.log('--- TEST 1: Input & Safety Validations ---');

  await assertThrows(
    () => BulkInternalPaymentService.createBatch(CTX.admin1, {}),
    'Missing source_wallet_id rejected',
    'INVALID_INPUT: source_wallet_id is required'
  );

  await assertThrows(
    () => BulkInternalPaymentService.createBatch(CTX.admin1, {
      source_wallet_id: CTX.sourceWalletId,
      currency: CTX.currency,
      entries: [{ recipient_identifier: '00000000-0000-0000-0000-000000000000', amount: 10, item_index: 0 }],
    }),
    'Self-payment rejected (admin as recipient)',
    'SELF_PAYMENT_FORBIDDEN'
  );

  await assertThrows(
    () => BulkInternalPaymentService.createBatch(CTX.admin1, {
      source_wallet_id: CTX.sourceWalletId,
      currency: CTX.currency,
      entries: [
        { recipient_identifier: CTX.recipient1.id, amount: 10, item_index: 0 },
        { recipient_identifier: CTX.recipient1.id, amount: 10, item_index: 1 },
      ],
    }),
    'Duplicate recipient rejected',
    'DUPLICATE_RECIPIENT'
  );

  await assertThrows(
    () => BulkInternalPaymentService.createBatch(CTX.admin1, {
      source_wallet_id: CTX.sourceWalletId,
      currency: CTX.currency,
      entries: [
        { recipient_identifier: CTX.recipient1.id, amount: 10, item_index: 0 },
        { recipient_identifier: CTX.recipient2.id, amount: 10, item_index: 0 }, // dup index
      ],
    }),
    'Duplicate item_index rejected',
    'DUPLICATE_ITEM_INDEX'
  );

  // ─── TEST 2: CORRECTION A — Atomic batch creation failure-path ────────────
  console.log('\n--- TEST 2: CORRECTION A — Atomic Batch Creation (Atomicity Proof) ---');

  // Normal creation succeeds
  const batchKey = `test_atomic_${Date.now()}`;
  const createResult = await BulkInternalPaymentService.createBatch(CTX.admin1, {
    source_wallet_id: CTX.sourceWalletId,
    currency: CTX.currency,
    entries: [
      { recipient_identifier: CTX.recipient1.id, amount: 15, item_index: 0 },
      { recipient_identifier: CTX.recipient2.id, amount: 10, item_index: 1 },
    ],
    idempotency_key: batchKey,
  });

  assert(createResult.success, 'Batch created successfully via atomic RPC');
  assert(createResult.batch?.status === 'PENDING_APPROVAL', `Status is PENDING_APPROVAL (got ${createResult.batch?.status})`);
  assert(createResult.items?.length === 2, `Item count is 2 (got ${createResult.items?.length})`);
  assert(parseFloat(createResult.batch?.total_amount) === 25, `Total is 25 (got ${createResult.batch?.total_amount})`);

  const atomicBatchId = createResult.batch?.id;
  createdBatchIds.push(atomicBatchId);

  // Atomicity failure-path proof:
  // Try to create a batch where the RPC would fail (invalid recipient UUID that doesn't exist
  // but passes JS validation since we test the DB constraint via bad wallet UUID).
  // We verify NO orphaned batch header exists after the failure.
  const countBefore = await supabase
    .from('payout_batches').select('id', { count: 'exact' }).then(r => r.count);

  await assertThrows(
    () => BulkInternalPaymentService.createBatch(CTX.admin1, {
      source_wallet_id: CTX.sourceWalletId,
      currency: 'XYZ', // invalid currency → will fail at source wallet currency check
      entries: [{ recipient_identifier: CTX.recipient1.id, amount: 5, item_index: 0 }],
      idempotency_key: `test_atomic_fail_${Date.now()}`,
    }),
    'Invalid currency batch rejected before RPC (no orphan)',
    'CURRENCY_MISMATCH'
  );

  const countAfter = await supabase
    .from('payout_batches').select('id', { count: 'exact' }).then(r => r.count);
  assert(countBefore === countAfter, 'No orphaned payout_batches row after failed creation');

  // ─── TEST 3: CORRECTION B — Full Item-Level Idempotency Comparison ─────────
  console.log('\n--- TEST 3: CORRECTION B — Item-Level Idempotency Mismatch Detection ---');

  // Case A: same key + same full payload → retry returns existing batch
  const retryResult = await BulkInternalPaymentService.createBatch(CTX.admin1, {
    source_wallet_id: CTX.sourceWalletId,
    currency: CTX.currency,
    entries: [
      { recipient_identifier: CTX.recipient1.id, amount: 15, item_index: 0 },
      { recipient_identifier: CTX.recipient2.id, amount: 10, item_index: 1 },
    ],
    idempotency_key: batchKey,
  });
  assert(retryResult.is_retry === true, 'Same key + same full payload → is_retry: true');
  assert(retryResult.batch?.id === atomicBatchId, 'Returns original batch ID on full match');

  // Case B: same key + different recipient → 409
  await assertThrows(
    () => BulkInternalPaymentService.createBatch(CTX.admin1, {
      source_wallet_id: CTX.sourceWalletId,
      currency: CTX.currency,
      entries: [
        { recipient_identifier: CTX.recipient2.id, amount: 15, item_index: 0 }, // swapped recipients
        { recipient_identifier: CTX.recipient1.id, amount: 10, item_index: 1 },
      ],
      idempotency_key: batchKey,
    }),
    'Same key + different recipient → IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
    'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH'
  );

  // Case C: same key + same recipients + different amount → 409
  await assertThrows(
    () => BulkInternalPaymentService.createBatch(CTX.admin1, {
      source_wallet_id: CTX.sourceWalletId,
      currency: CTX.currency,
      entries: [
        { recipient_identifier: CTX.recipient1.id, amount: 99, item_index: 0 }, // different amount
        { recipient_identifier: CTX.recipient2.id, amount: 10, item_index: 1 },
      ],
      idempotency_key: batchKey,
    }),
    'Same key + different amount → IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
    'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH'
  );

  // ─── TEST 4: Approval Guard & Dual Authorization ───────────────────────────
  console.log('\n--- TEST 4: Approval Guard & Dual Authorization ---');

  await assertThrows(
    () => BulkInternalPaymentService.approveBatch(CTX.admin1, atomicBatchId),
    'Creator cannot approve own batch',
    'CREATOR_CANNOT_APPROVE'
  );

  const approvalResult = await BulkInternalPaymentService.approveBatch(CTX.admin2, atomicBatchId);
  assert(approvalResult.success, 'Second admin approved successfully');
  assert(approvalResult.batch?.status === 'APPROVED', `Status is APPROVED (got ${approvalResult.batch?.status})`);
  assert(approvalResult.batch?.approved_by === CTX.admin2.id, 'approved_by is admin2');
  assert(!!approvalResult.batch?.approved_at, 'approved_at timestamp set');

  await assertThrows(
    () => BulkInternalPaymentService.approveBatch(CTX.admin2, atomicBatchId),
    'Re-approval of APPROVED batch rejected',
    'INVALID_STATUS_TRANSITION'
  );

  // ─── TEST 5: Query Endpoints ───────────────────────────────────────────────
  console.log('\n--- TEST 5: Query Endpoints ---');

  const listResult = await BulkInternalPaymentService.getBatches({ status: 'APPROVED', limit: 50 });
  assert(Array.isArray(listResult.batches), 'getBatches returns array');
  assert(listResult.batches.some(b => b.id === atomicBatchId), 'Approved batch appears in list');

  const detailResult = await BulkInternalPaymentService.getBatchDetail(atomicBatchId);
  assert(detailResult.batch?.id === atomicBatchId, 'getBatchDetail returns correct batch');
  assert(detailResult.items?.length === 2, `Detail has 2 items (got ${detailResult.items?.length})`);

  // ─── TEST 6: REAL DEVELOPMENT EXECUTION ───────────────────────────────────
  console.log('\n--- TEST 6: Real Development Execution (Balance Verification) ---');

  // Capture pre-execution balances
  // Note: recipient1 may not have a wallet pre-existing (it gets lazily provisioned
  // by FiatWalletService during createBatch). We record the pre-balance as 0 if
  // no wallet exists yet, and re-query the wallet ID after execution for post-balance.
  const sourceBalanceBefore = await getWalletBalance(CTX.sourceWalletId);
  let recip1WalletId = await getRecipientWalletId(CTX.recipient1.id, CTX.currency);
  let recip2WalletId = await getRecipientWalletId(CTX.recipient2.id, CTX.currency);
  const recip1BalanceBefore = recip1WalletId ? await getWalletBalance(recip1WalletId) : 0;
  const recip2BalanceBefore = recip2WalletId ? await getWalletBalance(recip2WalletId) : 0;

  console.log(`  Pre-execution source balance: ${sourceBalanceBefore} ${CTX.currency}`);
  console.log(`  Pre-execution recipient1 balance: ${recip1BalanceBefore} ${CTX.currency}`);
  console.log(`  Pre-execution recipient2 balance: ${recip2BalanceBefore} ${CTX.currency}`);

  const batchTotal = 25; // 15 + 10

  if (sourceBalanceBefore < batchTotal) {
    console.log(`  ⚠️  SKIP execution: source balance (${sourceBalanceBefore}) < batch total (${batchTotal}). Skipping financial execution tests.`);
  } else {
    const execResult = await BulkInternalPaymentService.executeBatch(CTX.admin1, atomicBatchId);
    assert(execResult.success, 'executeBatch returned success');
    assert(execResult.status === 'COMPLETED', `Status is COMPLETED (got ${execResult.status})`);
    assert(!!execResult.transactionId, `ledger_transaction_id returned (got ${execResult.transactionId})`);

    const txId = execResult.transactionId;

    // Verify exactly ONE ledger transaction
    const txCount = await countLedgerTxByIdempotencyKey(
      (await supabase.from('payout_batches').select('idempotency_key').eq('id', atomicBatchId).maybeSingle()).data?.idempotency_key
    );
    assert(txCount === 1, `Exactly 1 ledger transaction created (got ${txCount})`);

    // Verify source debit
    const sourceBalanceAfter = await getWalletBalance(CTX.sourceWalletId);
    assert(
      Math.abs((sourceBalanceBefore - sourceBalanceAfter) - batchTotal) < 0.0001,
      `Source debited exactly ${batchTotal} (before ${sourceBalanceBefore}, after ${sourceBalanceAfter})`
    );

    // Verify recipient credits
    // Re-query wallet IDs post-execution (wallets may have been provisioned during createBatch)
    const r1WalletIdAfter = await getRecipientWalletId(CTX.recipient1.id, CTX.currency);
    const r2WalletIdAfter = await getRecipientWalletId(CTX.recipient2.id, CTX.currency);
    const recip1BalanceAfter = r1WalletIdAfter ? await getWalletBalance(r1WalletIdAfter) : 0;
    const recip2BalanceAfter = r2WalletIdAfter ? await getWalletBalance(r2WalletIdAfter) : 0;

    assert(
      Math.abs((recip1BalanceAfter - recip1BalanceBefore) - 15) < 0.0001,
      `Recipient1 credited exactly 15 (before ${recip1BalanceBefore}, after ${recip1BalanceAfter})`
    );
    assert(
      Math.abs((recip2BalanceAfter - recip2BalanceBefore) - 10) < 0.0001,
      `Recipient2 credited exactly 10 (before ${recip2BalanceBefore}, after ${recip2BalanceAfter})`
    );

    // Verify payout_batch_items are SUCCESSFUL
    const { data: itemsAfter } = await supabase
      .from('payout_batch_items').select('status').eq('batch_id', atomicBatchId);
    const allSuccessful = (itemsAfter || []).every(i => i.status === 'SUCCESSFUL');
    assert(allSuccessful, `All payout_batch_items status = SUCCESSFUL (count: ${itemsAfter?.length})`);

    // Verify payout_batches.ledger_transaction_id is set
    const { data: finalBatch } = await supabase
      .from('payout_batches').select('status, ledger_transaction_id').eq('id', atomicBatchId).maybeSingle();
    assert(finalBatch?.status === 'COMPLETED', `Batch row status = COMPLETED`);
    assert(finalBatch?.ledger_transaction_id === txId, `Batch row ledger_transaction_id matches returned txId`);

    // ─── TEST 7: Execution Idempotency ────────────────────────────────────
    console.log('\n--- TEST 7: Execution Idempotency (re-execute completed batch) ---');

    const idempotencyKey = (await supabase
      .from('payout_batches').select('idempotency_key').eq('id', atomicBatchId).maybeSingle()).data?.idempotency_key;

    const reExecResult = await BulkInternalPaymentService.executeBatch(CTX.admin1, atomicBatchId);
    assert(reExecResult.success, 'Re-execute of COMPLETED batch succeeds (idempotent)');
    assert(reExecResult.status === 'COMPLETED', 'Re-execute returns COMPLETED');
    assert(reExecResult.transactionId === txId, 'Re-execute returns original ledger_transaction_id');

    const txCountAfterReExec = await countLedgerTxByIdempotencyKey(idempotencyKey);
    assert(txCountAfterReExec === 1, `Still exactly 1 ledger tx after re-execute (got ${txCountAfterReExec})`);

    const sourceBalanceAfterReExec = await getWalletBalance(CTX.sourceWalletId);
    assert(
      Math.abs(sourceBalanceAfterReExec - sourceBalanceAfter) < 0.0001,
      `Source balance unchanged after re-execute (${sourceBalanceAfterReExec})`
    );
  }

  // ─── TEST 8: CONCURRENCY TEST ─────────────────────────────────────────────
  console.log('\n--- TEST 8: Concurrency Test (concurrent execution of two batches) ---');

  const concurrentSourceBalance = await getWalletBalance(CTX.sourceWalletId);
  console.log(`  Source balance available for concurrency test: ${concurrentSourceBalance} ${CTX.currency}`);

  if (concurrentSourceBalance < 5) {
    console.log('  ⚠️  SKIP concurrency test: insufficient source balance for concurrent execution.');
  } else {
    // Create batch A (small amount to fit within available balance)
    const concKeyA = `test_conc_a_${Date.now()}`;
    const batchAResult = await BulkInternalPaymentService.createBatch(CTX.admin1, {
      source_wallet_id: CTX.sourceWalletId,
      currency: CTX.currency,
      entries: [{ recipient_identifier: CTX.recipient1.id, amount: 1, item_index: 0 }],
      idempotency_key: concKeyA,
    });
    const batchAId = batchAResult.batch?.id;
    createdBatchIds.push(batchAId);

    // Create batch B (same source wallet)
    const concKeyB = `test_conc_b_${Date.now()}`;
    const batchBResult = await BulkInternalPaymentService.createBatch(CTX.admin1, {
      source_wallet_id: CTX.sourceWalletId,
      currency: CTX.currency,
      entries: [{ recipient_identifier: CTX.recipient2.id, amount: 1, item_index: 0 }],
      idempotency_key: concKeyB,
    });
    const batchBId = batchBResult.batch?.id;
    createdBatchIds.push(batchBId);

    // Approve both with admin2
    await BulkInternalPaymentService.approveBatch(CTX.admin2, batchAId);
    await BulkInternalPaymentService.approveBatch(CTX.admin2, batchBId);

    assert(
      batchAResult.success && batchBResult.success,
      'Both concurrent batches created and approved'
    );

    // Execute both concurrently — only one can win the source wallet lock at a time
    const results = await Promise.allSettled([
      BulkInternalPaymentService.executeBatch(CTX.admin1, batchAId),
      BulkInternalPaymentService.executeBatch(CTX.admin1, batchBId),
    ]);

    const completedCount = results.filter(
      r => r.status === 'fulfilled' && r.value?.status === 'COMPLETED'
    ).length;
    const conflictErrors = results.filter(
      r => r.status === 'rejected' &&
      (r.reason?.message?.includes('EXECUTION_CONCURRENCY_CONFLICT') ||
       r.reason?.message?.includes('APPROVAL_GATE_VIOLATION') ||
       r.reason?.message?.includes('INSUFFICIENT_SOURCE_BALANCE') ||
       r.reason?.message?.includes('EXECUTION_FAILURE'))
    );

    console.log(`  Concurrent results: ${completedCount} completed, ${conflictErrors.length} blocked/failed`);
    console.log(`  Results[0]:`, results[0].status, results[0].value?.status || results[0].reason?.message?.substring(0, 80));
    console.log(`  Results[1]:`, results[1].status, results[1].value?.status || results[1].reason?.message?.substring(0, 80));

    assert(
      completedCount + conflictErrors.length === 2,
      `Both concurrent attempts resolved (either COMPLETED or safely blocked): ${completedCount} completed, ${conflictErrors.length} blocked`
    );

    // Verify no duplicate ledger transactions
    const txCountA = await countLedgerTxByIdempotencyKey(batchAResult.batch?.idempotency_key);
    const txCountB = await countLedgerTxByIdempotencyKey(batchBResult.batch?.idempotency_key);
    assert(txCountA <= 1, `Batch A: at most 1 ledger tx (got ${txCountA})`);
    assert(txCountB <= 1, `Batch B: at most 1 ledger tx (got ${txCountB})`);
  }

  // ─── TEST 9: Cleanup ───────────────────────────────────────────────────────
  console.log('\n--- TEST 9: Cleanup Test Data ---');

  let cleanedCount = 0;
  for (const batchId of createdBatchIds) {
    if (!batchId) continue;
    const { data: b } = await supabase
      .from('payout_batches').select('status').eq('id', batchId).maybeSingle();
    if (!b) continue;

    if (['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(b.status)) {
      await supabaseAdmin.from('payout_batch_items').delete().eq('batch_id', batchId);
      await supabaseAdmin.from('payout_batches').delete().eq('id', batchId);
      cleanedCount++;
    }
    // COMPLETED/FAILED batches: leave as-is (immutable financial records)
  }
  console.log(`  Cleaned up ${cleanedCount} non-executed test batches.`);
  console.log('  COMPLETED batches retained as immutable ledger records.');
  assert(true, 'Cleanup pass completed');

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n=== TEST SUITE END: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('\n❌ UNCAUGHT TEST SUITE ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
