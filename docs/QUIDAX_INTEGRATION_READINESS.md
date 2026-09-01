# NOTESTANDARD — QUIDAX INTEGRATION READINESS DOCUMENTATION
## Phase 3A Architectural Foundation & Safety Scorecard

---

## 1. CONFIRMED ARCHITECTURAL FACTS

- **Zero NOWPayments Customer Usage**: Database forensic audit (Phase 2A) confirmed 0 customer deposit transactions, 0 ledger credits, and 0 user balances dependent on NOWPayments custody.
- **Authoritative Ledger Sovereignty**: PostgreSQL double-entry ledger functions (`wallets_store`, `wallets_v6`, `ledger_entries`, `execute_ledger_transaction_v6`, `confirm_deposit_v7`) are 100% provider-agnostic and remain the sole source of monetary truth.
- **Provider-Neutral Deposit Address Schema**: Migration 461 created `provider_deposit_addresses` (`id`, `user_id`, `provider`, `asset`, `network`, `address`, `status`, `external_reference`), decoupling deposit address management from legacy provider table names. Legacy `nowpayments_deposit_addresses` table is preserved untouched as read-only historical infrastructure.
- **Provider Selection Governance**: `PaymentFactory.js` and `ProviderCapabilityRegistry.js` support dynamic provider selection based on `ACTIVE_CRYPTO_DEPOSIT_PROVIDER`. Defaults to `nowpayments` when `QUIDAX_ENABLED` is false.
- **Server-Side Secret Isolation**: `QUIDAX_SECRET_KEY` and `QUIDAX_WEBHOOK_SECRET` are read exclusively server-side in `server/config/env.js` and never exposed to client or mobile bundles.
- **Treasury Reserve Solvency**: `MultiProviderReserveEngine.js` explicitly marks Quidax as `NOT_ELIGIBLE_FOR_RESERVE_ASSERTION`, preventing unverified external balance claims from corrupting NoteStandard's Proof-of-Reserves ratio.

---

## 2. QUIDAX DOCUMENTATION REQUIRED (UNKNOWN API CONTRACTS)

The following 6 core provider operations are blocked pending official API specifications and sandbox documentation from Quidax:

1. **Per-User Deposit Address Generation API**: Specific HTTP endpoint, payload format, and network parameter mapping.
2. **Webhook HMAC Signature Format**: Header name, HMAC hashing algorithm (e.g. SHA-256 vs SHA-512), and payload sorting requirements.
3. **External Hot Wallet Balance API**: Account/sub-account balance query endpoints and response schemas for proof of reserves.
4. **Liquidation / Ticker Quote API**: Real-time market rate query format and lock duration guarantees.
5. **Instant Trade / Sell Execution API**: Idempotent trade submission payload format and status fields.
6. **Transaction Status Query API**: Polling recovery endpoint format for deposit and liquidation status verification.

---

## 3. IMPLEMENTED IN PHASE 3A

- **Migration 461**: Created `provider_deposit_addresses` table with composite indexes and Supabase RLS policies.
- **Environment Schema (`server/config/env.js`)**: Added `QUIDAX_ENABLED`, `QUIDAX_SECRET_KEY`, `QUIDAX_PUBLIC_KEY`, `QUIDAX_WEBHOOK_SECRET`, `QUIDAX_BASE_URL`, `QUIDAX_ENVIRONMENT`, and `ACTIVE_CRYPTO_DEPOSIT_PROVIDER`.
- **Quidax Service Boundary (`server/services/quidaxService.js`)**: Strongly isolated service class throwing explicit `QUIDAX_DOCUMENTATION_REQUIRED` / `QUIDAX_PROVIDER_DISABLED` errors for unconfirmed methods.
- **Quidax Provider Adapter (`server/services/payment/providers/QuidaxProvider.js`)**: Adapter extending `BaseProvider`, registered in `PaymentFactory.js`.
- **Quidax Webhook Boundary (`server/controllers/quidaxController.js` & `server/routes/quidaxRoutes.js`)**: Registered `/api/webhooks/quidax` endpoint failing closed with HTTP 401 on unauthenticated webhooks.
- **Treasury Reserve Invariant (`MultiProviderReserveEngine.js`)**: Enforced exclusion of unverified Quidax balance rows from reserve ratio calculations.
- **Automated Test Suite (`server/tests/quidaxFoundation.test.js`)**: 8/8 passing assertions covering fail-closed behavior, security isolation, ledger purity, and treasury guards.

---

## 4. INTENTIONALLY NOT IMPLEMENTED (PENDING QUIDAX DOCS)

- **Fake HTTP API Calls**: Zero fake HTTP requests or mock URLs to api.quidax.com were created.
- **Fake Webhook Signature Validation**: Unauthenticated webhooks fail closed without crediting funds.
- **Synthetic Ledger Credits**: Zero simulated deposits or balance mutations.
- **Production Routing to Quidax**: Production environment remains locked to `ACTIVE_CRYPTO_DEPOSIT_PROVIDER=nowpayments`.

---

## 5. PRODUCTION BLOCKERS (BEFORE PRODUCTION ACTIVATION)

1. Receipt of official Quidax API Documentation and Sandbox credentials.
2. Verification of Quidax Webhook HMAC Signature Specification.
3. Successful completion of Quidax KYB business verification.
4. Passing End-to-End Sandbox Integration Tests.
