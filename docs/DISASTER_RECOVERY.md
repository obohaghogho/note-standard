# Disaster Recovery Runbook
> **Note Standard Enterprise Financial Platform — Phase 16**
> Version: 1.0 | Owner: Engineering | Classification: INTERNAL

---

## 1. Scope

This document covers the recovery procedures for the Note Standard Enterprise Financial Platform following a critical failure. It is intended for engineers with production access.

---

## 2. Severity Definitions

| Level | Description | Response Time |
|-------|-------------|---------------|
| SEV-1 | Complete payment system outage — all providers down | Immediate (<5 min) |
| SEV-2 | Single critical provider down — failover active | 15 min |
| SEV-3 | Elevated error rate or degraded performance | 1 hour |
| SEV-4 | Minor UI/reporting issue, no payment impact | Business hours |

---

## 3. Emergency Contacts

| Role | Contact Method |
|------|---------------|
| On-call Engineer | PagerDuty / team Slack |
| Fincra Support | api-support@fincra.com |
| Anchor Support | techsupport@getanchor.co |
| Paystack Support | support@paystack.com |
| Grey Support | developers@grey.co |

---

## 4. Critical Systems Overview

```
Request → FinancialOrchestrator
            ├── FraudIntelligenceLayer
            ├── PaymentPolicyEngine
            ├── RoutingEngine → FailoverCoordinator
            │     ├── AnchorProvider     ← Primary NGN banking
            │     ├── FincraProvider     ← NGN/USD
            │     ├── PaystackProvider   ← NGN payments
            │     └── GreyProvider       ← USD/EUR/GBP
            ├── LedgerService (double-entry)
            ├── SettlementPositionService
            └── NightlyReconciliationPipeline
```

---

## 5. Scenario: All Providers Down (SEV-1)

**Symptoms**: 100% payment failure rate, FailoverCoordinator routing to manual queue.

### Steps:
1. **Confirm via health check**: `GET /api/admin/treasury/providers/health`
2. **Check provider health scores**: `GET /api/admin/treasury/routing/health-scores`
3. **Check provider status pages**: Fincra / Anchor / Paystack status sites
4. **Enable maintenance mode** via admin panel (suspends new payments)
5. **Drain in-flight payments**: All pending operations will auto-route to manual queue (`payout_requests` with `status=MANUAL_REVIEW`)
6. **Process manual queue**: Review `payout_requests` and execute manually when providers recover
7. **Re-run failed executions**: `POST /api/admin/treasury/replay` after providers recover
8. **Verify reconciliation**: `POST /api/admin/treasury/reconciliation/trigger`

**Rollback**: Disable `PAYMENT_ENABLED` env flag → deploys hold until recovery confirmed.

---

## 6. Scenario: Single Provider Down (SEV-2)

**Symptoms**: Single provider health score = 0, circuit OPEN, failover active.

### Steps:
1. **Identify down provider**: Check `/api/admin/treasury/routing/health-scores`
2. **Confirm circuit is OPEN** in provider_health_status table
3. **Verify failover is working**: Check routing_decisions table — failover_hop > 0
4. **Monitor backup providers**: Ensure they have sufficient liquidity for increased load
5. **Check rebalancing recommendations**: `/api/admin/treasury/rebalancing/recommendations`
6. **When provider recovers**: Circuit auto-enters HALF_OPEN, then CLOSED on success
7. **Force score recompute** (if needed): Trigger TreasuryBalanceSyncWorker via admin

---

## 7. Scenario: Reserve Deficit (SEV-1 / SEV-2)

**Symptoms**: Reserve ratio < 100% for any currency. AI insights show `RESERVE_DEFICIT CRITICAL`.

### Steps:
1. **Check reserve ratios**: `GET /api/admin/treasury/reserves`
2. **Run balance proof**: `GET /api/admin/treasury/balance-proof`
3. **Identify which provider is underweight**: Review `provider_breakdown` in response
4. **Immediate action**: Manually top up the affected provider via treasury transfer
5. **Suspend withdrawals** for affected currency if ratio drops below 95%
6. **Run reconciliation** to confirm no ledger errors: `POST /api/admin/treasury/reconciliation/trigger`

