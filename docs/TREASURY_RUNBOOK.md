# NoteStandard Treasury — Operational Runbook
## For Treasury Operators & On-Call Engineers

---

## Part 1 — Daily Operations

### 1.1 Checking System Health

```
GET /api/admin/treasury/summary
```

Expected healthy response:
```json
{
  "health_grade": "HEALTHY",
  "health_score": 92,
  "providers_down": 0,
  "critical_currencies": []
}
```

Grade meanings:
| Grade | Score | Action Required |
|---|---|---|
| HEALTHY | 90–100 | None |
| DEGRADED | 70–89 | Monitor. Review `GET /api/admin/treasury/dashboard` |
| CRITICAL | 40–69 | Immediate review. Check reserve ratios and provider health |
| EMERGENCY | 0–39 | Page on-call. May require SAFE_MODE or withdrawal freeze |

---

### 1.2 Checking Reserve Ratios

```
GET /api/admin/treasury/reserves
```

Key rules:
- Any ratio below **105%** → WARN (email sent to admins)
- Any ratio below **100%** → CRITICAL (withdrawals set to DEGRADED)
- Three consecutive CRITICAL cycles → withdrawal FREEZE

To see a currency's 24-hour reserve trend:
```
GET /api/admin/treasury/reserves/NGN/history?hours=24
```

To immediately recalculate:
```
POST /api/admin/treasury/sync
```

---

### 1.3 Checking Provider Health

```
GET /api/admin/treasury/providers/health
```

Field meanings:
- `circuit_breaker: "OPEN"` → provider is down, excluded from routing
- `circuit_breaker: "HALF_OPEN"` → recovery in progress, limited routing
- `consecutive_failures` → number of consecutive failed probes
- `success_rate` → rolling success percentage

To see a provider's probe history:
```
GET /api/admin/treasury/providers/fincra/probes?limit=20
```

---

## Part 2 — Alert Response Procedures

### 2.1 WARN: Reserve Below 105%

**Trigger:** Reserve ratio for currency X dropped below 105%.

**Steps:**
1. Check `GET /api/admin/treasury/reserves` to confirm which currency and current ratio
2. Check `GET /api/admin/treasury/balances` to see provider balance breakdown
3. If ratio is approaching 100%, consider requesting a treasury rebalance:
   - `POST /api/admin/treasury/transfers` (requires second admin to approve)
4. Trigger a manual sync to refresh data: `POST /api/admin/treasury/sync`
5. Monitor over next 15 minutes

**Do NOT:**
- Manually adjust wallet balances
- Call LedgerService directly
- Bypass the approval workflow for transfers

---

### 2.2 CRITICAL: Reserve Below 100%

**Trigger:** Reserve ratio for currency X dropped below 100%.
Withdrawals have been automatically set to DEGRADED.

**Steps:**
1. Confirm the deficit: `GET /api/admin/treasury/reserves`
2. Check provider status: `GET /api/admin/treasury/providers/health`
3. Check if deficit is due to provider API failure (sync_status = FAILED = false reading):
   - `GET /api/admin/treasury/balances` → look for `sync_status: "FAILED"`
   - If provider is temporarily unreachable, wait for next probe cycle and recheck
4. If deficit is confirmed real:
   - Request emergency treasury transfer: `POST /api/admin/treasury/transfers`
   - Get second admin to approve: `POST /api/admin/treasury/transfers/:id/approve`
5. Once reserves confirmed above 100% (after sync), restore withdrawals manually if auto-recovery hasn't triggered

**Critical boundary:**
Do NOT restore withdrawal mode manually unless you have confirmed the reserve ratio is above 100%.

---

### 2.3 FREEZE: Withdrawal Frozen

**Trigger:** Three consecutive CRITICAL reserve cycles.
`SystemState.withdrawalMode === "FROZEN"`

**Steps:**
1. Identify root cause (provider balance or genuine deficit):
   ```
   GET /api/admin/treasury/reserves
   GET /api/admin/treasury/providers/health
   GET /api/admin/treasury/audit?event_type=SAFE_MODE_TRIGGERED
   ```
