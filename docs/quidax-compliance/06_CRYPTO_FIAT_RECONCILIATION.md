# NOTESTANDARD — CRYPTO-TO-FIAT TRANSACTION & RECONCILIATION PROCEDURE

**Document ID:** `JDT-CRYPTO-REC-2026-V1` `[INTERNAL DESIGN]`  
**Legal Entity:** Jossy Digital Technologies Ltd. (RC 9586407) `[VERIFIED]`  
**Operating Brand / Platform:** NoteStandard `[VERIFIED]`  
**Managing Director & CEO:** Aghogho Jossy Oboh `[VERIFIED]`  
**Target Submission:** Quidax Technical Audit & Compliance Review Team `[VERIFIED]`  
**Effective Date:** August 11, 2026 / Revision 2026 `[VERIFIED]`  
**Document Status:** DRAFT TECHNICAL SOP — PENDING QUIDAX API SPECIFICATION `[PENDING QUIDAX CONFIRMATION]`  

---

## 1. TECHNICAL SOP OBJECTIVE & SCOPE

This Standard Operating Procedure (SOP) defines the 25-step technical lifecycle governing cryptocurrency deposits, instant crypto-to-fiat (NGN) liquidations, internal double-entry ledger posting, treasury reserve assertions, and NIP fiat withdrawals across the NoteStandard platform `[INTERNAL DESIGN]`.

---

## 2. THE 25-STEP TECHNICAL LIFECYCLE MATRIX

```
+-------------------------------------------------------------------------------------------------------------------------+
| NOTESTANDARD CRYPTO-TO-FIAT TECHNICAL LIFECYCLE                                                                         |
+------+-----------------------------------+-------------------------------------------+----------------------------------+
| Step | Lifecycle Phase                   | System Component / File                   | Status & Verification            |
+------+-----------------------------------+-------------------------------------------+----------------------------------+
|  1   | User Authentication               | AuthContext.tsx, authRoutes.js            | VERIFIED                         |
|  2   | KYC Tier Verification             | WithdrawalWorkflowService.js              | VERIFIED                         |
|  3   | Deposit Address Assignment        | Migration 461, QuidaxProvider.js          | IMPLEMENTED / PENDING QUIDAX     |
|  4   | Quidax Webhook Reception          | server/routes/quidaxRoutes.js             | VERIFIED (Endpoint Active)       |
|  5   | Webhook HMAC Verification         | quidaxService.verifyWebhookSignature      | PENDING QUIDAX SPEC (Fail-401)   |
|  6   | Deposit Confirmation              | quidaxController.js                       | IMPLEMENTED / PENDING QUIDAX     |
|  7   | Idempotency Check                 | 174_fincra_deterministic_idempotency.sql  | VERIFIED                         |
|  8   | Internal Crypto Ledger Credit     | confirm_deposit_v7 (PostgreSQL RPC)       | VERIFIED                         |
|  9   | Transaction Velocity Check        | DecisionEngine.js                         | VERIFIED                         |
| 10   | Risk Decisioning                  | DecisionEngine.js                         | VERIFIED                         |
| 11   | Liquidation Quote Fetch           | quidaxService.getQuote                    | PENDING QUIDAX API SPEC          |
| 12   | Liquidation Trade Execution       | quidaxService.executeLiquidation          | PENDING QUIDAX API SPEC          |
| 13   | Crypto Wallet Debit               | execute_ledger_transaction_v6             | VERIFIED                         |
| 14   | Fiat Settlement Processing        | SettlementStateMachine.js                 | VERIFIED                         |
| 15   | User NGN Wallet Credit            | wallets_v6                                | VERIFIED                         |
| 16   | NIP Outbound Withdrawal Initiated | WithdrawalWorkflowService.js              | VERIFIED                         |
| 17   | Multi-Provider Reserve Assert     | MultiProviderReserveEngine.js             | VERIFIED (Reserve Solvency Guard)|
| 18   | Stale Balance Guard               | filterEligibleBalances (TTL Check)        | VERIFIED                         |
| 19   | Nightly Balance Reconciliation    | NightlyReconciliationPipeline.js          | VERIFIED                         |
| 20   | Dead Letter Queue (DLQ) Quarantine| 310_dead_letter_queue.sql                 | VERIFIED                         |
| 21   | Atomic Ledger Balance Reversal    | 204_fix_payout_reversal_and_ui_state.sql  | VERIFIED                         |
| 22   | Cryptographic Audit Trail Log     | 256_immutable_audit_log.sql               | VERIFIED                         |
| 23   | Provider Outage Circuit Breaker   | ProviderHealthEngine.js                   | VERIFIED                         |
| 24   | Stale Balance Isolation (Quidax)  | MultiProviderReserveEngine.js (Line 26)   | VERIFIED (Marked NOT_ELIGIBLE)   |
| 25   | Executive Incident Escalation SLA | 04_INFORMATION_SECURITY_POLICY.pdf        | VERIFIED (Sev 1 Alert < 15 Mins) |
+------+-----------------------------------+-------------------------------------------+----------------------------------+
```

