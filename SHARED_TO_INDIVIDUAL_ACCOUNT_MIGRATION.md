# Shared to Individual Virtual Account Migration Guide

## 1. Migration Overview
NoteStandard supports two virtual account allocation modes:
- **Mode A (Shared Virtual Account Mode - Active Today)**: All users deposit into company virtual account `5000701121` with unique user references (`NS-NGN-XXXXXXXX`).
- **Mode B (Individual Virtual Account Mode - Future Ready)**: Each user receives a dedicated virtual account number (e.g. `8012345678`).

---

## 2. Zero-Downtime Migration Steps
When Fincra or Anchor enables individual dedicated NGN virtual account generation:
1. Change environment variable `FINCRA_VIRTUAL_ACCOUNT_MODE="individual"`.
2. Provider adapter (`FincraBankingProviderV1`) automatically provisions user-dedicated accounts in `user_bank_accounts`.
3. Deposit matching engine continues matching via `user_bank_accounts.account_number`.
4. Zero database schema migrations, zero ledger rewrites, zero frontend UI component redesign required.
