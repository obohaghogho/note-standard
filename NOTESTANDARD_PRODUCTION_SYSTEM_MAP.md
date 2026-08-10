# NOTESTANDARD PRODUCTION SYSTEM MAP
**Version:** 1.0.0 — Enterprise Production Readiness Audit
**Repository Root:** `d:\Users\Manuel\OneDrive\Desktop\note-standard-latest`
**Generated Date:** August 10, 2026

---

## 1. Executive System Overview

NoteStandard is an enterprise-grade multi-tenant collaborative note-taking, realtime chat, and integrated multi-currency financial/wallet platform. The system is architected as a Node.js monorepo containing three core services (`client`, `server`, and `realtime-gateway`), backed by Supabase PostgreSQL, external financial banking providers (Anchor BaaS, Fincra, Paystack, Grey), and PWA push notification services.

```
                               ┌───────────────────────────┐
                               │     React 19 PWA Client   │
                               │   (Vite + Zustand + TS)   │
                               └─────────────┬─────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │                                           │
                       ▼                                           ▼
         ┌───────────────────────────┐               ┌───────────────────────────┐
         │     Express API Server    │               │  Realtime Gateway Server  │
         │    (Port 5000 / Express 5) │               │   (Port 4000 / Socket.IO) │
         └─────────────┬─────────────┘               └─────────────┬─────────────┘
                       │                                           │
                       │             ┌──────────────┐              │
                       └────────────►│ Supabase DB  │◄─────────────┘
                                     │ (PostgreSQL) │
                                     └──────────────┘
```

---

## 2. Frontend Subsystem (`/client`)

### Tech Stack
- **Framework & Builder:** React `^19.2.0`, Vite `^6.4.1`, TypeScript `~5.9.3`
- **State Management:** Context API (15 dedicated contexts) & Zustand `^5.0.9` (`chatStore`, `feedStore`, `useFeedbackStore`)
- **Routing:** `react-router-dom` `^7.11.0`
- **Styling:** TailwindCSS `^4.2.1` with custom theme utilities
- **Realtime / Sockets:** `socket.io-client` `^4.8.3`
- **Database Client:** `@supabase/supabase-js` `^2.89.0`
- **PWA & Offline:** `public/sw.js` (Service Worker for Push & caching), IndexedDB/localStorage offline queue (`messageQueue.ts`, `chatCache.ts`)

### Key Components & Contexts
- `AuthContext.tsx`: Manages authentication state, user session, tokens, profile sync.
- `ChatContext.tsx`: Primary messaging state machine orchestrator, integrating local optimistic state with HTTP REST and Socket.IO events.
- `WalletContext.tsx`: Handles multi-currency fiat & crypto balance fetching, deposits, withdrawals, transfers, and transaction history.
- `NotificationContext.tsx`: Manages WebPush registration, permission requesting, badge counts, and in-app alerts.
- `PresenceContext.tsx` & `SocketContext.tsx`: Realtime user presence and gateway connection lifecycle.
- `NotesContext.tsx` & `NotesDashboardContext.tsx`: Note creation, rich editing (`react-quill-new`), AI summaries, and folder organization.

### Frontend Service Layer
- `ChatViewportEngine.ts`: Dynamic windowing and view rendering for large chat histories.
- `messageOrderingEngine.ts`: Monotonic message sorting and client-side sequence verification.
- `networkPriorityQueue.ts`: Priority execution for offline network retries.
- `anchorApi.ts` & `communityService.ts`: Direct client API adapters for banking & social feed operations.

---

## 3. Core Backend API Server (`/server`)

### Tech Stack
- **Runtime:** Node.js `22.x` (CommonJS module system)
- **Framework:** Express `^5.2.1`
- **Database Access:** `pg` (Native PostgreSQL client `^8.16.3`), `@supabase/supabase-js` `^2.46.1`
- **Security & Utilities:** `helmet` `^8.1.0`, `cors` `^2.8.5`, `express-rate-limit` `^8.2.1`, `bcryptjs` `^3.0.3`, `decimal.js` `^10.6.0`

### API Architecture & Route Modules (`server/routes/`)
- `authRoutes.js` / `auth.js`: User signup, login, password recovery, session verification.
- `walletRoutes.js` / `transactionRoutes.js`: Core balance reads, fiat ledger updates, internal user-to-user transfers.
- `anchorRoutes.js`: Anchor BaaS integration for NGN Virtual Account creation, NUBAN generation, interbank transfers.
- `fincra.js` & `fincraWebhook.js`: Fincra multi-currency collection, payout routes, and IPN webhook handlers.
- `paystackRoutes.js` & `manualDepositRoutes.js`: Paystack payment links and fallback manual deposit approvals.
- `cryptoRoutes.js`: Cryptocurrency deposit, swap, withdrawal, and address management.
- `ads.js`: Ad campaign builder, impression tracking, advertiser billing.
- `chat.js`: Message creation, status updates, history retrieval.
- `notifications.js` & `webhooks.js`: Push notification dispatch, subscription management, external webhooks.
- `admin.js` & `adminCollectionRoutes.js`: Administrative oversight, manual override, system diagnostics.

