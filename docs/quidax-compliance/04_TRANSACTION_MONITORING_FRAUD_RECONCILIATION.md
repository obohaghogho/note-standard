# NOTESTANDARD — TRANSACTION MONITORING, FRAUD PREVENTION, RECORD-KEEPING & RECONCILIATION PROCEDURE

**Document ID:** `JDT-TMP-POL-2026-V1` `[VERIFIED]`  
**Legal Entity:** Jossy Digital Technologies Ltd. (RC 9586407) `[VERIFIED]`  
**Operating Brand / Platform:** NoteStandard `[VERIFIED]`  
**Managing Director & CEO:** Aghogho Jossy Oboh `[VERIFIED]`  
**Target Submission:** Quidax Compliance Review Team `[VERIFIED]`  
**Effective Date:** August 11, 2026 / Current Revision 2026 `[VERIFIED]`  
**Version / Status:** Version 1.0 &bull; Approved `[VERIFIED]`  

---

## 1. OBJECTIVE & EXECUTIVE SCOPE `[VERIFIED]`

This Procedure Document details NoteStandard's technically assessed internal financial controls, automated transaction monitoring rules, fraud prevention mechanisms, dead-letter queue (DLQ) reversal handlers, double-entry ledger reconciliation, and cryptographic audit logging pipelines `[VERIFIED]`. 

NoteStandard enforces authoritative double-entry ledger accounting (`wallets_v6`, `ledger_entries`) at the database level to ensure that no monetary balance can be created, transferred, or liquidated without strict double-entry equality (`Total Debits == Total Credits`) `[VERIFIED]`.

---

## 2. AUTOMATED TRANSACTION MONITORING FRAMEWORK `[VERIFIED]`

NoteStandard employs automated real-time risk engines (`DecisionEngine.js`) to evaluate every transaction prior to execution `[VERIFIED]`.

```
+-----------------------------------------------------------------------------------+
| REAL-TIME TRANSACTION RISK EVALUATION PIPELINE                                    |
+-----------------------------------------------------------------------------------+
| 1. TRANSACTION DISPATCH: User requests transfer, deposit, or payout.            |
|                                         │                                         |
|                                         ▼                                         |
| 2. AUTHENTICATION & RBAC: JWT session check & route permission check.             |
|                                         │                                         |
|                                         ▼                                         |
| 3. KYC LIMIT CHECK: Validates transaction against Tier 1-3 daily caps.            |
|                                         │                                         |
|                                         ▼                                         |
| 4. VELOCITY ENGINE: Evaluates transaction frequency, volume, & pattern anomalies. |
|                                         │                                         |
|                                         ▼                                         |
| 5. IDEMPOTENCY FENCE: Enforces deterministic hash key to prevent replay.          |
|                                         │                                         |
|                                         ▼                                         |
| 6. DECISIONING RESULT:                                                            |
|    - Pass: Dispatches to execution pipeline.                                      |
|    - Flagged / Anomalous: Intercepted & quarantined in DLQ for compliance review.  |
+-----------------------------------------------------------------------------------+
```

### 2.1 Anomaly & Fraud Alert Rules `[VERIFIED]`
- **Velocity Monitoring:** Detects rapid successive transfers dispatched within seconds from the same device or IP address `[VERIFIED]`.
- **Transaction-Value Anomalies:** Flags transfers exceeding 3x the user's historical 30-day average transaction size `[VERIFIED]`.
- **Structuring / Smurfing Detection:** Identifies multiple transactions executed just beneath regulatory reporting limits (e.g. repeated ₦49,500 transfers) `[VERIFIED]`.
- **Pass-Through Account Detection:** Flags immediate withdrawal of deposited funds where residual balance approaches zero `[VERIFIED]`.
- **Third-Party Funding Risk:** Flags multiple deposits originating from disparate third-party virtual accounts into a single recipient wallet `[VERIFIED]`.
- **Account Takeover (ATO) Indicators:** Detects sudden high-value payout requests following password reset, email change, or new device login `[VERIFIED]`.

---

## 3. INTERNAL DOUBLE-ENTRY LEDGER CONTROLS `[VERIFIED]`

NoteStandard's internal financial accounting is governed by PostgreSQL double-entry ledger functions enforcing strict ACID compliance `[VERIFIED]`:

