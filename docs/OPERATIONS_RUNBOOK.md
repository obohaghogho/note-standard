# Operations Runbook
> **Note Standard Enterprise Financial Platform — Phase 16**
> Version: 1.0 | Owner: Engineering | Classification: INTERNAL

---

## 1. Daily Operations Checklist

Run every business day (automated via cron + manual verification):

### Morning (09:00 WAT)
- [ ] Review treasury dashboard: `GET /api/admin/treasury/dashboard`
- [ ] Check AI insights for any overnight alerts: `GET /api/admin/treasury/insights`
- [ ] Verify nightly reconciliation completed: `GET /api/admin/treasury/reconciliation/runs`
- [ ] Confirm all provider circuits are CLOSED: `GET /api/admin/treasury/routing/health-scores`
- [ ] Review 24h liquidity forecast: `GET /api/admin/treasury/forecasts`
- [ ] Check for stuck settlements: `GET /api/admin/treasury/settlement-pipeline/stuck`

### Evening (18:00 WAT)
- [ ] Review end-of-day reserve ratios: `GET /api/admin/treasury/reserves`
- [ ] Check for open rebalancing recommendations: `GET /api/admin/treasury/rebalancing/recommendations`
- [ ] Verify SLA metrics are within targets: `GET /api/admin/treasury/sla/dashboard`
- [ ] Review routing decisions for anomalies: `GET /api/admin/treasury/routing/stats`

---

## 2. Automated Workers

All workers start automatically with `server.js`. No manual action required under normal conditions.

| Worker | Schedule | Purpose | Admin Trigger |
|--------|----------|---------|--------------|
| TreasuryBalanceSyncWorker | Every 5 min | Fetch provider balances + run AI monitor | `POST /api/admin/treasury/sync` |
| NightlyReconciliationWorker | 02:00 WAT | 5-stage reconciliation pipeline | `POST /api/admin/treasury/reconciliation/trigger` |
| SLAMetricsWorker | Every hour | Compute SLA metrics + detect breaches | Manual N/A |
| TreasuryHealthProbeWorker | Every 2 min | Health probes for all providers | Automatic |

### Checking Worker Status
Workers log to application logger. Filter via:
```bash
grep "NightlyReconWorker\|SLAMetricsWorker\|TreasuryBalanceSyncWorker" app.log
```

---

## 3. Provider Health Management

### Monitoring Health Scores (0–100)

| Score | Grade | Routing Behaviour |
|-------|-------|------------------|
| 80–100 | HEALTHY | Full routing weight |
| 50–79 | DEGRADED | Reduced routing weight |
| 0–49 | DOWN | Excluded from routing |

**Score Components:**
- Success Rate (30%) — 1-hour rolling
- Latency (20%) — P95 vs. 300ms baseline
- Error Rate (20%) — API 4xx/5xx rate
- Timeout Rate (10%) — Requests > 8s
- Circuit State (5%) — CLOSED/HALF_OPEN/OPEN
- Webhook Delay (10%) — Delivery latency
- Rate Limit (5%) — Remaining headroom

### Manually Recomputing Scores
Scores are recomputed automatically every 5 minutes by the sync worker. To force:
1. Call `POST /api/admin/treasury/sync`
2. Check updated scores at `GET /api/admin/treasury/routing/health-scores`

### Circuit Breaker States

| State | Meaning | Recovery |
|-------|---------|---------|
| CLOSED | Normal — provider healthy | N/A |
| HALF_OPEN | Recovering — limited traffic | Automatic after 30s |
| OPEN | Failed — excluded from routing | Automatic after 30s |

---

## 4. Provider Certification

All providers must be certified before handling live traffic. Certification validates:
- Webhook validation implemented
- Idempotency support confirmed
- API keys present in environment
- Health check endpoint responding
- SLA targets configured
- Webhook URL confirmed

### Running Certification
```bash
POST /api/admin/treasury/certification/{provider}
# provider: fincra | anchor | paystack | grey | nowpayments
```

### Viewing Status
```bash
GET /api/admin/treasury/certification/status
```

