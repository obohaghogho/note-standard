-- =============================================================================
-- Migration 232: Fincra Payment Infrastructure Integration (Additive Only)
-- =============================================================================
-- SAFETY CONTRACT:
--   - This migration creates ONLY NEW tables.
--   - No existing tables (wallets_store, wallets_v6, profiles, transactions,
--     payments, webhook_logs, etc.) are modified, altered, or renamed.
--   - All foreign keys follow the existing pattern: REFERENCES public.profiles(id)
--   - All tables are isolated under the fincra_ namespace.
--   - Rollback: DROP TABLE IF EXISTS fincra_audit_logs, fincra_webhook_logs,
--               fincra_wallet_links, fincra_transactions;
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- TABLE 1: fincra_transactions
-- Stores every Fincra-sourced financial operation (deposits, withdrawals,
-- conversions). This is the audit trail for all Fincra-originated events.
-- Linked to NoteStandard ledger events via reference.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fincra_transactions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reference         VARCHAR(128) NOT NULL UNIQUE,
    fincra_reference  VARCHAR(128),
    type              VARCHAR(20)  NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL', 'CONVERSION')),
    currency          VARCHAR(10)  NOT NULL CHECK (currency IN ('NGN', 'USD', 'EUR')),
    amount            NUMERIC(20, 8) NOT NULL DEFAULT 0,

    -- Extended state machine for full lifecycle tracking:
    -- CREATED    → Transaction record initialised.
    -- PENDING    → Awaiting Fincra response.
    -- RESERVED   → Funds reserved in NoteStandard ledger (for withdrawals).
    -- PROCESSING → Fincra is processing the event.
    -- SUCCESSFUL → Fincra confirmed success; ledger committed.
    -- FAILED     → Fincra or internal failure.
    -- REVERSED   → Reservation reversed; funds returned to user wallet.
    status            VARCHAR(20)  NOT NULL DEFAULT 'CREATED'
                        CHECK (status IN ('CREATED', 'PENDING', 'RESERVED', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REVERSED')),

    metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fincra_txn_user_id      ON public.fincra_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_fincra_txn_reference    ON public.fincra_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_fincra_txn_fincra_ref   ON public.fincra_transactions(fincra_reference);
CREATE INDEX IF NOT EXISTS idx_fincra_txn_status       ON public.fincra_transactions(status);
CREATE INDEX IF NOT EXISTS idx_fincra_txn_created_at   ON public.fincra_transactions(created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE 2: fincra_wallet_links
-- Maps NoteStandard users to their Fincra virtual wallet / virtual account IDs.
-- One user may have links for multiple currencies (NGN, USD, EUR).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fincra_wallet_links (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    fincra_wallet_id  VARCHAR(128) NOT NULL,
    currency          VARCHAR(10)  NOT NULL CHECK (currency IN ('NGN', 'USD', 'EUR')),
    account_number    VARCHAR(20),
    account_name      VARCHAR(128),
    bank_name         VARCHAR(128),
    status            VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Enforce: one active virtual account per user per currency
    CONSTRAINT unique_fincra_user_currency UNIQUE (user_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_fincra_wallet_user_id   ON public.fincra_wallet_links(user_id);
CREATE INDEX IF NOT EXISTS idx_fincra_wallet_id        ON public.fincra_wallet_links(fincra_wallet_id);

-- ---------------------------------------------------------------------------
-- TABLE 3: fincra_webhook_logs
-- Stores every incoming Fincra webhook for audit, idempotency, and replay
-- attack prevention.
-- CRITICAL: event_hash (UNIQUE) is the idempotency key that prevents duplicate
-- ledger commits from replayed webhooks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fincra_webhook_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type          VARCHAR(64)  NOT NULL,
    payload             JSONB        NOT NULL DEFAULT '{}'::jsonb,
    signature_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
    -- SHA-256 hash of the raw request body, used to block replay attacks
    event_hash          VARCHAR(64)  UNIQUE,
    processed           BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fincra_webhook_event_type  ON public.fincra_webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_fincra_webhook_created_at  ON public.fincra_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fincra_webhook_processed   ON public.fincra_webhook_logs(processed);

-- ---------------------------------------------------------------------------
-- TABLE 4: fincra_audit_logs
-- Immutable, append-only audit trail for all Fincra-initiated financial actions.
-- Nothing is ever deleted from this table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fincra_audit_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    action      VARCHAR(64)  NOT NULL,
    user_id     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    details     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fincra_audit_user_id    ON public.fincra_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_fincra_audit_action     ON public.fincra_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_fincra_audit_created_at ON public.fincra_audit_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- Row-Level Security (RLS)
-- Users can only see their own records. Service role bypasses all RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.fincra_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fincra_wallet_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fincra_webhook_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fincra_audit_logs    ENABLE ROW LEVEL SECURITY;

-- fincra_transactions RLS
DROP POLICY IF EXISTS "Users can view their own fincra transactions" ON public.fincra_transactions;
CREATE POLICY "Users can view their own fincra transactions"
    ON public.fincra_transactions FOR SELECT
    USING (auth.uid() = user_id);

-- fincra_wallet_links RLS
DROP POLICY IF EXISTS "Users can view their own fincra wallet links" ON public.fincra_wallet_links;
CREATE POLICY "Users can view their own fincra wallet links"
    ON public.fincra_wallet_links FOR SELECT
    USING (auth.uid() = user_id);

-- fincra_webhook_logs and audit_logs: service role access only (no user RLS)
-- Admin access is handled at the API layer via requireAdmin middleware.

COMMIT;

-- =============================================================================
-- ROLLBACK INSTRUCTIONS (run these to completely undo this migration):
--
--   DROP TABLE IF EXISTS public.fincra_audit_logs   CASCADE;
--   DROP TABLE IF EXISTS public.fincra_webhook_logs CASCADE;
--   DROP TABLE IF EXISTS public.fincra_wallet_links CASCADE;
--   DROP TABLE IF EXISTS public.fincra_transactions CASCADE;
--
-- =============================================================================