---

## 3. DETAILED WORKFLOW SPECIFICATIONS

### 3.1 Deposit Processing & Ledger Purity `[VERIFIED]` / `[INTERNAL DESIGN]`
1. **Address Generation:** NoteStandard dispatches an API request to Quidax (`QuidaxProvider.getDepositAddress`). The generated address is saved in database table `provider_deposit_addresses` (Migration 461) mapped to the user ID `[INTERNAL DESIGN]`.
2. **Webhook Reception & Fail-Closed Guard:** Incoming deposit callbacks arrive at `/api/webhooks/quidax` `[VERIFIED]`. Until Quidax's official HMAC signature specification is obtained, the endpoint fails closed with HTTP 401 on unauthenticated webhooks, preventing unauthorized balance injection `[VERIFIED]`.
3. **Atomic Ledger Credit:** Verified deposit webhooks execute PostgreSQL RPC `confirm_deposit_v7`, crediting the user's internal crypto wallet balance under full ACID row locking `[VERIFIED]`.

### 3.2 Instant Crypto-to-Fiat Liquidation `[INTERNAL DESIGN]` / `[PENDING QUIDAX CONFIRMATION]`
1. **Quote Engine:** User initiates a sell request. NoteStandard requests a locked ticker quote from Quidax (`quidaxService.getQuote`) `[INTERNAL DESIGN]`.
2. **Trade Execution:** NoteStandard dispatches execution payload to Quidax (`quidaxService.executeLiquidation`) using deterministic idempotency keys `[INTERNAL DESIGN]`.
3. **Atomic Double-Entry Posting:** Upon trade execution confirmation, PostgreSQL RPC `execute_ledger_transaction_v6` executes matching debit/credit journal entries:
   - Debits `User Crypto Wallet`
   - Credits `User NGN Fiat Wallet` `[VERIFIED]`.

### 3.3 Treasury Solvency & Reserve Engine Guards `[VERIFIED]`
- **Reserve Solvency Assertion:** `MultiProviderReserveEngine.js` verifies that aggregated provider assets cover total user ledger liabilities (Reserve Ratio ≥ 100%) prior to processing high-value outbound fiat withdrawals `[VERIFIED]`.
- **Quidax Reserve Exclusion:** Quidax balances are explicitly excluded (`NOT_ELIGIBLE_FOR_RESERVE_ASSERTION`) in `TTL_MAP_MS` until official Quidax balance query APIs and TTL freshness standards are confirmed and verified `[VERIFIED]`.

### 3.4 Dead Letter Queue (DLQ) & Atomic Reversals `[VERIFIED]`
If an outbound payout or liquidation trade fails or times out:
1. The transaction is quarantined in the Dead Letter Queue (`310_dead_letter_queue.sql`) `[VERIFIED]`.
2. PostgreSQL RPC `204_fix_payout_reversal_and_ui_state` executes an atomic double-entry reversal, restoring the user's wallet balance `[VERIFIED]`.
3. The UI state is updated to `REVERSED` and an append-only audit log is recorded (`256_immutable_audit_log.sql`) `[VERIFIED]`.

---

## 4. DOCUMENT APPROVAL & SIGN-OFF `[VERIFIED]`

**Approved by:** Aghogho Jossy Oboh `[VERIFIED]`  
**Title:** Founder & Chief Executive Officer, Jossy Digital Technologies Ltd. `[VERIFIED]`  
**Date:** August 11, 2026 / Current Revision 2026 `[VERIFIED]`  
**Signature:** *[Executed Corporate Document — Signed & Corporate Seal Affixed]* `[VERIFIED]`  