### Certification Checklist (DB)
Update `banking_providers` table for any new provider before routing:
```sql
UPDATE banking_providers SET
  cap_webhook_validation = true,
  cap_idempotency        = true,
  cap_health_check       = true,
  cap_audit_logging      = true,
  sla_uptime_pct         = 99.9,
  sla_max_latency_ms     = 3000,
  webhook_url_configured = true,
  api_key_last_rotated   = NOW()
WHERE provider_key = 'new_provider';
```

---

## 5. Reserve Management

### Reserve Ratio Thresholds

| Status | Reserve Ratio | Action |
|--------|-------------|--------|
| HEALTHY | ≥ 105% | No action needed |
| WARN | 100–105% | Monitor closely, prepare top-up |
| CRITICAL | 95–100% | Top-up required within 4 hours |
| EMERGENCY | < 95% | Immediate top-up + consider withdrawal suspension |

### Checking Reserves
```bash
GET /api/admin/treasury/reserves        # All currencies
GET /api/admin/treasury/balance-proof   # Full customer liability vs. assets proof
```

### Rebalancing Workflow
1. Check recommendations: `GET /api/admin/treasury/rebalancing/recommendations`
2. Review urgency (HIGH / MEDIUM / LOW)
3. Execute manually via provider dashboards
4. Acknowledge in system: `POST /api/admin/treasury/rebalancing/{id}/acknowledge`
5. Sync balances: `POST /api/admin/treasury/sync`
6. Confirm ratios improved: `GET /api/admin/treasury/reserves`

---

## 6. Settlement Management

### Settlement Stage Reference

```
COLLECTED → PENDING_SETTLEMENT → SETTLED
                               → FAILED → PENDING_SETTLEMENT (retry)
                               → REVERSED
SETTLED   → CHARGEBACK → REFUNDED
          → REVERSED
```

### Stuck Settlements
Settlements in PENDING_SETTLEMENT for > 24 hours trigger `SETTLEMENT_DELAY` AI insight.

```bash
GET /api/admin/treasury/settlement-pipeline/stuck?hours=24
```

**Resolution steps:**
1. Check provider dashboard for settlement status
2. If settled on provider side: Call webhook manually or update via admin
3. If truly stuck: Contact provider support with reference
4. Mark resolved: Call `SettlementPositionService.advance(id, 'SETTLED', ...)`

### Settlement Calendar Reference

| Provider | Currency | Model | Cutoff | Business Days |
|----------|----------|-------|--------|--------------|
| Anchor | NGN | T+0 | 15:00 | Weekdays only |
| Fincra | NGN | T+0/T+1 | 16:00 | Weekdays only |
| Paystack | NGN | T+1 | 16:00 | Weekdays only |
| Grey | USD/EUR/GBP | T+2 | 14:00 | Weekdays only |
| NOWPayments | Crypto | T+0 (on-chain) | None | 24/7 |

```bash
GET /api/admin/treasury/settlement-calendar
```

---

## 7. Reconciliation Operations

### Nightly Reconciliation Stages

| Stage | What It Checks |
|-------|---------------|
| 1 — LEDGER | Double-entry invariant: all DEBITs = CREDITs |
| 2 — PROVIDER_TXNS | Anchor transactions vs. internal settlement positions |
| 3 — PROVIDER_BALANCE | Live provider balances vs. treasury snapshot |
| 4 — TREASURY | Reserve ratio consistency |
| 5 — SETTLEMENT | Stuck/delayed settlements |

### Triggering Manual Reconciliation
```bash
POST /api/admin/treasury/reconciliation/trigger
```

### Reviewing Results
```bash
GET /api/admin/treasury/reconciliation/runs           # List recent runs
GET /api/admin/treasury/reconciliation/runs/{run_id}  # Detail + line items
```

### Discrepancy Resolution

| Match Status | Meaning | Action |
|-------------|---------|--------|
| MATCHED | Internal = provider | No action |
| INTERNAL_ONLY | In our DB, not provider | Investigate — may need reversal |
| PROVIDER_ONLY | In provider, not our DB | Check if webhook was missed |
| AMOUNT_MISMATCH | Amounts differ | Verify with provider — raise dispute if needed |