2. If caused by provider API outage (false deficit):
   - Wait for provider to recover and next sync cycle
   - Or manually trigger sync: `POST /api/admin/treasury/sync`
   - Confirm reserves are above freeze threshold
3. If genuine deficit:
   - Keep withdrawal freeze active
   - Execute treasury rebalance with two-admin approval
   - Confirm reserves restored
4. To restore withdrawals (after reserves confirmed):
   - This requires direct SystemState change on the server
   - `SystemState.setWithdrawalMode('NORMAL')` via admin console

**Never restore withdrawals with reserves below 100%.**

---

### 2.4 Provider Circuit Breaker OPEN

**Trigger:** A provider has failed `FAILURE_THRESHOLD` consecutive probes.
Provider is removed from GatewayRouter routing.

**Steps:**
1. Check: `GET /api/admin/treasury/providers/health`
2. Check probe history: `GET /api/admin/treasury/providers/:provider/probes?limit=10`
3. Verify if provider is genuinely down (check their status page)
4. If provider is down:
   - Inform users if the outage affects deposits/withdrawals
   - Wait for circuit to enter HALF_OPEN state (after 30s)
   - If provider recovers, circuit auto-closes on next successful probe
5. If probe is misconfigured (false positive):
   - Check environment variables for API keys
   - Fix configuration and restart the ProviderHealthWorker

---

### 2.5 Reconciliation Discrepancy

**Trigger:** `AggregateReconciliationWorker` detected ledger sum ≠ provider sum beyond tolerance.

**Steps:**
1. Check: `GET /api/admin/reconciliation/proposals` (existing endpoint)
2. Check: `GET /api/admin/treasury/audit?event_type=AGGREGATE_RECONCILIATION_CYCLE`
3. Determine discrepancy source:
   - **Timing gap:** Provider balance may not yet include a pending settlement → wait and recheck
   - **Stale provider sync:** `sync_status: "FAILED"` → trigger manual sync
   - **Genuine discrepancy:** Requires manual investigation of ledger entries
4. For genuine discrepancies:
   - Review `GET /api/admin/treasury/settlements` for stuck settlements
   - Check `GET /api/admin/reconciliation/proposals` for unmatched webhooks
5. Mark reconciliation report as resolved once corrected (existing admin endpoints)

---

## Part 3 — Treasury Transfer Workflow

A treasury transfer moves funds between providers (e.g., from Fincra to a different bank).
**Two separate admins must be involved.** The requester cannot approve their own transfer.

### Step 1: Request
```http
POST /api/admin/treasury/transfers
Content-Type: application/json

{
  "source_provider": "fincra",
  "target_provider": "grey",
  "currency": "USD",
  "amount": 10000,
  "transfer_type": "REBALANCE",
  "requested_reason": "USD reserve ratio at 98%. Rebalancing from Fincra USD to Grey USD."
}
```

### Step 2: Second Admin Approves
```http
POST /api/admin/treasury/transfers/:id/approve
Content-Type: application/json

{
  "notes": "Confirmed reserves at 98%. Rebalance approved."
}
```

### Step 3: Execute
The transfer is now in `APPROVED` status. Execution by a treasury engineer via the provider's admin portal or API.
After execution, update status to COMPLETED via direct DB update or future execution endpoint.

---

## Part 4 — Settlement Pipeline

### Advancing a Settlement Manually

If a settlement is stuck in a stage, advance it programmatically:

```javascript
const SettlementStateMachine = require('./services/treasury/SettlementStateMachine');

// Advance from PROVIDER_CONFIRMED to LEDGER_POSTED
await SettlementStateMachine.advance(settlementId, 'LEDGER_POSTED', {
  transitioned_by: 'admin:manual',
  notes: 'Manual advance — webhook confirmed in Fincra dashboard',
});
```

### Failing a Settlement

