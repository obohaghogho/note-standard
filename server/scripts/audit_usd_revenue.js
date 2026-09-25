const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function auditUsdRevenueLogs() {
  console.log('================================================================================');
  console.log(' 🔍 AUDITING ALL USD REVENUE LOGS IN DATABASE');
  console.log('================================================================================\n');

  // Query all revenue_logs for USD
  const { data: revLogs, error } = await supabase
    .from('revenue_logs')
    .select('*')
    .or('currency.eq.USD,currency.eq.usd')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching USD revenue_logs:', error);
    return;
  }

  console.log(`Total USD revenue_logs rows in database: ${revLogs.length}\n`);

  let totalRevLogsAmount = 0;

  for (let i = 0; i < revLogs.length; i++) {
    const r = revLogs[i];
    const amt = parseFloat(r.amount || 0);
    totalRevLogsAmount += amt;

    // Check corresponding transaction in transactions table
    let txInfo = 'NO_TX_RECORD';
    if (r.source_transaction_id) {
      const { data: tx } = await supabase
        .from('transactions')
        .select('id, reference_id, type, status, amount, fee, created_at')
        .eq('id', r.source_transaction_id)
        .maybeSingle();

      if (tx) {
        txInfo = `TxRef:${tx.reference_id || tx.id} Type:${tx.type} Status:${tx.status} Gross:${tx.amount} Fee:${tx.fee} TxDate:${tx.created_at}`;
      } else {
        txInfo = `TX_NOT_FOUND (id: ${r.source_transaction_id})`;
      }
    }

    console.log(`Row #${i+1}: LogID:${r.id}`);
    console.log(`  SourceTxID : ${r.source_transaction_id || 'NULL'}`);
    console.log(`  Amount     : USD ${amt.toFixed(2)}`);
    console.log(`  Type       : ${r.revenue_type}`);
    console.log(`  CreatedAt  : ${r.created_at}`);
    console.log(`  Metadata   : ${JSON.stringify(r.metadata)}`);
    console.log(`  Linked Tx  : ${txInfo}\n`);
  }

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`TOTAL SUM OF ALL USD REVENUE_LOGS: USD ${totalRevLogsAmount.toFixed(2)}`);
  console.log(`--------------------------------------------------------------------------------`);
}

auditUsdRevenueLogs().catch(console.error);
