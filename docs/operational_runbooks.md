# NoteStandard Enterprise Payout System — Operational & Disaster Recovery Runbooks

## Overview
This runbook provides step-by-step procedures for FinOps engineers, system administrators, and incident response teams operating NoteStandard's Enterprise Withdrawal System.

---

## Runbook 1: Payment Provider Outage & Circuit Breaker Activation

### Symptom
- Fincra API responds with `502 Bad Gateway`, `504 Gateway Timeout`, or network connection reset.
- Circuit breaker state transitions to `OPEN`.
- Logs emit `[CircuitBreaker] 🚨 Threshold reached. Circuit OPEN`.

### Automated System Behavior
1. New withdrawal requests are checked against the Circuit Breaker.
2. If `ENABLE_PROVIDER_FAILOVER` is true, requests fail over to secondary providers (e.g. Paystack).
3. If failover is unavailable, payouts are safely enqueued to `withdrawal_retry_queue`.
4. Users receive a friendly message: *"Withdrawals are currently undergoing provider maintenance and will be processed automatically."*

### Manual Operator Actions
1. **Check Provider Status Page:** Verify Fincra status (https://status.fincra.com) or Paystack status.
2. **Inspect Circuit Breaker State:**
   - Query system health endpoint: `GET /api/v1/withdrawals/health`
3. **Manual Failover / Override:**
   - If Fincra is expected to remain down for > 1 hour, enable Paystack primary failover via DB config:
     ```sql
     UPDATE withdrawal_system_config
     SET value = jsonb_set(value, '{ENABLE_PROVIDER_FAILOVER}', 'true')
     WHERE key = 'feature_flags';
     ```
4. **Post-Incident Recovery:**
   - Once Fincra recovers, the circuit breaker automatically transitions to `HALF_OPEN` to probe system health.
   - Once 5 consecutive successful requests complete, state returns to `CLOSED`.

---

## Runbook 2: High Retry Queue Backlog & Dead Letter Queue (DLQ) Resolution

### Symptom
- Payouts accumulating in `withdrawal_retry_queue` with status `PENDING`.
- Unresolved entries appearing in `withdrawal_dlq`.

### Manual Operator Actions
1. **Fetch Unresolved DLQ Items:**
   - Call Admin API: `GET /api/v1/admin/withdrawals/dlq`
2. **Identify Root Cause:**
   - **Invalid Account Number / Bank:** Review `failure_reason`. If beneficiary details are invalid, reject transaction and verify wallet balance was restored via `finalize_enterprise_withdrawal`.
   - **Low Merchant Reserve:** Verify Fincra merchant account balance. If balance was low, top up Fincra merchant wallet via bank transfer.
3. **Trigger Webhook / Transaction Replay:**
   - Post to Replay API for affected transaction:
     ```json
     POST /api/v1/admin/webhooks/replay
     { "reference": "FIN_PAYOUT_12345678" }
     ```

---

## Runbook 3: Low Fincra Merchant Reserve Alert

### Symptom
- Logs emit `[MerchantBalanceWorker] ⚠️ LOW MERCHANT RESERVE ALERT: Available balance < ₦500,000`.

### Manual Operator Actions
1. **Log into Fincra Merchant Portal:** Check NGN main wallet balance.
2. **Initiate Top-Up:** Transfer required funds from NoteStandard Zenith Bank Operations account to Fincra top-up bank account.
3. **Verify Auto-Sync:** Wait 60 seconds for `merchantBalanceWorker` to poll Fincra and update `fincra_merchant_balance_logs`.

---

## Recovery Objectives Matrix

| Outage Scenario | RTO Target | RPO Target | Primary Recovery Action |
| :--- | :--- | :--- | :--- |
| **Fincra API Outage** | < 2 Minutes | 0 Data Loss | Circuit Breaker + Auto Failover to Paystack |
| **Database Connection Failure** | < 5 Minutes | 0 Data Loss | Supabase pooler reconnection & transaction replay |
| **Redis Cache / Lock Failure** | Immediate (< 1s) | 0 Data Loss | Automatic fallback to In-Memory Mutex |
| **Missed Webhooks** | < 10 Minutes | 0 Data Loss | Reconciliation Worker auto-healing + Webhook Replay Tool |
