'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

async function runTrueConcurrencyTest() {
  console.log('── TRUE CONCURRENT RACE TEST FOR reserve_platform_revenue RPC ──');

  const client1 = await pool.connect();
  const client2 = await pool.connect();

  const ref1 = `TRUE_CONC_REQ1_${Date.now()}`;
  const ref2 = `TRUE_CONC_REQ2_${Date.now()}`;
  const adminId = '00000000-0000-0000-0000-000000000000';

  let seededLogId1 = null;

  try {
    // 1. Seed controlled revenue logs (1000 NGN) to ensure known environment
    const seedRes1 = await client1.query(
      `INSERT INTO public.revenue_logs (amount, currency, revenue_type, metadata)
       VALUES (1000, 'NGN', 'ADMIN_FEE', '{"test":"concurrency_seed"}')
       RETURNING id;`
    );
    seededLogId1 = seedRes1.rows[0].id;

    // 2. Fetch total available balance right now
    const balRes = await client1.query(
      `SELECT
         (SELECT COALESCE(SUM(amount), 0) FROM public.revenue_logs WHERE currency = 'NGN') -
         (SELECT COALESCE(SUM(amount), 0) FROM public.platform_settlements WHERE currency = 'NGN' AND status IN ('PENDING', 'PROCESSING', 'SIMULATED_TEST', 'COMPLETED'))
       AS avail;`
    );
    const availBefore = parseFloat(balRes.rows[0].avail);
    console.log(`Initial NGN Available Balance before test: ₦${availBefore}`);

    // We want request amount to be (availBefore - 100).
    const reqAmount = Math.max(100, availBefore - 100);
    console.log(`Request A Amount: ₦${reqAmount}`);
    console.log(`Request B Amount: ₦${reqAmount}`);
    console.log(`Total requested concurrently: ₦${reqAmount * 2} (which exceeds available ₦${availBefore})`);

    console.log('\nLaunching Request A and Request B simultaneously via Promise.all across 2 separate DB sockets...');

    const startTime = Date.now();

    const p1 = client1.query(
      `SELECT * FROM public.reserve_platform_revenue($1, $2, $3, $4, $5, $6, $7);`,
      [ref1, reqAmount, 'NGN', 'NS_APPROVED_NGN_SETTLEMENT_ACCOUNT', adminId, false, JSON.stringify({ test: 'true_conc_1' })]
    );

    const p2 = client2.query(
      `SELECT * FROM public.reserve_platform_revenue($1, $2, $3, $4, $5, $6, $7);`,
      [ref2, reqAmount, 'NGN', 'NS_APPROVED_NGN_SETTLEMENT_ACCOUNT', adminId, false, JSON.stringify({ test: 'true_conc_2' })]
    );

    const results = await Promise.allSettled([p1, p2]);
    const duration = Date.now() - startTime;

    console.log(`\nExecution finished in ${duration}ms.`);

    let successCount = 0;
    let failCount = 0;
    let failErrorMsg = '';

    results.forEach((res, idx) => {
      const reqName = idx === 0 ? 'Request A' : 'Request B';
      if (res.status === 'fulfilled') {
        successCount++;
        console.log(`  ✅ ${reqName}: SUCCESS — Reserved ₦${res.value.rows[0].amount} (Status: ${res.value.rows[0].status})`);
      } else {
        failCount++;
        failErrorMsg = res.reason.message;
        console.log(`  ❌ ${reqName}: REJECTED — ${res.reason.message}`);
      }
    });

    console.log('\n── ANALYSIS ──');
    if (successCount === 1 && failCount === 1 && failErrorMsg.includes('INSUFFICIENT_PLATFORM_REVENUE')) {
      console.log('✅ CONCURRENCY VERIFIED: Exactly 1 request succeeded and exactly 1 request was rejected due to INSUFFICIENT_PLATFORM_REVENUE!');
    } else {
      console.log(`❌ CONCURRENCY FAILED: successCount=${successCount}, failCount=${failCount}, error=${failErrorMsg}`);
    }

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    // Cleanup
    console.log('\nCleaning up test records...');
    await client1.query(`DELETE FROM public.platform_settlements WHERE reference IN ($1, $2);`, [ref1, ref2]);
    if (seededLogId1) {
      await client1.query(`DELETE FROM public.revenue_logs WHERE id = $1;`, [seededLogId1]);
    }
    client1.release();
    client2.release();
    await pool.end();
    console.log('Cleanup complete.');
  }
}

runTrueConcurrencyTest();
