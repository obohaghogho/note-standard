# NoteStandard Payment Platform

Production-grade, provider-agnostic payment backend built with **Next.js 14**, **TypeScript**, and **Supabase**.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    API Routes (v1)                    │
│  /wallets  /payments  /withdrawals  /webhooks  /admin │
├──────────────────────────────────────────────────────┤
│                 Auth Middleware (JWT)                  │
│            ┌──────────────┐                           │
│            │ Wallet       │                           │
│            │ Gateway      │                           │
│            └──────┬───────┘                           │
│   ┌───────────────┼───────────────┐                   │
│   │               │               │                   │
│   ▼               ▼               ▼                   │
│ Transaction    Risk Engine    Feature Flags            │
│ Engine                                                │
│   │                                                   │
│   ▼                                                   │
│ Provider Registry ──── Health Monitor                 │
│   │                                                   │
│   ├── Paystack Adapter (payment + payout)              │
│   ├── Fincra Adapter (stubbed)                        │
│   └── NowPayments Adapter (stubbed)                   │
│                                                       │
│ ┌─────────────────────────────────────────┐           │
│ │  Wallet Service ◄── PostgreSQL RPC      │           │
│ │  Ledger Service    (atomic operations)  │           │
│ │  Reservation Service                    │           │
│ └─────────────────────────────────────────┘           │
│                                                       │
│ Event Bus ──► Audit Service                           │
│           ──► Notification Service (Realtime)         │
│                                                       │
│ Job Queue ──► Scheduled Jobs (reconciliation, expiry) │
└──────────────────────────────────────────────────────┘
```

## Key Design Principles

- **Ledger-First**: Every balance mutation creates an immutable ledger entry via atomic PostgreSQL functions
- **Provider-Agnostic**: Payment providers implement interfaces; business logic never touches provider-specific types
- **Event-Driven**: Services communicate through a typed event bus for loose coupling
- **Feature Flags**: Every capability can be toggled on/off per tier without deployment
- **Reservation Engine**: Funds flow through Available → Reserved → Locked → Debited

## Project Structure

```
src/
├── app/
│   └── api/v1/
│       ├── admin/reconciliation/    # Admin: trigger reconciliation
│       ├── health/                  # Health check (unauthenticated)
│       ├── payments/
│       │   ├── initialize/          # POST: start deposit flow
│       │   └── verify/              # GET: verify + credit wallet
│       ├── transactions/            # GET: paginated transaction history
│       ├── wallets/                 # GET/POST: list/create wallets
│       │   └── [id]/                # GET: wallet detail + recent txns
│       ├── webhooks/[provider]/     # POST: provider webhooks (HMAC auth)
│       └── withdrawals/             # GET/POST: list/create withdrawals
│           └── [id]/                # GET: withdrawal detail
├── lib/
│   ├── auth/middleware.ts           # withAuth() and withWebhook() HOFs
│   ├── container.ts                 # Service dependency container
│   ├── events/                      # Typed event bus + subscribers
│   ├── gateway/wallet-gateway.ts    # Unified wallet operations
│   ├── jobs/scheduled-jobs.ts       # Periodic job definitions
│   ├── providers/
│   │   ├── interfaces/              # Provider contracts (payment, crypto, payout)
│   │   ├── paystack/                # Full Paystack implementation
│   │   ├── fincra/                  # Stubbed for future
│   │   ├── nowpayments/             # Stubbed for future
│   │   ├── provider-registry.ts     # Provider selection by currency/method
│   │   ├── health-monitor.ts        # Provider health tracking
│   │   └── webhook-dispatcher.ts    # Signature validation + normalization
│   ├── queue/                       # Database-backed job queue
│   ├── supabase/                    # Server + browser Supabase clients
│   └── utils/                       # Errors, money, reference, response, env
├── services/
│   ├── audit.service.ts             # Immutable audit logging
│   ├── exchange-rate.service.ts     # Currency conversion
│   ├── feature-flag.service.ts      # Feature flag evaluation
│   ├── ledger.service.ts            # Ledger entry queries
│   ├── notification.service.ts      # In-app notifications (Realtime)
│   ├── reconciliation.service.ts    # Balance integrity verification
│   ├── reservation.service.ts       # Wallet fund reservations
│   ├── risk-engine.service.ts       # Risk scoring + velocity checks
│   ├── system-config.service.ts     # Dynamic system configuration
│   ├── transaction-engine.service.ts# Central payment orchestrator
│   ├── wallet.service.ts            # Wallet CRUD + RPC mutations
│   └── withdrawal.service.ts        # Withdrawal flow management
├── types/index.ts                   # Shared TypeScript types + enums
└── middleware.ts                    # Next.js edge middleware (trace IDs)

