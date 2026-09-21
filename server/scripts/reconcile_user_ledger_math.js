const supabase = require('../config/database');

const USER_ID = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';

async function calculateLedger() {
  console.log(`============================================================`);
  console.log(`Ledger Reconciliation Math for User ${USER_ID}`);
  console.log(`============================================================\n`);

  // 1. Fetch wallet
  const { data: wallet } = await supabase
    .from('wallets_store')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('currency', 'NGN')
    .single();

  console.log("CURRENT NGN WALLET STORE STATE:");
  console.log(`- Balance: ${wallet.balance}`);
  console.log(`- Available Balance: ${wallet.available_balance}`);
  console.log(`- Reserved Balance: ${wallet.reserved_balance}`);
  console.log(`- Pending Balance: ${wallet.pending_balance}\n`);

  // 2. Fetch all completed/credited deposits in fincra_transactions & transactions
  const { data: fincraTxs } = await supabase
    .from('fincra_transactions')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: true });

  const { data: primaryTxs } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: true });

  console.log("=== ALL FINCRA TRANSACTIONS ===");
  let totalDepositsFincra = 0;
  let totalWithdrawalsFincraGross = 0;
  let totalWithdrawalsCompletedFincra = 0;

  fincraTxs.forEach(t => {
    const gross = parseFloat(t.gross_amount || t.amount || 0);
    const amount = parseFloat(t.amount || 0);
    if (t.type === 'DEPOSIT' && t.status === 'SUCCESSFUL') {
      totalDepositsFincra += amount;
    }
    if (t.type === 'WITHDRAWAL') {
      totalWithdrawalsFincraGross += gross;
      if (t.status === 'SUCCESSFUL' || t.withdrawal_status === 'COMPLETED') {
        totalWithdrawalsCompletedFincra += gross;
      }
    }
    console.log(`[${t.type}] Amount: ${amount}, Fee: ${t.fee}, Gross: ${gross}, Status: ${t.status}, W_Status: ${t.withdrawal_status}, Ref: ${t.reference}, Created: ${t.created_at}`);
  });

  console.log(`\nFincra Deposits Total: ${totalDepositsFincra}`);
  console.log(`Fincra Completed Withdrawals Gross Total: ${totalWithdrawalsCompletedFincra}`);
  console.log(`Fincra All Withdrawals Gross Total: ${totalWithdrawalsFincraGross}\n`);

  console.log("=== ALL PRIMARY TRANSACTIONS (`transactions` table) ===");
  let totalPrimaryDeposits = 0;
  let totalPrimaryWithdrawals = 0;

  primaryTxs.forEach(t => {
    const amt = parseFloat(t.amount || 0);
    if (t.type === 'DEPOSIT' && t.status === 'COMPLETED') {
      totalPrimaryDeposits += amt;
    }
    if (t.type === 'WITHDRAWAL' && t.status === 'COMPLETED') {
      totalPrimaryWithdrawals += amt;
    }
    console.log(`[${t.type}] Amount: ${amt}, Fee: ${t.fee}, Status: ${t.status}, Ref: ${t.reference_id}, Created: ${t.created_at}`);
  });

  console.log(`\nPrimary Deposits Total: ${totalPrimaryDeposits}`);
  console.log(`Primary Withdrawals Total: ${totalPrimaryWithdrawals}\n`);

  // 3. Fetch audit logs
  const { data: auditLogs } = await supabase
    .from('fincra_audit_logs')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: true });

  console.log("=== RELEVANT AUDIT LOG EVENTS ===");
  auditLogs.forEach(l => {
    console.log(`Action: ${l.action} | Created: ${l.created_at} | Details: ${JSON.stringify(l.details)}`);
  });
}

calculateLedger()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