---

## 4. Realtime Gateway Server (`/realtime-gateway`)

### Tech Stack
- **Server:** Node.js, Express `^4.18.2`, Socket.IO `^4.7.2`
- **Scalability & State:** Redis client (`ioredis` / `redis`), PostgreSQL LISTEN/NOTIFY gateway connector
- **Push Notification Integration:** `web-push` `^3.6.7`, `firebase-admin` `^13.10.0`, `apn` `^2.2.0`

### Realtime Capabilities
- **Socket Authentication:** JWT token parsing and validation via `auth.js` before socket room admission.
- **Room Isolation:** User notification rooms (`user_<userId>`), public/private chat rooms (`conversation_<convId>`).
- **Pub/Sub System:** PostgreSQL `LISTEN/NOTIFY` listener broadcasting DB changes directly to connected socket clients.
- **Correlation & Monotonic Sync:** `CorrelationRegistry.js` for mapping pending client request IDs to authoritative database UUIDs.

---

## 5. Database Architecture & Subsystems (`/supabase` & `/server/database`)

### Engine
- Supabase PostgreSQL 15+

### Core Tables & Schemas
- `profiles`: User identity, role, verification status, preferences.
- `notes`: Title, rich content, tag metadata, user ownership, sharing permissions.
- `conversations` & `conversation_members`: Direct and group chat topologies.
- `messages`: Authoritative message records with delivery/read state timestamps (`sent_at`, `delivered_at`, `read_at`), correlate IDs, and reply bindings.
- `wallets`: User multi-currency balances (NGN, USD, EUR, GBP, BTC, ETH, USDT) with optimistic concurrency locks (`version` column).
- `transactions`: Immutable audit log of all financial movements with status (`PENDING`, `COMPLETED`, `FAILED`).
- `ledger_entries`: Double-entry accounting system tracking debit/credit entries across user accounts and platform reserve accounts.
- `push_subscriptions`: Endpoint URLs, keys (p256dh, auth), and device mapping for WebPush.

### Database Logic (RPCs & Triggers)
- `supabase/migrations/001_create_tables.sql`: Base tables and initial schema definition.
- `supabase/migrations/002_create_functions.sql`: Core wallet RPC functions (`confirm_deposit`, balance transfers).
- `supabase/migrations/010_add_confirm_deposit_rpc.sql`: Idempotent deposit settlement stored procedure.
- `supabase/migrations/011_fix_broken_triggers_and_schema.sql`: Schema integrity fixes and timestamp trigger updates.

---

## 6. Financial & Payment Gateway Integrations

1. **Anchor BaaS (`/server/routes/anchorRoutes.js`)**
   - NGN virtual account generation (NUBAN).
   - Inbound NGN bank transfers.
   - Outbound interbank settlement.
2. **Fincra Gateway (`/fincra-gateway` & `/server/routes/fincra.js`)**
   - Multi-currency payouts and collections (NGN, USD, EUR, GBP).
   - Dedicated webhook listener (`fincraWebhook.js`) verifying signature headers.
3. **Paystack (`/server/routes/paystackRoutes.js`)**
   - Card payments, USSD, bank checkout flows.
4. **Grey Settlement (`/server/tests/greyBankingIntegration.test.js`)**
   - Foreign exchange clearing and cross-border settlement logic.
5. **Crypto Service (`/server/routes/cryptoRoutes.js`)**
   - On-chain wallet address generation, deposit listening, exchange rate calculation, crypto swaps.

---

## 7. Authoritative Frozen Subsystems (DO NOT ALTER)

As specified in **Directive Rule 2**, the following messaging subsystems are FROZEN and AUTHORITATIVE:

1. `CorrelationRegistry` (`realtime-gateway/services/CorrelationRegistry.js` or `server/realtime/CorrelationRegistry.js`)
2. `mergeMessageMonotonic` (`client/src/context/ChatContext.tsx`)
3. `STATUS_RANK` state transition hierarchy
4. `message delivery/read state machine`
5. `offline/reconnect synchronization architecture`
6. `server/tests/messageStateMachine.test.js` (VERIFIED: 10/10 PASS)
7. `server/tests/offlineReconnect.test.js` (VERIFIED: 20/20 PASS)
8. `server/tests/productionEventPath.test.js` (VERIFIED: 5/5 PASS)
9. Established delivery/read receipt routing

---

## 8. Deployment & CI/CD Infrastructure

- **Vercel (`vercel.json`):** Frontend deployment configuration with single-page application rewriting.
- **Render (`render.yaml`):** Backend web service and realtime gateway container specs.
- **Codemagic (`codemagic.yaml`):** Android APK / PWA mobile build workflow.
- **Husky & ESLint:** Pre-commit hooks and static analysis.
