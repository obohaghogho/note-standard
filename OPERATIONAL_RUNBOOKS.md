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

---

### Playbook 5: Realtime Gateway Restart / Reconnect Storm
- **Trigger**: Realtime Gateway health check fails or process crashes, triggering automated restart.
- **Impact**: All connected WebSockets drop and immediately attempt to reconnect, causing a "Reconnect Storm".
- **Automated Mitigation**: The Gateway auto-restarts. `ChatContext` on client-side automatically refetches `loadConversations` and `loadMessages` to catch up on any missed activity.
- **Manual Actions**:
  1. Monitor Render dashboard for Gateway CPU/Memory spikes during the reconnect surge.
  2. Verify that duplicate messages are not being generated (idempotency checks).
  3. If Gateway loops in crashing, inspect `pm2` or Render logs for memory leaks.

---

### Playbook 6: Supabase / Database Outage
- **Trigger**: Express API or Gateway reports persistent `Connection timeout` or `5xx` errors from Supabase REST/GraphQL endpoints.
- **Automated Mitigation**: Express API utilizes exponential backoff for critical writes. Read queries fail fast to prevent connection pool exhaustion.
- **Manual Actions**:
  1. Check [Supabase Status](https://status.supabase.com).
  2. If database is in recovery, disable heavy background jobs (e.g., `DLQProcessor`).
  3. Post status update to end users: "Messaging is temporarily degraded."

---

### Playbook 7: Cloudinary (Media) Outage
- **Trigger**: High failure rate on `CloudinaryService.uploadBase64()`.
- **Automated Mitigation**: Rollback manager automatically cleans up local database records if the Cloudinary upload fails, preventing orphaned references.
- **Manual Actions**:
  1. Check Cloudinary status.
  2. Temporarily disable avatar/banner uploads in the frontend UI if outage is prolonged.

---

### Playbook 8: Sentry Alert & Incident Triaging
- **Trigger**: Sentry alerts on error rate spike (>1% of requests) or uncaught exception in API / Realtime Gateway.
- **Severity Classification**:
  - **P1 (Critical)**: Payment/Ledger failure, Auth login down, Realtime Gateway crash loop.
  - **P2 (Major)**: 500 error on non-critical endpoint, WebSocket latency > 1000ms.
  - **P3 (Minor)**: UI render error gracefully caught by Sentry ErrorBoundary.
- **Triage Steps**:
  1. Open the Sentry Issue trace and extract the `correlation_id` tag.
  2. Query server diagnostic logs by correlation ID: `grep "<correlation_id>" server/logs/*.log`.
  3. Inspect stack trace and user context (user ID, browser version, route).
  4. If security incident or token leak is suspected, execute immediate token revocation.

---

### Playbook 9: System Telemetry & Performance Monitoring
- **Monitoring Endpoint**: `GET /api/system/metrics`
- **Key Metrics to Track**:
  - `memory.heapUtilizationPct`: Alert if sustained > 85% (potential memory leak).
  - `performance.eventLoopLagMs`: Alert if > 150ms (CPU bound synchronous work blocking Express).
  - `database.connected`: Alert immediately if `false` or `latencyMs` > 1500ms.
- **Remediation**:
  1. For high heap utilization: Inspect active worker queues via `WorkerManager.js` and restart the process if necessary.
  2. For high event loop lag: Identify unindexed database queries or heavy synchronous JSON parsing.