```javascript
await SettlementStateMachine.fail(settlementId, 'Chargeback received from provider', 'admin:uuid');
```

### Viewing a Settlement's History

```
GET /api/admin/treasury/settlements/:id
```

Response includes the full `transitions` array showing every stage change.

---

## Part 5 — Disaster Recovery

### 5.1 Provider Balance Fetch Failure (All Providers)

**Symptom:** `treasury_provider_balances.sync_status = 'FAILED'` for all rows.

**Resolution:**
1. Check environment variables: `FINCRA_SECRET_KEY`, `PAYSTACK_SECRET_KEY`, `NOWPAYMENTS_API_KEY`
2. Check provider status pages
3. Trigger manual sync after fixing: `POST /api/admin/treasury/sync`
4. Reserve ratios will remain at last known values until sync succeeds

### 5.2 TreasuryBalanceSyncWorker Not Running

**Symptom:** `treasury_balance_snapshots.captured_at` not updating.

**Resolution:**
1. Check server logs for `[TreasuryBalanceSyncWorker]` entries
2. Restart the server — workers restart automatically
3. Trigger a manual sync from the admin UI

### 5.3 Audit Chain Broken

**Symptom:** `GET /api/admin/treasury/audit/chain` returns `valid: false`

**Resolution:**
1. Note the `broken_at` record ID
2. This indicates a record between the previous and this ID was tampered with or deleted
3. Do NOT delete or modify any `treasury_audit_log` records (DB trigger blocks this anyway)
4. Escalate to engineering for forensic investigation
5. All records before the break point remain valid

### 5.4 Withdraw Freeze Won't Clear

If SystemState withdrawal mode is FROZEN and reserves are confirmed healthy:

```javascript
// On the server console (requires direct access):
const SystemState = require('./config/SystemState');
SystemState.setWithdrawalMode('NORMAL');
// Or if in SAFE_MODE:
SystemState.transition('NORMAL', 'Manual clearance — reserves confirmed healthy by admin');
```

---

## Part 6 — Monitoring Checklist

### Daily (Automated)
- [ ] Provider balance sync running every 5 minutes ✓
- [ ] Reserve ratios calculated every 5 minutes ✓
- [ ] Aggregate reconciliation running every 15 minutes ✓
- [ ] Provider health probes running every 60 seconds ✓
- [ ] Liquidity gaps checked every 10 minutes ✓

### Weekly (Manual)
- [ ] Review `GET /api/admin/treasury/dashboard` for unresolved recommendations
- [ ] Check `GET /api/admin/treasury/audit/chain` — confirm chain is intact
- [ ] Review `GET /api/admin/treasury/transfers` — cancel any stale PENDING_APPROVAL transfers
- [ ] Check `GET /api/admin/treasury/settlements` with `stage=FAILED` — investigate failed settlements

### Monthly
- [ ] Review reserve ratio trends: 30-day history per currency
- [ ] Review FX exposure summary: `GET /api/admin/treasury/fx/exposure`
- [ ] Confirm `reserve_thresholds` values are appropriate for current volumes
- [ ] Test manual sync triggers and verify data freshness

---

## Part 7 — Environment Configuration Reference

Add to `.env`:

```bash
# Treasury Monitoring
TREASURY_SYNC_INTERVAL_MS=300000      # 5 minutes (default)
AGG_RECON_INTERVAL_MS=900000          # 15 minutes (default)
PROVIDER_PROBE_INTERVAL_MS=60000      # 1 minute (default)
LIQUIDITY_INTERVAL_MS=600000          # 10 minutes (default)
AGG_RECON_TOLERANCE=0.5               # 0.5% discrepancy tolerance

# Grey Provider (optional — skip if not using Grey)
GREY_API_KEY=your_grey_api_key
GREY_API_URL=https://api.grey.co
```

---

*Runbook Version: 1.0*
*Created: 2026-07-29 | Enterprise Treasury Upgrade Phase 15*
*All procedures assume NoteStandard v3.x+ with migrations 250–258 applied.*
