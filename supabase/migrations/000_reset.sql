-- ============================================================================
-- NoteStandard — RESET: Drop all tables and start fresh
-- Run this BEFORE running 001_create_tables.sql
-- WARNING: This destroys all data!
-- ============================================================================

-- DROP TABLE ... CASCADE automatically removes policies, indexes, and
-- dependent objects, so no need to drop them separately.

DROP TABLE IF EXISTS job_queue CASCADE;
DROP TABLE IF EXISTS provider_health CASCADE;
DROP TABLE IF EXISTS exchange_rates CASCADE;
DROP TABLE IF EXISTS feature_flags CASCADE;
DROP TABLE IF EXISTS system_config CASCADE;
DROP TABLE IF EXISTS tier_limits CASCADE;
DROP TABLE IF EXISTS user_tiers CASCADE;
DROP TABLE IF EXISTS risk_events CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS withdrawal_requests CASCADE;
DROP TABLE IF EXISTS provider_transactions CASCADE;
DROP TABLE IF EXISTS wallet_reservations CASCADE;
DROP TABLE IF EXISTS ledger_entries CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS supported_currencies CASCADE;

-- Drop functions from 002
DROP FUNCTION IF EXISTS credit_wallet CASCADE;
DROP FUNCTION IF EXISTS debit_wallet CASCADE;
DROP FUNCTION IF EXISTS reserve_wallet_funds CASCADE;
DROP FUNCTION IF EXISTS capture_reservation CASCADE;
DROP FUNCTION IF EXISTS release_reservation CASCADE;
DROP FUNCTION IF EXISTS lock_wallet_funds CASCADE;
DROP FUNCTION IF EXISTS unlock_wallet_funds CASCADE;
DROP FUNCTION IF EXISTS reconcile_wallet CASCADE;
DROP FUNCTION IF EXISTS expire_stale_reservations CASCADE;
