# NoteStandard Production Readiness Checklist

This checklist must be fully verified by the engineering and operations team before the public launch and before resuming development on the Wallet/Treasury systems.

## 1. Infrastructure & Reliability
- [x] **Load Testing (Sprint 1)**: High-throughput stress test suite executed (500 users, 605 msg/sec sustained, 100% success rate).
- [x] **Bottlenecks Resolved**: Eliminated remote Supabase roundtrip bottleneck in Realtime Gateway; implemented local JWT verification.
- [ ] **Database Backups**: Automated daily backups verified in Supabase.
- [ ] **Restore Procedures**: A full database point-in-time recovery has been tested in staging.
- [ ] **Deployment Rollbacks**: Render automatic rollbacks tested (e.g., deploying a broken build to ensure it reverts gracefully).
- [ ] **Environment Parity**: Staging environment configuration strictly matches Production.

## 2. Security Review
- [ ] **Row Level Security (RLS)**: All Supabase tables have strict policies preventing unauthorized reads/writes.
- [x] **JWT Validation**: Realtime gateway and Express API validate JWT signatures locally with zero-overhead fallback.
- [ ] **Upload Authorization**: Cloudinary endpoints correctly verify user ownership before accepting media.
- [x] **Rate Limits**: `express-rate-limit` thresholds tuned and active for auth, uploads, and social actions.
- [x] **Input Sanitization**: User-generated content sanitized to prevent XSS.
- [x] **Dependency Audit**: `npm audit` reviewed and secret leaks prevented via `.gitignore`.
- [ ] **Secrets Management**: All API keys rotated prior to launch.

## 3. CI/CD & Performance Budgets
- [x] **Automated E2E (Sprint 2)**: Playwright suite scaffolded across auth, messaging, network, security, profile, and a11y.
- [x] **CI Permissions & Checkout**: Fixed CI GitHub Actions token permissions and git clone depth.
- [x] **Accessibility (a11y)**: Playwright automated accessibility checks configured.

## 4. Observability & Monitoring (Sprint 3)
- [x] **Sentry Error Tracking**: `@sentry/react` (frontend) and `@sentry/node` (API & Realtime Gateway) integrated with PII scrubbing and correlation ID tagging.
- [x] **Telemetry & Metrics**: `/api/system/metrics` endpoint deployed for tracking memory RSS, heap utilization, event loop lag, and database latency.
- [x] **Operational Runbooks**: `OPERATIONAL_RUNBOOKS.md` updated with incident response playbooks for Sentry alert triage, reconnect storms, and telemetry.
- [ ] **Alerts Configured**: PagerDuty/Slack/Discord webhook alerts linked to Sentry project DSN.

## 5. Beta Program (Sprint 4)
- [x] **Closed Beta Launch Framework**: In-app feedback widget, telemetry capturing, and `354_beta_feedback_table.sql` deployed.
- [x] **Tester Guidance & Scenarios**: `BETA_TESTING_GUIDE.md` published with cohort rollout milestones and SLA matrices.
- [x] **Admin Triage Dashboard**: Operations triage center available at `/admin/beta-feedback` for live sentiment tracking.
- [ ] **Closed Beta Launch**: Platform opened to 100-500 controlled real users.
- [ ] **Telemetry Review**: Crash frequency and API errors monitored during beta.
- [ ] **User Feedback**: Feedback aggregated and critical UX bugs triaged.

## 6. Enterprise Wallet & Treasury Architecture (Sprint 5)
- [x] **Enterprise Collection & Deposit Allocation**: Multi-currency merchant collection accounts & unallocated deposits queue (`/admin/deposit-monitoring`, `/admin/collection-accounts`).
- [x] **Manual Replay & Posting Engine**: `UnallocatedDepositsService` double-entry posting logic connected for crediting customer liability accounts.
- [x] **Treasury Watchtower & Reconciliation**: Liquidity prediction engine, reserve ratio health index, and multi-sig approval queues deployed (`/admin/crypto-treasury`, `/admin/reconciliation`).

