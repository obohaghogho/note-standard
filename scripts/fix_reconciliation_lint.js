const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server', 'workers', 'ReconciliationWorker.js');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize to LF for easier regex matching, we'll restore CRLF after
content = content.replace(/\r\n/g, '\n');

// Replace the function body that has the unreachable-code pattern
// We'll replace from the "return;" down to the closing "}" of assertLedgerIntegrity
const oldPattern = /(\s+static async assertLedgerIntegrity\(\) \{\n\s+try \{[\s\S]*?\} catch \(err\) \{\n\s+logger\.error\(".*crashed.*", err\.message\);\n\s+\}\n\s+\})/;

const newBody = `    static async assertLedgerIntegrity() {
        // TEMPORARILY DISABLED: This query fetches the entire ledger dataset into Node.js
        // heap memory and causes a Windows Access Violation (OOM crash, exit code 3221225786).
        // Re-enable only after converting to a paginated or DB-side aggregated query.
        //
        // Preserved implementation for future restoration:
        // const { data: wallets, error } = await supabase.from('wallets_store').select('id, balance, user_id');
        // if (error || !wallets) return;
        // const { data: ledgerTruth, error: ledgerError } = await supabase
        //   .from('ledger_entries_v6')
        //   .select('wallet_id, amount, side, ledger_transactions_v6!inner(status)');
        // if (ledgerError) throw ledgerError;
        // const ledgerTruthMap = ledgerTruth.reduce((acc, curr) => {
        //     const isSuccess = ['SETTLED', 'RECONCILED'].includes(curr.ledger_transactions_v6.status);
        //     const amount = Number(curr.amount);
        //     const isPendingDebit = amount < 0 && ['RESERVED','APPROVED','PROCESSING','SENT','CONFIRMING']
        //         .includes(curr.ledger_transactions_v6.status);
        //     if (isSuccess || isPendingDebit) acc[curr.wallet_id] = (acc[curr.wallet_id] || 0) + amount;
        //     return acc;
        // }, {});
        // const tolerance = 0.00000001;
        // let driftCount = 0;
        // for (const wallet of wallets) {
        //     const drift = Math.abs((Number(wallet.balance) || 0) - Math.max(0, ledgerTruthMap[wallet.id] || 0));
        //     if (drift > tolerance) {
        //         logger.error('[SYSTEM_DRIFT_DETECTED] Wallet ' + wallet.id + ' drift: ' + drift.toFixed(8));
        //         SystemState.updateMetrics({ hasDrift: true, drift });
        //         SystemState.enterSafeMode('Ledger drift on Wallet ' + wallet.id);
        //         driftCount++;
        //     }
        // }
        // if (driftCount === 0) SystemState.updateMetrics({ hasDrift: false, drift: 0 });
    }`;

const match = content.match(oldPattern);
if (match) {
    content = content.replace(oldPattern, '\n' + newBody);
    console.log('[fix_lint] assertLedgerIntegrity replaced successfully.');
} else {
    console.error('[fix_lint] Pattern not found — manual edit required.');
    process.exit(1);
}

// Restore CRLF
content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, content, 'utf8');
console.log('[fix_lint] File written.');
