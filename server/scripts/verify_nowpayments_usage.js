const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function auditNowPaymentsUsage() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('=== NOWPAYMENTS PRODUCTION DATABASE AUDIT ===\n');

    // 1. Total users with NOWPayments address & total NOWPayments addresses
    const addrRes = await client.query(`
      SELECT 
        COUNT(DISTINCT user_id) AS total_users_with_addr,
        COUNT(*) AS total_addresses
      FROM nowpayments_deposit_addresses;
    `).catch(err => ({ rows: [{ total_users_with_addr: '0', total_addresses: '0' }], err: err.message }));

    console.log(`TOTAL USERS WITH NOWPAYMENTS ADDRESS: ${addrRes.rows[0].total_users_with_addr}`);
    console.log(`TOTAL NOWPAYMENTS ADDRESSES: ${addrRes.rows[0].total_addresses}`);

    // 2. NOWPayments transactions in transactions table
    const txRes = await client.query(`
      SELECT 
        COUNT(*) AS total_tx,
        COUNT(*) FILTER (WHERE status IN ('finished', 'confirmed', 'SUCCESS', 'SETTLED', 'COMPLETED')) AS completed_tx,
        COUNT(*) FILTER (WHERE status IN ('waiting', 'sending', 'PENDING', 'PROCESSING')) AS pending_tx,
        COUNT(*) FILTER (WHERE status IN ('failed', 'expired', 'FAILED', 'REVERSED')) AS failed_tx
      FROM transactions
      WHERE provider ILIKE '%nowpayment%' 
         OR type ILIKE '%nowpayment%' 
         OR reference ILIKE '%nowpayment%';
    `).catch(err => ({ rows: [{ total_tx: 0, completed_tx: 0, pending_tx: 0, failed_tx: 0 }], err: err.message }));

    console.log(`TOTAL NOWPAYMENTS DEPOSIT TRANSACTIONS: ${txRes.rows[0].total_tx}`);
    console.log(`TOTAL COMPLETED NOWPAYMENTS DEPOSITS: ${txRes.rows[0].completed_tx}`);
    console.log(`TOTAL PENDING NOWPAYMENTS DEPOSITS: ${txRes.rows[0].pending_tx}`);
    console.log(`TOTAL FAILED NOWPAYMENTS DEPOSITS: ${txRes.rows[0].failed_tx}`);

    // 3. Ledger entries originating from NOWPayments
    const ledgerRes = await client.query(`
      SELECT COUNT(*) AS total_ledger_credits
      FROM ledger_entries
      WHERE metadata::text ILIKE '%nowpayment%'
         OR reference ILIKE '%nowpayment%'
         OR description ILIKE '%nowpayment%';
    `).catch(err => ({ rows: [{ total_ledger_credits: 0 }], err: err.message }));

    console.log(`TOTAL NOWPAYMENTS-ORIGINATED LEDGER CREDITS: ${ledgerRes.rows[0].total_ledger_credits}`);

    // 4. Crypto wallets / User balances associated with NOWPayments
    const walletRes = await client.query(`
      SELECT COUNT(DISTINCT user_id) AS users_with_crypto_balance, COALESCE(SUM(balance), 0) AS total_crypto_balance
      FROM crypto_wallets
      WHERE provider ILIKE '%nowpayment%'
         OR deposit_address IN (SELECT address FROM nowpayments_deposit_addresses);
    `).catch(err => ({ rows: [{ users_with_crypto_balance: 0, total_crypto_balance: 0 }], err: err.message }));

    console.log(`TOTAL USER BALANCE DEPENDING ON NOWPAYMENTS: ${walletRes.rows[0].total_crypto_balance}`);

    if (parseInt(addrRes.rows[0].total_addresses, 10) > 0) {
      const sample = await client.query(`SELECT * FROM nowpayments_deposit_addresses LIMIT 10`);
      console.log('\nSample NOWPayments Deposit Addresses:', sample.rows);
    }

  } catch (err) {
    console.error('Audit query error:', err);
  } finally {
    await client.end();
  }
}

auditNowPaymentsUsage();
