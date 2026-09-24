-- ============================================================================
-- Migration 491: Supabase Data API Grants — October 30 2026 Compliance
-- ============================================================================
-- Context:
--   From October 30 2026, Supabase no longer automatically grants Data API
--   access to NEW tables in the public schema. Any new table (including those
--   created by migrations, preview branches, or `supabase db reset`) requires
--   an explicit GRANT before PostgREST / supabase-js can reach it.
--
--   This migration:
--     1. Re-applies GRANT ON ALL TABLES for all EXISTING tables (belt-and-
--        suspenders — existing tables are already unaffected by the change,
--        but this ensures a clean state after `db reset`).
--     2. Sets ALTER DEFAULT PRIVILEGES so that tables created by the
--        postgres / supabase_admin roles in future migrations automatically
--        receive the correct grants WITHOUT requiring explicit per-table lines.
--
--   Individual migrations 461, 463, 464 have also been patched with their own
--   explicit GRANT lines so that they are fully self-contained for
--   `supabase db reset` and preview branch workflows.
-- ============================================================================

BEGIN;

-- ─── 1. Ensure schema access ─────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL   ON SCHEMA public TO service_role;

-- ─── 2. Re-grant all currently existing tables ───────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT                         ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL PRIVILEGES                 ON ALL TABLES IN SCHEMA public TO service_role;

-- ─── 3. Re-grant all sequences ───────────────────────────────────────────────
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ─── 4. Set DEFAULT PRIVILEGES for FUTURE tables ─────────────────────────────
-- These cover tables created by the `postgres` role (the default Supabase
-- migration runner). If your Supabase project uses a different role, add an
-- additional ALTER DEFAULT PRIVILEGES ... FOR ROLE <that_role> block.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;

-- ─── 5. Explicit grants for tables created AFTER migration 460 ───────────────
-- These are redundant after steps 2 & 4 above run, but are included here as
-- an explicit documented record of which tables were affected.

-- Migration 461: provider_deposit_addresses
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_deposit_addresses TO authenticated;
GRANT ALL ON public.provider_deposit_addresses TO service_role;

-- Migration 463: balance_correction_log (service-role only; RLS enforces admin restriction)
GRANT ALL ON public.balance_correction_log TO service_role;

-- Migration 464: admin_settings (read for authenticated admin, full for service_role)
GRANT SELECT ON public.admin_settings TO authenticated;
GRANT ALL    ON public.admin_settings TO service_role;

COMMIT;
