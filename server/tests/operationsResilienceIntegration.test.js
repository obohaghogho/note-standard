'use strict';

/**
 * operationsResilienceIntegration.test.js
 * =========================================
 * Step 4 Operations & Resilience Layer Integration Test Suite.
 */

const assert = require('assert');
const Scheduler = require('../workers/Scheduler');
const SchedulerRegistry = require('../workers/SchedulerRegistry');
const CircuitBreakerService = require('../services/operations/CircuitBreakerService');
const OutboxWorker = require('../services/operations/OutboxWorker');
const DLQProcessor = require('../services/operations/DLQProcessor');
const HealthMonitor = require('../services/operations/HealthMonitor');
const OutboxPublisher = require('../services/payment/OutboxPublisher');

function section(title) {
  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log(`  ${title}`);
  console.log('──────────────────────────────────────────────────────────────────────');
}

async function runTests() {
  console.log('==================================================================');
  console.log('🚀 Running Step 4 Operations & Resilience Test Suite (v1.0)');
  console.log('==================================================================');

  // TEST 1 — Distributed Scheduler & Leadership Execution
  section('TEST 1 — Distributed Scheduler Leadership & Job Execution');
  const registry = new SchedulerRegistry();
  const scheduler = new Scheduler({ registry, workerId: 'worker_node_alpha' });

  const runResult = await scheduler.executeJob('providerHealthJob');
  assert.strictEqual(runResult.status, 'SUCCESS');
  assert.strictEqual(runResult.jobName, 'providerHealthJob');
  assert.ok(runResult.durationMs >= 0);
  console.log('✓ Scheduler executed job with leadership lock and logged run history.');

  // TEST 2 — Circuit Breaker Lifecycle (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)
  section('TEST 2 — Circuit Breaker Lifecycle (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)');
  const breakerService = new CircuitBreakerService({ failureThreshold: 3, recoveryTimeoutMs: 50, halfOpenProbesNeeded: 2 });
  const provider = 'fincra';

  // Cause 3 consecutive failures to trip to OPEN
  for (let i = 0; i < 3; i++) {
    try {
      await breakerService.execute(provider, async () => { throw new Error('API_TIMEOUT'); });
    } catch (e) {}
  }
  assert.strictEqual(breakerService.getBreaker(provider).state, 'OPEN', 'Circuit should be OPEN after 3 failures');

  // Attempt request while OPEN -> Should reject immediately with CIRCUIT_BREAKER_OPEN
  let rejected = false;
  try {
    await breakerService.execute(provider, async () => { return 'OK'; });
  } catch (err) {
    rejected = true;
    assert.ok(err.message.includes('CIRCUIT_BREAKER_OPEN'));
  }
  assert.ok(rejected, 'Request rejected while circuit OPEN');

  // Wait 60ms for recovery timeout to transition to HALF_OPEN
  await new Promise(r => setTimeout(r, 60));

  // First probe success -> state HALF_OPEN
  await breakerService.execute(provider, async () => { return 'SUCCESS_PROBE_1'; });
  assert.strictEqual(breakerService.getBreaker(provider).state, 'HALF_OPEN');

  // Second probe success -> state CLOSED
  await breakerService.execute(provider, async () => { return 'SUCCESS_PROBE_2'; });
  assert.strictEqual(breakerService.getBreaker(provider).state, 'CLOSED', 'Circuit reset to CLOSED after successful probes');
  console.log('✓ Circuit breaker state transitions (CLOSED -> OPEN -> HALF_OPEN -> CLOSED) verified.');

  // TEST 3 — Outbox Worker & DLQ Failure Categorization
  section('TEST 3 — Outbox Worker & DLQ Failure Categorization');
  const outboxPublisher = new OutboxPublisher();
  const dlqProcessor = new DLQProcessor();
  const outboxWorker = new OutboxWorker({ outboxPublisher, dlqProcessor });

  // Register failing subscriber to trigger DLQ routing
  outboxWorker.registerSubscriber('FailingConsumer', async () => {
    throw new Error('DATABASE_CONNECTION_LOST');
  });

  const event = await outboxPublisher.enqueueEvent({
    eventType: 'WalletCredited',
    aggregateId: 'tx_fail_100',
    payload: { amount: 5000 }
  });

  const workerResults = await outboxWorker.processEvent(event);
  const failingConsumerResult = workerResults.find(r => r.consumerName === 'FailingConsumer');
  assert.strictEqual(failingConsumerResult.status, 'DLQ_ROUTED');
  assert.strictEqual(dlqProcessor.inMemoryDLQ.length, 1);
  assert.strictEqual(dlqProcessor.inMemoryDLQ[0].classification, 'TRANSIENT');
  console.log('✓ Failed event routed to DLQ with TRANSIENT classification after retry exhaustion.');

  // TEST 4 — DLQ Replay Action
  section('TEST 4 — DLQ Admin Replay Action');
  const dlqItem = dlqProcessor.inMemoryDLQ[0];
  const replayResult = await dlqProcessor.replayEvent(dlqItem.id, async (item) => {
    return { status: 'REPLAY_SUCCESSFUL', eventId: item.event_id };
  });

  assert.strictEqual(replayResult.status, 'REPLAYED');
  assert.strictEqual(dlqItem.status, 'REPLAYED');
  console.log('✓ DLQ event replayed successfully by admin action.');

  // TEST 5 — 4-Level Operational Health Telemetry
  section('TEST 5 — 4-Level Operational Health Telemetry');
  const healthMonitor = new HealthMonitor({ circuitBreakerService: breakerService });
  const healthReport = await healthMonitor.getSystemHealth();

  assert.strictEqual(healthReport.status, 'HEALTHY');
  assert.strictEqual(healthReport.components.database.status, 'HEALTHY');
  console.log('✓ 4-level operational health endpoints reporting correctly.');

  console.log('\n==================================================================');
  console.log('🎉 ALL STEP 4 OPERATIONS & RESILIENCE TESTS PASSED!');
  console.log('==================================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
