# NoteStandard Enterprise Banking Platform - Operational Runbooks & Incident Response Playbooks

This document contains standard operating procedures (SOPs) and incident response playbooks for site reliability engineers (SREs), treasury officers, and banking operations staff.

---

## 📖 Incident Response Playbooks

### Playbook 1: Provider Outage / API Degradation
- **Trigger**: Provider latency exceeds 500ms or circuit breaker state transitions to `OPEN`.
- **Automated Mitigation**: `CircuitBreakerService` automatically trips and `RecommendationEngine` routes traffic to secondary provider (`anchor` / `conduit`).
- **Manual Actions**:
  1. Check `307_provider_health` telemetry dashboard.
  2. Verify fallback routing in `recommendation_cache`.
  3. Contact provider support if outage exceeds 15 minutes.

---

### Playbook 2: Treasury Liquidity Threshold Breach
- **Trigger**: `liquidity_snapshots` reports available balance below 24-hour projected requirement.
- **Automated Mitigation**: `TreasuryOptimizer` alerts treasury team and generates a `treasury_transfers` rebalancing proposal.
- **Manual Actions**:
  1. Review proposed transfer in administrative portal.
  2. Approve transfer via `TreasuryTransferService`.
  3. Verify double-entry journal posting in `journals` and `ledger_entries`.

---

### Playbook 3: DLQ Retry Exhaustion & Replay
- **Trigger**: `dead_letter_queue` receives failed event with classification `TRANSIENT` or `PERMANENT`.
- **Manual Actions**:
  1. Inspect root cause using `DLQProcessor.js`.
  2. If transient issue resolved, execute admin replay via `DLQProcessor.replayEvent(id)`.
  3. Verify idempotent completion in `webhook_events`.

---

### Playbook 4: Automated Rollback Triggered
- **Trigger**: `RollbackManager` detects metric breach (webhook failure > 2% or ledger posting failure > 0).
- **Automated Mitigation**: Active canary rollout halted; traffic restored to previous stable release.
- **Manual Actions**:
  1. Inspect release audit log in `326_release_audits`.
  2. Identify failing commit/migration.
  3. File post-mortem report and prepare hotfix release.