---

## 8. Scenario: Idempotency / Duplicate Payment

**Symptoms**: Customer reports double charge. Admin sees two completed executions.

### Steps:
1. **Lookup correlation ID**: `GET /api/admin/treasury/correlation/{correlation_id}`
2. **Check provider_history** in the execution log — was there a failover?
3. **Check settlement positions**: Confirm which providers received value
4. **If duplicate confirmed**: Initiate reversal via Anchor/Fincra refund endpoint
5. **Issue customer credit** via manual ledger adjustment (requiresAdmin)
6. **File root cause**: Was idempotency_key missing from the original request?

---

## 9. Scenario: Reconciliation Discrepancy

**Symptoms**: Nightly reconciliation shows AMOUNT_MISMATCH or INTERNAL_ONLY items.

### Steps:
1. **View run detail**: `GET /api/admin/treasury/reconciliation/runs/{run_id}`
2. **Filter by AMOUNT_MISMATCH**: Check internal_amount vs. provider_amount
3. **Fetch original transaction from provider dashboard** to confirm
4. **If provider record is authoritative**: Update internal record with admin adjustment
5. **If internal record is authoritative**: Raise dispute with provider
6. **Document outcome** in reconciliation_line_items (update requires_action = false)

---

## 10. Scenario: Failed Payment — Event Replay

**Symptoms**: Payment stuck in FAILED state due to transient provider error.

### Steps:
1. **View replay queue**: `GET /api/admin/treasury/replay/pending`
2. **Check retry count**: Max retries = 5. If at 5, requires manual resolution.
3. **Replay specific correlation ID**: `POST /api/admin/treasury/replay/{correlation_id}`
4. **Or replay all failed**: `POST /api/admin/treasury/replay`
5. **Monitor execution**: Poll `GET /api/admin/treasury/correlation/{id}` for new state
6. **If replay fails again**: Route to manual queue and contact provider

---

## 11. Database Recovery Points

| Table | Purpose | Recovery Action |
|-------|---------|----------------|
| payment_execution_log | All payment attempts | Do NOT modify directly — use EventReplayWorker |
| settlement_positions | Settlement state | advance via SettlementPositionService only |
| immutable_audit_log | Full audit trail | READ ONLY — never delete |
| ledger_entries_v6 | Double-entry ledger | Adjustments via LedgerService only |
| wallets_v6 | User balances | Never modify directly — use LedgerService |
| reconciliation_runs | Nightly recon history | Read-only reference |

---

## 12. Recovery Verification Checklist

After any recovery action, confirm:

- [ ] `GET /api/admin/treasury/providers/health` — all providers HEALTHY
- [ ] `GET /api/admin/treasury/reserves` — all currencies reserve ratio ≥ 100%
- [ ] `GET /api/admin/treasury/routing/health-scores` — no composite score = 0
- [ ] `GET /api/admin/treasury/replay/pending` — no unresolved FAILED executions
- [ ] `GET /api/admin/treasury/settlement-pipeline/stuck` — no stuck settlements
- [ ] `GET /api/admin/treasury/insights` — no CRITICAL insights unacknowledged
- [ ] Run nightly reconciliation to confirm no residual discrepancies

---

## 13. Environment Variables (Critical)

```bash
# Provider Enables
ANCHOR_ENABLED=true
FINCRA_ENABLED=true
PAYSTACK_ENABLED=true
GREY_ENABLED=true

# Failover Config
FAILOVER_MAX_HOPS=3

# Smart FX (disabled by default)
SMART_FX_ENABLED=false

# Operations
PAYMENT_ENABLED=true
MAINTENANCE_MODE=false
```

---

*Last updated: Phase 16 implementation. Review quarterly.*