supabase/migrations/
├── 001_create_tables.sql            # 15 tables, indexes, RLS, seed data
└── 002_create_functions.sql         # 9 atomic PostgreSQL functions
```

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Paystack](https://paystack.com) account (for NGN payments)

### Setup

1. **Clone and install**:
   ```bash
   cd payment-platform
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   # Fill in your Supabase and Paystack credentials
   ```

3. **Run database migrations**:
   - Go to your Supabase project → SQL Editor
   - Run `supabase/migrations/001_create_tables.sql`
   - Run `supabase/migrations/002_create_functions.sql`

4. **Start development server**:
   ```bash
   npm run dev
   ```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/health` | None | Health check |
| `GET` | `/api/v1/wallets` | JWT | List user wallets |
| `POST` | `/api/v1/wallets` | JWT | Create a wallet |
| `GET` | `/api/v1/wallets/:id` | JWT | Wallet detail + recent transactions |
| `POST` | `/api/v1/payments/initialize` | JWT | Start a deposit (returns checkout URL) |
| `GET` | `/api/v1/payments/verify?reference=` | JWT | Verify and credit deposit |
| `GET` | `/api/v1/transactions` | JWT | Paginated transaction history |
| `POST` | `/api/v1/withdrawals` | JWT | Create a withdrawal request |
| `GET` | `/api/v1/withdrawals` | JWT | List withdrawal requests |
| `GET` | `/api/v1/withdrawals/:id` | JWT | Withdrawal detail |
| `POST` | `/api/v1/webhooks/:provider` | HMAC | Provider webhook receiver |
| `POST` | `/api/v1/admin/reconciliation` | JWT | Trigger full reconciliation |

## Deposit Flow

```
User → POST /payments/initialize { amount: 500, currency: "NGN" }
  │
  ├── Feature Flag Check (deposits enabled?)
  ├── Risk Assessment (velocity, limits, account age)
  ├── Provider Selection (Paystack for NGN)
  ├── Paystack: Initialize Transaction
  │
  └── Response: { checkoutUrl, reference, accessCode }

User → Redirected to Paystack checkout page
  │
  └── User completes payment

Paystack → POST /webhooks/paystack  (charge.success)
  │
  ├── HMAC-SHA512 Signature Validation
  ├── Normalize Webhook Event
  ├── Verify Transaction with Paystack API
  ├── Credit Wallet (atomic PG function)
  ├── Create Ledger Entry
  ├── Update Provider Transaction
  ├── Emit deposit.completed Event
  │   ├── Audit Log
  │   └── In-App Notification
  │
  └── 200 OK
```

## Withdrawal Flow

```
User → POST /withdrawals { amount: 100, currency: "NGN", ... }
  │
  ├── Feature Flag Check
  ├── Validate Balance (amount + fee)
  ├── Risk Assessment
  ├── Reserve Funds (available → reserved)
  │
  ├── If amount ≤ ₦50,000 AND risk=allow → Auto-approve
  └── If amount > ₦50,000 OR risk=flag → Pending manual review
```

## Technology Stack

- **Runtime**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL via Supabase
- **Auth**: Supabase Auth (JWT)
- **Real-time**: Supabase Realtime (notifications)
- **Payment**: Paystack (NGN deposits/withdrawals)
- **Queue**: PostgreSQL-backed (upgradeable to Redis/BullMQ)

## License

Proprietary — NoteStandard