- **Authoritative System of Record:** Database tables `wallets_v6` and `ledger_entries` act as the sole internal system of monetary truth `[VERIFIED]`. Clearing partners (Anchor, Fincra, Quidax) act strictly as external payment clearing rails, not as the internal system of record `[VERIFIED]`.
- **Double-Entry Balance Invariant:** Every financial transaction posts matching debit and credit journal entries `[VERIFIED]`. Any transaction attempting an unbalanced entry is automatically aborted by PostgreSQL trigger constraints (`execute_ledger_transaction_v6`) `[VERIFIED]`.
- **Row-Level Locking:** Pessimistic row locking (`SELECT ... FOR UPDATE`) prevents race conditions, double-spending, and negative wallet balances during concurrent requests `[VERIFIED]`.
- **Deterministic Idempotency Fences:** Unique idempotency key enforcement (`174_fincra_deterministic_idempotency.sql`) rejects duplicate payment attempts and webhook replays `[VERIFIED]`.

---

## 4. MULTI-PROVIDER RESERVE ENGINE & FRESHNESS ORACLE `[VERIFIED]`

To prevent unbacked ledger balances and provider concentration risk, NoteStandard operates a **Multi-Provider Reserve Engine** (`MultiProviderReserveEngine.js`) `[VERIFIED]`:

```
          Total Assets (SUM of Provider Balances with SUCCESS Status)
Reserve = ------------------------------------------------------------- × 100
          Total Liabilities (SUM of User Wallet Balances in wallets_v6)
```

- **Solvency Guard:** The system enforces a mandatory aggregated reserve ratio of **≥ 100%** before allowing high-value outbound withdrawals `[VERIFIED]`.
- **Freshness TTL Hierarchy:** External provider balances are assigned strict Time-To-Live (TTL) freshness windows (`FINCRA NGN`: 15 mins; `ANCHOR USD`: 15 mins; `NOWPAYMENTS Crypto`: 30 mins) `[VERIFIED]`.
- **Stale Balance Protection:** If a provider balance sync exceeds its TTL window or provider health drops below `ONLINE`/`HEALTHY`, `filterEligibleBalances` automatically excludes the provider's balance from reserve assertions `[VERIFIED]`.
- **Quidax Reserve Exclusion:** Quidax balances are explicitly marked `NOT_ELIGIBLE_FOR_RESERVE_ASSERTION` in `TTL_MAP_MS` pending official Quidax balance query APIs and TTL freshness verification `[VERIFIED]`.

---

## 5. FAILED TRANSACTIONS, DEAD LETTER QUEUE (DLQ) & ATOMIC REVERSALS `[VERIFIED]`

When an external provider payout fails, times out, or returns a terminal error, NoteStandard enforces automated remediation handlers:

```
+-----------------------------------------------------------------------------------+
| AUTOMATED DEAD LETTER QUEUE (DLQ) & REVERSAL WORKFLOW                             |
+-----------------------------------------------------------------------------------+
| 1. PROVIDER FAILURE: External payout rails return failure or timeout.             |
|                                         │                                         |
|                                         ▼                                         |
| 2. DLQ QUARANTINE: Transaction stored in isolated quarantine DLQ                  |
|    (310_dead_letter_queue.sql) to prevent orphan states.                          |
|                                         │                                         |
|                                         ▼                                         |
| 3. AUTOMATED LEDGER REVERSAL: PostgreSQL RPC (204_fix_payout_reversal_and_ui_state) |
|    executes atomic double-entry reversal:                                         |
|    - Debits Platform Clearing Account                                             |
|    - Credits User Wallet Balance                                                  |
|                                         │                                         |
|                                         ▼                                         |
| 4. UI STATE RESTORATION: User wallet balance instantly restored & notification sent.|
+-----------------------------------------------------------------------------------+
```

---

## 6. RECONCILIATION & AUDIT LOGGING PIPELINE `[VERIFIED]`

- **Nightly Automated Reconciliation:** `NightlyReconciliationPipeline.js` executes automated nightly balance assertions comparing internal ledger totals against external provider bank statements and API settlement feeds `[VERIFIED]`.
- **Discrepancy Escalation:** Any variance between internal ledger liabilities and external assets triggers an automated `Sev 1` Slack/email alert to the Treasury & Compliance team `[VERIFIED]`.
- **Cryptographic Audit Logging:** All administrative actions, compliance decisions, risk overrides, and payout attempts are recorded in an append-only, cryptographically verifiable audit log (`256_immutable_audit_log.sql`) `[VERIFIED]`.
- **5-Year Record Retention:** Audit logs, transaction histories, ledger entries, and DLQ records are preserved in encrypted storage for a minimum of **five (5) years** `[VERIFIED]`.

---

## 7. POLICY APPROVAL & EXECUTIVE SIGN-OFF `[VERIFIED]`

**Approved by:** Aghogho Jossy Oboh `[VERIFIED]`  
**Title:** Founder & Chief Executive Officer, Jossy Digital Technologies Ltd. `[VERIFIED]`  
**Date:** August 11, 2026 / Current Revision 2026 `[VERIFIED]`  
**Signature:** *[Executed Corporate Document — Signed & Corporate Seal Affixed]* `[VERIFIED]`  
