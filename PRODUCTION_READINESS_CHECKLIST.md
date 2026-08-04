# NoteStandard Production Readiness Checklist

This checklist must be fully verified by the engineering and operations team before the public launch and before resuming development on the Wallet/Treasury systems.

## 1. Infrastructure & Reliability
- [ ] **Load Testing (Sprint 1)**: Artillery scenarios executed against staging.
- [ ] **Bottlenecks Resolved**: API CPU/Memory, Gateway event loops, and database connection pools are stable under 2,000 concurrent user load.
- [ ] **Database Backups**: Automated daily backups verified in Supabase.
- [ ] **Restore Procedures**: A full database point-in-time recovery has been tested in staging.
- [ ] **Deployment Rollbacks**: Render automatic rollbacks tested (e.g., deploying a broken build to ensure it reverts gracefully).
- [ ] **Environment Parity**: Staging environment configuration strictly matches Production.

## 2. Security Review
- [ ] **Row Level Security (RLS)**: All Supabase tables have strict policies preventing unauthorized reads/writes.
- [ ] **JWT Validation**: All Express endpoints properly validate JWT signatures and expiration.
- [ ] **Upload Authorization**: Cloudinary endpoints correctly verify user ownership before accepting media.
- [ ] **Rate Limits**: `express-rate-limit` thresholds are tuned and active for auth, uploads, and social actions.
- [ ] **Input Sanitization**: All user-generated content (Bios, Messages, Names) is sanitized to prevent XSS.
- [ ] **Dependency Audit**: `npm audit` run and all high/critical vulnerabilities resolved.
- [ ] **Secrets Management**: All API keys (Cloudinary, Supabase Service Role) rotated immediately prior to launch.

## 3. CI/CD & Performance Budgets
- [ ] **Automated E2E (Sprint 2)**: Playwright suite runs nightly without flaky failures.
- [ ] **Performance Thresholds**: Bundle size limits configured in CI to prevent frontend bloat.
- [ ] **Accessibility (a11y)**: `axe-core` sweeps integrated and passing.

## 4. Observability & Monitoring (Sprint 3)
- [ ] **Structured Logging**: Pino logs aggregating successfully in Render / external log sink.
- [ ] **Alerts Configured**: PagerDuty/Slack alerts fire if API Error Rate > 1% or Gateway CPU > 80%.
- [ ] **Dashboards**: Operations dashboard active for monitoring concurrent WebSockets and Delivery latencies.
- [ ] **Operational Runbooks**: Team has read and validated `OPERATIONAL_RUNBOOKS.md` for outage response.

## 5. Beta Program (Sprint 4)
- [ ] **Closed Beta Launch**: Platform opened to 100-500 controlled real users.
- [ ] **Telemetry Review**: Crash frequency and API errors monitored during beta.
- [ ] **User Feedback**: Feedback aggregated and critical UX bugs triaged.
