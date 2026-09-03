# NOTESTANDARD — BANKING, PAYMENT, LIQUIDITY & INFRASTRUCTURE PARTNER OVERVIEW

**Document ID:** `JDT-PARTNER-DOC-2026-V1` `[VERIFIED]`  
**Legal Entity:** Jossy Digital Technologies Ltd. (RC 9586407) `[VERIFIED]`  
**Operating Brand / Platform:** NoteStandard `[VERIFIED]`  
**Managing Director & CEO:** Aghogho Jossy Oboh `[VERIFIED]`  
**Target Submission:** Quidax Compliance Review Team `[VERIFIED]`  
**Effective Date:** August 24, 2026 / Current Revision 2026 `[VERIFIED]`  
**Document Status:** Version 1.0 &bull; Approved `[VERIFIED]`  

---

## 1. OVERVIEW & INFRASTRUCTURE GOVERNANCE `[VERIFIED]`

Jossy Digital Technologies Ltd. ("Jossy Digital") operates NoteStandard as a technology platform. To deliver bank-grade financial services, NoteStandard integrates with licensed financial institutions, regulated Banking-as-a-Service (BaaS) providers, payment clearing gateways, identity verification providers, and cloud infrastructure partners `[VERIFIED]`.

This document details the verified operational roles, regulatory clearance, integration status, and risk parameters of NoteStandard's partner ecosystem `[VERIFIED]`.

---

## 2. PARTNER ECOSYSTEM MASTER MATRIX `[VERIFIED]`

```
+-------------------------------------------------------------------------------------------------------------------------+
| NOTESTANDARD PARTNER ECOSYSTEM MASTER MATRIX                                                                            |
+---------------------+-------------------------------+--------------------+------------------+---------------------------+
| Partner Name        | Primary Service Provided      | Current Status     | Funds Touched?   | Primary Compliance Role   |
+---------------------+-------------------------------+--------------------+------------------+---------------------------+
| Anchor Software Ltd | BaaS NGN Virtual Accounts,    | ACTIVE             | YES (Fiat NGN)   | Regulated NGN banking     |
| (RC 1888102)        | NIP Transfers, Settlement     | (Executed Contract)|                  | clearing rails & accounts.|
+---------------------+-------------------------------+--------------------+------------------+---------------------------+
| Fincra Technologies | Payment Collections, Payouts, | ACTIVE             | YES (Fiat NGN)   | Payment gateway clearing, |
|                     | Wildcard IP Clearing          | (Executed Contract)|                  | card/virtual account collection.|
+---------------------+-------------------------------+--------------------+------------------+---------------------------+
| Quidax              | Crypto Deposit Gateway,       | PLANNED            | YES (Crypto &    | On-chain monitoring, VASP |
|                     | Custody, Instant Liquidation  | (Integration Target| Fiat Proceeds)   | liquidation, order book.  |
+---------------------+-------------------------------+--------------------+------------------+---------------------------+
| NOWPayments         | Legacy Crypto Deposit Gateway | LEGACY / DEFAULT   | NO (0 Active Tx; | Legacy deposit address    |
|                     | (Fallback)                    | (Unused Fallback)  | 0 Customer Bal)  | mapping.                  |
+---------------------+-------------------------------+--------------------+------------------+---------------------------+
| Prembly             | Identity Verification (BVN/   | ACTIVE             | NO               | BVN/NIN validation,       |
| (IdentityPass)      | NIN, Liveness, OFAC/PEP)      | (Live Integration) |                  | facial liveness & OFAC checks.|
+---------------------+-------------------------------+--------------------+------------------+---------------------------+
| Grey Banking        | Multi-Currency Foreign Banking| DOCUMENTED         | NO               | Foreign currency clearing |
| (Grey Finance)      | Rails Integration             | ARCHITECTURE       |                  | architecture.             |
+---------------------+-------------------------------+--------------------+------------------+---------------------------+
| Zenith Bank Plc     | Commercial Settlement Banking | PROPOSED           | NO               | Proposed commercial       |
|                     | Proposal                      | (Proposal Sent)    |                  | settlement account.       |
+---------------------+-------------------------------+--------------------+------------------+---------------------------+
| Guaranty Trust Bank | Treasury Settlement Sweeps    | PROPOSED           | NO               | Treasury sweep bank       |
| (GTBank)            | Destination                   | (Runbook Target)   |                  | destination.              |
+---------------------+-------------------------------+--------------------+------------------+---------------------------+
| AWS / Supabase /    | Cloud Hosting, Database &     | ACTIVE             | NO               | Encrypted cloud storage & |
| Render / Codemagic  | CI/CD Build Infrastructure    | (Live Production)  |                  | database security.        |
+---------------------+-------------------------------+--------------------+------------------+---------------------------+
```

---

## 3. DETAILED PARTNER PROFILES & EVIDENCE BASELINE

