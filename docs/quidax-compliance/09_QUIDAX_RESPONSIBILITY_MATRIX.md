# NOTESTANDARD — QUIDAX COMPLIANCE RESPONSIBILITY MATRIX

**Document ID:** `JDT-QUIDAX-MAT-2026-V1` `[INTERNAL DESIGN]`  
**Legal Entity:** Jossy Digital Technologies Ltd. (RC 9586407) `[VERIFIED]`  
**Operating Brand / Platform:** NoteStandard `[VERIFIED]`  
**Managing Director & CEO:** Aghogho Jossy Oboh `[VERIFIED]`  
**Target Submission:** Quidax Compliance Review Team `[VERIFIED]`  
**Effective Date:** September 03, 2026 `[VERIFIED]`  
**Document Status:** DRAFT MATRIX — PENDING QUIDAX WRITTEN CONFIRMATION `[PENDING QUIDAX CONFIRMATION]`  

---

## 1. PURPOSE & DEMARCATION SCOPE

This Matrix defines the proposed compliance, regulatory, operational, and technical responsibility demarcation between **Jossy Digital Technologies Ltd. (NoteStandard)** and **Quidax** `[INTERNAL DESIGN]`. 

Responsibility assignments are categorized based on current repository evidence, NoteStandard internal architecture, or pending Quidax confirmation `[INTERNAL DESIGN]`.

---

## 2. COMPLIANCE RESPONSIBILITY MASTER MATRIX

```
+-------------------------------------------------------------------------------------------------------------------------+
| NOTESTANDARD VS QUIDAX COMPLIANCE RESPONSIBILITY MATRIX                                                                 |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| Compliance Domain   | NoteStandard      | Quidax            | Shared            | Evidence Base     | Current Status    |
| / Control           | Responsibility    | Responsibility    | Responsibility    | & Source          | & Verification    |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| User Onboarding     | PRIMARY           | NONE              | NO                | Prembly Integration| VERIFIED          |
| Identity Verification| (BVN/NIN/Liveness)|                   |                   | (03_KYC_CDD.md)   | (NoteStandard)    |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| Tiered Limits       | PRIMARY           | NONE              | NO                | 03_KYC_CDD.md     | VERIFIED          |
| Enforcement (NGN)   | (Tier 1-3 Caps)   |                   |                   | (PostgreSQL RPCs) | (NoteStandard)    |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| User PEP & Sanctions| PRIMARY           | NONE              | NO                | Prembly Daily     | VERIFIED          |
| Screening (Names)   | (Prembly Daily)   |                   |                   | Rescreen Pipeline | (NoteStandard)    |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| Internal Financial  | PRIMARY           | NONE              | NO                | wallets_v6        | VERIFIED          |
| Accounting & Ledger | (Double-Entry)    |                   |                   | PostgreSQL RPCs   | (NoteStandard)    |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| User-Level NFIU STR | PRIMARY           | NONE              | NO                | 02_AML_CFT_POLICY | VERIFIED          |
| / CTR Reporting     | (Compliance Off.) |                   |                   | Section 8         | (NoteStandard)    |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| User Record Log     | PRIMARY           | NONE              | NO                | 256_immutable_    | VERIFIED          |
| Retention (5-Year)  | (Append-Only Logs)|                   |                   | audit_log.sql     | (NoteStandard)    |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| On-Chain Blockchain | NONE              | PRIMARY           | NO                | Quidax Deposit    | PENDING QUIDAX    |
| Transaction Monitor |                   | (Delegated)       |                   | Gateway           | CONFIRMATION      |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| Crypto Wallet       | NONE              | PRIMARY           | NO                | Quidax Custody    | PENDING QUIDAX    |
| Address Screening   |                   | (Delegated)       |                   | Guard             | CONFIRMATION      |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| Mixer & Tumbler     | NONE              | PRIMARY           | NO                | Quidax Custody    | PENDING QUIDAX    |
| Exposure Check      |                   | (Delegated)       |                   | Guard             | CONFIRMATION      |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| Crypto Sanctions    | NONE              | PRIMARY           | NO                | Quidax Custody    | PENDING QUIDAX    |
| Address Screening   |                   | (Delegated)       |                   | Guard             | CONFIRMATION      |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| Stolen Funds &      | NONE              | PRIMARY           | NO                | Quidax Risk       | PENDING QUIDAX    |
| Darknet Exposure    |                   | (Delegated)       |                   | Engine            | CONFIRMATION      |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| VASP Travel Rule    | NONE              | PRIMARY           | NO                | Quidax Hosting    | PENDING QUIDAX    |
| (IVMS101 Protocol)  |                   | (Delegated)       |                   | VASP Protocol     | CONFIRMATION      |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| Crypto Custody &    | NONE              | PRIMARY           | NO                | Quidax Hot/Cold   | PENDING QUIDAX    |
| Private Key Security|                   | (Delegated)       |                   | HSM Vaults        | CONFIRMATION      |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| Order-Book Trade    | NONE              | PRIMARY           | NO                | Quidax Order      | PENDING QUIDAX    |
| Liquidation Exec.   |                   | (Delegated)       |                   | Book Engine       | CONFIRMATION      |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| Prohibited Country  | SHARED            | SHARED            | YES               | Quidax Schedule 1 | VERIFIED          |
| Enforcement         | (User IP/Country) | (Crypto Origin)   |                   | (Nov 1, 2023)     | (SHARED)          |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| US-Person Access    | SHARED            | SHARED            | YES               | Quidax Policy     | VERIFIED          |
| Restriction         | (User Attest/IP)  | (VASP Gateway)    |                   | Addendum          | (SHARED)          |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| Webhook Security    | SHARED            | SHARED            | YES               | quidaxService.js  | PENDING QUIDAX    |
| & HMAC Auth         | (Verify HMAC 401) | (Sign & Dispatch) |                   | & quidaxController| CONFIRMATION      |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
| API Key Security &  | SHARED            | SHARED            | YES               | server/config/    | VERIFIED          |
| Secret Isolation    | (Server Env Only) | (Key Rotation)    |                   | env.js            | (SHARED)          |
+---------------------+-------------------+-------------------+-------------------+-------------------+-------------------+
```

