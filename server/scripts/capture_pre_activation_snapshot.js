'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const PlatformSettlementService = require('../services/settlement/PlatformSettlementService');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function snapshot() {
  console.log('── PHASE 0: PRE-ACTIVATION SNAPSHOT ──');

  const client = await pool.connect();
  try {
    const bal = await PlatformSettlementService.getPlatformRevenueBalance('NGN');
    console.log(`Available NGN Platform Revenue: ₦${bal.availableRevenue} (Total Earned: ₦${bal.totalRevenue}, Settled/Reserved: ₦${bal.totalSettled})`);

    const countsRes = await client.query(
      `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::numeric AS sum_amount
       FROM public.platform_settlements
       WHERE currency = 'NGN'
       GROUP BY status;`
    );

    console.log('\nExisting NGN platform_settlements breakdown:');
    countsRes.rows.forEach(r => {
      console.log(`  - ${r.status}: ${r.count} records, sum = ₦${r.sum_amount}`);
    });

    // Check customer wallet balances sum (wallets_v6)
    const walletRes = await client.query(
      `SELECT COALESCE(SUM(balance), 0)::numeric AS total_wallet_balance, COALESCE(SUM(available_balance), 0)::numeric AS total_available
       FROM public.wallets_v6 WHERE currency = 'NGN';`
    );
    console.log(`\nNGN Customer Wallets Aggregate: total_balance = ₦${walletRes.rows[0].total_wallet_balance}, available = ₦${walletRes.rows[0].total_available}`);

    // Check revenue_logs NGN total
    const revRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total_rev_logs FROM public.revenue_logs WHERE currency = 'NGN';`
    );
    console.log(`NGN revenue_logs total: ₦${revRes.rows[0].total_rev_logs}`);

  } finally {
    client.release();
    await pool.end();
  }
}

snapshot().catch(err => { console.error('Snapshot error:', err); process.exit(1); });
