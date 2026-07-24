# NoteStandard Payment Platform Runbook

## 1. Feature Flags & Safe Mode
If a new subsystem fails, you can seamlessly fallback to the monolithic legacy code without dropping requests.
Modify `server/config/SystemState.js` or your external config manager:

```javascript
SystemState.setFeatureFlag('feature_new_webhook', false); // Routes to legacy webhook handler
SystemState.setFeatureFlag('feature_new_deposit', false); // Uses legacy deposit logic
```

### Global Kill-Switch
If widespread corruption is detected:
```javascript
const SystemState = require('./config/SystemState');
SystemState.enterSafeMode('Suspected widespread ledger corruption');
```
*Effect:* All mutations (deposits, withdrawals, transfers, swaps) are immediately halted. The API returns 503 Maintenance Mode.

## 2. Disaster Recovery: Ledger Reversals
**Rule:** The Ledger is IMMUTABLE. Never run `DELETE FROM ledger_entries_v6`. 
If a transaction must be undone, create a **Compensating Transaction**.

### How to reverse a transaction:
1. Identify the erroneous transaction ID.
2. Formulate an exact opposite ledger entry via `execute_ledger_transaction_v6`.

**Example:**
If Tx 123 credited User A 1000 NGN and debited System 1000 NGN:
*Compensating Entry:* Debit User A 1000 NGN, Credit System 1000 NGN. Set `p_type = 'NORMALIZATION'` and `p_metadata = { reason: 'Reversal of Tx 123' }`.

## 3. Handling Reconciliation Alerts
Reconciliation is strictly **detect-and-alert**. 
If you receive an alert from `AuditLogService` that a wallet drift was detected:
1. Freeze the affected wallet immediately: `SystemState.freezeEntity(wallet_id, 86400)`
2. Query the raw provider logs (e.g., Paystack Dashboard) to verify the actual deposited amount.
3. Compare against `SELECT * FROM ledger_entries_v6 WHERE wallet_id = ?`
4. If a correction is needed, execute a Compensating Transaction (see Section 2).
5. Unfreeze the wallet: `SystemState.frozenEntities.delete(wallet_id)`

## 4. Monitoring Metrics
Monitor the `/api/health/financial` endpoint.
- **Provider Latency:** If Paystack latency exceeds 5000ms consistently, the system automatically flags `apiAvailability.paystack = false`. Ensure load balancers and network routes are healthy.
- **Queue Lags:** High queue lag indicates the `paymentQueue` worker is stalled. Restart the worker dynos.
- **Rollbacks:** Spikes in rollback counts usually mean a strict invariant is being violated (e.g., negative balance attempts or currency mismatches).

## 5. Deployment & Rollback Strategy
1. Deploy code with all `feature_*` flags set to `true`.
2. Monitor `/api/health/financial`.
3. If error rates spike, set specific `feature_*` flags to `false`.
4. The system will continue operating on the monolithic code.
5. Fix the microservice bug and redeploy.
