require('dotenv').config({ path: './.env' });
const fs = require('fs');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('Connected to DB.');

  try {
    // 1. Apply Migration 205 (Advisory Fencing)
    console.log('\n--- Applying Migration 205 (Advisory Fencing) ---');
    const sql = fs.readFileSync('./database/migrations/205_advisory_fencing_single_node.sql', 'utf8');
    await client.query(sql);
    console.log('Migration 205 applied.');

    // 2. Find all stuck pending causal queue items
    console.log('\n--- Processing stuck causal queue items ---');
    const { rows: stuckItems } = await client.query(
      `SELECT * FROM public.causal_execution_queue WHERE status = 'pending' ORDER BY sequence_id ASC`
    );
    console.log(`Found ${stuckItems.length} stuck items.`);

    for (const intent of stuckItems) {
      console.log(`Processing seq ${intent.sequence_id} (${intent.intent_type})...`);

      // Get the active epoch token for this shard
      const { rows: leaseRows } = await client.query(
        `SELECT active_epoch_token FROM public.system_shard_leases WHERE shard_id = $1`,
        [intent.shard_id]
      );
      const epochToken = leaseRows[0]?.active_epoch_token;

      // Insert into financial_event_log to trigger the mirror function
      const { rows: logRows } = await client.query(
        `INSERT INTO public.financial_event_log 
         (entity_id, entity_scope, event_type, expected_version, intent_id, causal_group_id, payload, epoch_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          intent.wallet_id,
          'payout_request',
          intent.intent_type,
          intent.expected_version,
          intent.sequence_id,
          intent.payload?.causal_group_id,
          intent.payload,
          epochToken
        ]
      );

      // Mark as completed
      await client.query(
        `UPDATE public.causal_execution_queue SET status = 'completed', processed_at = NOW() WHERE sequence_id = $1`,
        [intent.sequence_id]
      );
      console.log(`  -> seq ${intent.sequence_id} processed. Log row:`, logRows[0]?.id || 'already existed');
    }

    // 3. Check payout_requests created
    console.log('\n--- Checking payout_requests ---');
    const { rows: payouts } = await client.query(
      `SELECT id, status, amount FROM public.payout_requests ORDER BY created_at DESC LIMIT 5`
    );
    payouts.forEach(p => console.log(' ', p.id, '|', p.status, '|', p.amount, 'NGN'));

  } catch (err) {
    console.error('ERROR:', err.message);
  }

  await client.end();
  console.log('\nDone. PayoutWorker will now dispatch approved requests to Paystack.');
}

main();