### 3.1 Anchor Software Ltd (BaaS NGN Banking Rails) `[VERIFIED]`
- **Legal Entity:** Anchor Software Ltd (RC 1888102) `[VERIFIED]`.
- **Contractual Status:** Executed Client Service Agreement dated August 03, 2026 (`NoteStandard_Anchor_Client_Service_Agreement.docx`) `[VERIFIED]`.
- **Operational Role:** Provides licensed Banking-as-a-Service (BaaS) infrastructure enabling NoteStandard to issue NGN virtual bank accounts, process NIP instant bank transfers, handle virtual account collections, and execute daily settlements `[VERIFIED]`.
- **Regulatory Clearance:** Financial services are delivered through Anchor's licensed financial institution partners `[VERIFIED]`.

### 3.2 Fincra Technologies (Payment Gateway & Collections) `[VERIFIED]`
- **Operational Status:** Executed Fincra Source of Funds Declaration & Wildcard IP Indemnity (`03 - Fincra Wildcard IP Indemnity.pdf`) `[VERIFIED]`.
- **Operational Role:** Powers merchant checkout collections, card processing, wildcard IP clearing, and outbound NGN payouts `[VERIFIED]`.
- **Software Audit Evidence:** Verified in `FINCRA_COMPLIANCE_DEMO_FORENSIC_REPORT.md` confirming live integration of idempotency fences (`174_fincra_deterministic_idempotency.sql`) and DLQ reversal handlers `[VERIFIED]`.

### 3.3 Quidax (Intended Crypto Infrastructure Provider) `[INTERNAL DESIGN]` / `[PENDING QUIDAX CONFIRMATION]`
- **Operational Role:** Target primary provider for per-user crypto deposit address generation, hot wallet reserve custody, ticker/liquidation quote generation, and instant crypto-to-fiat liquidation `[INTERNAL DESIGN]`.
- **Integration Status:** Provider adapter (`QuidaxProvider.js`) and service boundary (`quidaxService.js`) implemented in a strict fail-closed state pending receipt of official Quidax API contracts, HMAC specs, and sandbox credentials (`docs/QUIDAX_INTEGRATION_READINESS.md`) `[VERIFIED]`.

### 3.4 NOWPayments (Legacy Fallback Crypto Gateway) `[VERIFIED]`
- **Operational Role:** Legacy crypto deposit provider.
- **Audit Evidence:** `docs/QUIDAX_INTEGRATION_READINESS.md` Section 1 explicitly confirms: *"Database forensic audit confirmed 0 customer deposit transactions, 0 ledger credits, and 0 user balances dependent on NOWPayments custody."* `[VERIFIED]`. Environment configuration (`server/config/env.js`) retains NOWPayments as default fallback while `QUIDAX_ENABLED` is false `[VERIFIED]`.

### 3.5 Prembly / IdentityPass (Identity Verification & Sanctions Vendor) `[VERIFIED]`
- **Operational Role:** Primary third-party compliance vendor handling automated BVN validation, NIN verification, Government ID matching, facial liveness checks, and daily PEP/Sanctions database screening `[VERIFIED]`.
- **Evidence Base:** Documented across `01 - Anchor Onboarding Questionnaire.xlsx` Row 107 and `01_ANTI_MONEY_LAUNDERING_POLICY.pdf` Section 5 `[VERIFIED]`.

### 3.6 Cloud & Hosting Infrastructure `[VERIFIED]`
- **Amazon Web Services (AWS) & Supabase:** Encrypted cloud hosting and PostgreSQL database infrastructure utilizing AES-256 encryption at rest and TLS 1.3 in transit (`supabase_ad_hardening.sql`) `[VERIFIED]`.
- **Render & Codemagic:** Application server runtime hosting (`render.yaml`) and CI/CD mobile build pipeline (`codemagic.yaml`) `[VERIFIED]`.

---

## 4. REGULATORY DISCLAIMER & LICENCE OWNERSHIP `[VERIFIED]`

> [!IMPORTANT]
> **PARTNER LICENCE DISCLAIMER:**  
> All banking licences, payment gateway permits, and Virtual Asset Service Provider (VASP) permissions belonging to Anchor Software Ltd, Fincra Technologies, or Quidax are the exclusive property of those respective regulated entities `[VERIFIED]`. Jossy Digital Technologies Ltd. makes **no claim** of ownership over partner licences, and operates strictly as a technology solution provider utilizing regulated partner clearing rails `[VERIFIED]`.

---

## 5. DOCUMENT APPROVAL & SIGN-OFF `[VERIFIED]`

**Approved by:** Aghogho Jossy Oboh `[VERIFIED]`  
**Title:** Founder & Chief Executive Officer, Jossy Digital Technologies Ltd. `[VERIFIED]`  
**Date:** August 24, 2026 / Current Revision 2026 `[VERIFIED]`  
**Signature:** *[Executed Corporate Document — Signed & Corporate Seal Affixed]* `[VERIFIED]`  