---

## 3. PENDING QUIDAX CONFIRMATION ITEMS `[PENDING QUIDAX CONFIRMATION]`

NoteStandard explicitly requests written confirmation from Quidax Compliance for the following 7 operational domains before finalizing this matrix:

1. **On-Chain Blockchain Screening:** Formal confirmation that Quidax screens all incoming blockchain deposits for double-spends, re-orgs, and malicious smart contract interactions `[PENDING QUIDAX CONFIRMATION]`.
2. **Crypto Sanctions & Mixer Exposure:** Formal confirmation that Quidax screens deposit addresses against OFAC crypto sanctions lists and rejects deposits from privacy mixers (e.g. Tornado Cash) `[PENDING QUIDAX CONFIRMATION]`.
3. **VASP Travel Rule Compliance:** Formal confirmation that Quidax handles IVMS101 originator and beneficiary VASP information exchange for cross-border transfers `[PENDING QUIDAX CONFIRMATION]`.
4. **HSM & Key Management:** Formal confirmation that Quidax maintains sole custody and HSM/cold-storage multi-sig protection for all crypto deposits `[PENDING QUIDAX CONFIRMATION]`.
5. **Order-Book Liquidation Execution:** Formal confirmation that Quidax executes instant liquidation orders against its liquidity pools and guarantees quoted NGN rates `[PENDING QUIDAX CONFIRMATION]`.
6. **Provider Balance Query API:** Formal confirmation of the balance query endpoint schema used for NoteStandard reserve solvency assertions `[PENDING QUIDAX CONFIRMATION]`.
7. **Webhook HMAC Hashing Specification:** Formal confirmation of the HMAC signature header, algorithm (HMAC-SHA256), and raw body sorting rules `[PENDING QUIDAX CONFIRMATION]`.

---

## 4. DOCUMENT APPROVAL & SIGN-OFF `[VERIFIED]`

**Approved by:** Aghogho Jossy Oboh `[VERIFIED]`  
**Title:** Founder & Chief Executive Officer, Jossy Digital Technologies Ltd. `[VERIFIED]`  
**Date:** September 03, 2026 `[VERIFIED]`  
**Signature:** *[Executed Corporate Document — Signed & Corporate Seal Affixed]* `[VERIFIED]`  