---

## 8. Routing Policy Management

Routing policies are stored in `routing_policies` table. No code changes needed.

### Creating a Policy

```sql
INSERT INTO routing_policies (
  policy_name, currency, transaction_type, method,
  preferred_provider, excluded_providers,
  health_weight, cost_weight, latency_weight, liquidity_weight,
  priority, is_active
) VALUES (
  'Force Anchor for NGN Payouts',
  'NGN', 'PAYOUT', 'bank_transfer',
  'anchor', NULL,
  0.30, 0.25, 0.20, 0.25,
  10, true
);
```

### Viewing Active Policies
```bash
GET /api/admin/treasury/routing/policies
```

---

## 9. AI Treasury Monitor

The AI monitor runs every 5 minutes and generates natural-language insights for 7 categories:

| Insight Type | Description |
|-------------|-------------|
| RESERVE_DEFICIT | Reserve ratio below threshold |
| HEALTH_DEGRADATION | Provider success rate fallen |
| CONCENTRATION_RISK | >80% treasury in one provider |
| SETTLEMENT_DELAY | Settlements stuck >24h |
| FAILOVER_ACTIVATED | ≥3 failover events in 1 hour |
| FORECAST_ALERT | Deficit projected within 24h |
| LATENCY_SPIKE | Provider P95 latency doubled |

### Viewing Active Insights
```bash
GET /api/admin/treasury/insights
```

### Acknowledging Insights
```bash
POST /api/admin/treasury/insights/{id}/acknowledge
```

---

## 10. Payment Event Replay

### When to Replay
Use event replay when a payment failed due to a **transient error** (provider timeout, network issue) and you are confident the underlying issue is resolved.

**Do NOT replay** if:
- The payment failed due to fraud block or policy rejection
- The customer has already been refunded
- The provider confirms the payment was processed (would cause duplicate)

### Replay Procedure
```bash
# View all FAILED executions
GET /api/admin/treasury/replay/pending

# Replay a specific correlation ID
POST /api/admin/treasury/replay/{correlation_id}

# Replay all failed (batch, limit=50)
POST /api/admin/treasury/replay
{"limit": 50}
```

### Correlation Trace Lookup
Full payment lifecycle trace — execution log + provider history + settlement + audit trail:
```bash
GET /api/admin/treasury/correlation/NS-TXN-2026-000123
```

---

## 11. API Key Rotation Policy

**Rotation frequency**: Every 90 days (flagged by ProviderCertificationRegistry if overdue).

### Rotation Steps
1. Generate new API key on provider dashboard
2. Update `.env` or secrets manager: `ANCHOR_SECRET_KEY=new_key`
3. Rolling restart (no downtime required — keys are loaded on request)
4. Update rotation date in DB:
   ```sql
   UPDATE banking_providers
   SET api_key_last_rotated = NOW()
   WHERE provider_key = 'anchor';
   ```
5. Run certification to confirm: `POST /api/admin/treasury/certification/anchor`
6. Monitor health scores for 30 minutes after rotation

---

## 12. Adding a New Provider

1. **Implement `UnifiedBankingInterface`** — extend `server/services/banking/UnifiedBankingInterface.js`
2. **Register in `BankingProviderRegistry`** — add to `server/services/banking/BankingProviderRegistry.js`
3. **Add to `PAYMENT_PROVIDER_CAPABILITIES`** — update `server/config/providerCapabilities.js`
4. **Add to `PROVIDER_ENV_KEYS`** — update `server/config/ProviderCertificationRegistry.js`
5. **Insert into `banking_providers`** table — set all capability flags
6. **Insert into `settlement_calendar`** — configure settlement model
7. **Insert into `routing_policies`** — configure routing weights
8. **Run certification**: `POST /api/admin/treasury/certification/{new_provider}`
9. **Set `is_enabled = true`** only after certification passes

---

*Reviewed at Phase 16 completion. Review schedule: quarterly or after any major provider change.*
