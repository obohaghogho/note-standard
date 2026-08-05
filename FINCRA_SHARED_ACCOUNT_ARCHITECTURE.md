# Enterprise Fincra NGN Shared Virtual Account Architecture

## 1. Overview
NoteStandard's Nigerian Naira (NGN) banking integration utilizes a provider-agnostic virtual account architecture. In **Mode A (Shared Virtual Account Mode)**, all NGN bank transfers route to NoteStandard's live Fincra Guaranty Trust Bank Virtual Account while providing each customer with a unique, permanent, indexed deposit reference (`NS-NGN-XXXXXXXX`).

---

## 2. Financial Source of Truth
The **NoteStandard Double-Entry Internal Ledger** remains the sole financial source of truth. Fincra provider account balances are treated strictly as internal operational treasury balances and are never mapped directly to customer wallet balances.

---

## 3. Account & Deposit Reference Specifications
- **Bank Partner**: Guaranty Trust Bank
- **Bank Code**: `058`
- **Account Name**: `JOSSY DIGITAL TECHNOLOGIES LTD`
- **Account Number**: `5000701121`
- **Internal Channel Reference**: `fcb907bd-ab39-4361-bc9b-4f5e94e400c2` *(Strictly internal — never shown to customers)*
- **User Deposit Reference**: `NS-NGN-XXXXXXXX` *(Unique per user, persistent, reusable forever)*

---

## 4. Decoupled Routers
- **BankingRouter**: Handles Virtual Accounts, Bank Transfer instructions, and collection matching (`FINCRA` for NGN, `GREY` for USD).
- **SettlementRouter**: Handles FX conversion, external payouts, and treasury liquidity rebalancing.
