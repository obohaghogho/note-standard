# NOTESTANDARD — CRYPTO-ASSET AML/CFT & COMPLIANCE ADDENDUM

**Document ID:** `JDT-CRYPTO-AML-2026-V1` `[INTERNAL DESIGN]`  
**Legal Entity:** Jossy Digital Technologies Ltd. (RC 9586407) `[VERIFIED]`  
**Operating Brand / Platform:** NoteStandard `[VERIFIED]`  
**Managing Director & CEO:** Aghogho Jossy Oboh `[VERIFIED]`  
**Target Submission:** Quidax Compliance Review Team `[VERIFIED]`  
**Effective Date:** August 11, 2026 / Revision 2026 `[VERIFIED]`  
**Document Status:** DRAFT ADDENDUM — PENDING QUIDAX TECHNICAL CONFIRMATION `[PENDING QUIDAX CONFIRMATION]`  

---

## 1. PURPOSE & OVERVIEW

This Addendum supplements NoteStandard's enterprise Anti-Money Laundering & Counter-Terrorist Financing Policy (`02_AML_CFT_POLICY.md`) `[VERIFIED]`. It specifically addresses the risk controls, compliance demarcation, and operational safeguards governing NoteStandard's proposed cryptocurrency deposit and instant crypto-to-fiat (NGN) liquidation integration with **Quidax** `[INTERNAL DESIGN]`.

NoteStandard operates strictly as a **non-custodial digital wallet interface and technology provider** `[VERIFIED]`. NoteStandard does **not** operate an independent order-book exchange, does **not** hold customer cryptocurrency private keys, and does **not** manage physical crypto wallet infrastructure `[VERIFIED]`.

---

## 2. COMPLIANCE RESPONSIBILITY DEMARCATION MATRIX

To ensure complete regulatory clarity, operational responsibilities are formally demarcated between NoteStandard and Quidax:

```
+---------------------------------------------------------------------------------------------------+
| NOTESTANDARD VS QUIDAX COMPLIANCE RESPONSIBILITY DEMARCATION                                      |
+------------------------------------+-----------------------+--------------------------------------+
| Compliance Control Domain          | Operating Entity      | Status / Source                      |
+------------------------------------+-----------------------+--------------------------------------+
| Customer Identity Verification     | NoteStandard          | VERIFIED (Prembly BVN/NIN/Liveness)  |
| Customer Tiered Limits (NGN Caps)  | NoteStandard          | VERIFIED (03_KYC_CDD_FRAMEWORK.md)   |
| User Sanctions & PEP Screening     | NoteStandard          | VERIFIED (Prembly Daily Batch)       |
| Internal Double-Entry Ledger       | NoteStandard          | VERIFIED (wallets_v6 PostgreSQL RPC) |
| STR / CTR Filing with NFIU (User)  | NoteStandard          | VERIFIED (Compliance Officer 24h)    |
| 5-Year Record Retention (User Logs)| NoteStandard          | VERIFIED (Cryptographic Audit Log)   |
+------------------------------------+-----------------------+--------------------------------------+
| On-Chain Blockchain Monitoring     | Quidax (Delegated)    | PENDING QUIDAX CONFIRMATION          |
| Wallet Address Risk Scoring        | Quidax (Delegated)    | PENDING QUIDAX CONFIRMATION          |
| Mixer / Tumbler Exposure Checks    | Quidax (Delegated)    | PENDING QUIDAX CONFIRMATION          |
| Crypto Sanctions Address Screening | Quidax (Delegated)    | PENDING QUIDAX CONFIRMATION          |
| Stolen Funds / Darknet Detection   | Quidax (Delegated)    | PENDING QUIDAX CONFIRMATION          |
| VASP Travel Rule Compliance        | Quidax (Delegated)    | PENDING QUIDAX CONFIRMATION          |
| Crypto Custody & Key Management    | Quidax (Delegated)    | PENDING QUIDAX CONFIRMATION          |
| Order-Book Liquidation Execution   | Quidax (Delegated)    | PENDING QUIDAX CONFIRMATION          |
+------------------------------------+-----------------------+--------------------------------------+
```

---

## 3. NOTESTANDARD-OPERATED CRYPTO RISK CONTROLS `[INTERNAL DESIGN]`

1. **KYC & Limit Gates Prior to Crypto Access:** No user may generate a crypto deposit address or execute a crypto-to-fiat liquidation without completing **Tier 1 KYC verification** (BVN/NIN validation via Prembly) `[VERIFIED]`.
2. **Transaction Velocity & Value Caps:** Crypto liquidations are bound by NoteStandard's daily NGN tier caps (Tier 1: ₦300,000 daily; Tier 2: ₦500,000 daily; Tier 3: ₦5,000,000 single) `[VERIFIED]`.
3. **Idempotency & Replay Guards:** All liquidation execution payloads sent to Quidax utilize deterministic idempotency keys (`174_fincra_deterministic_idempotency.sql`) to prevent duplicate executions `[VERIFIED]`.
4. **Authoritative Ledger Auditing:** Crypto deposit confirmations and fiat credits post exclusively through atomic PostgreSQL double-entry functions (`confirm_deposit_v7`), preventing artificial balance inflation `[VERIFIED]`.

---

## 4. QUIDAX-DELEGATED CRYPTO COMPLIANCE CONTROLS `[PENDING QUIDAX CONFIRMATION]`

NoteStandard relies on Quidax's regulated infrastructure for the following specialized crypto asset compliance controls:

- **On-Chain Blockchain Monitoring:** Monitoring incoming blockchain transactions for double-spends, re-orgs, and unconfirmed mempool states `[PENDING QUIDAX CONFIRMATION]`.
- **Crypto Wallet Address Screening:** Screening deposit addresses and transaction origins against OFAC crypto sanctions lists, high-risk darknet addresses, and stolen funds databases `[PENDING QUIDAX CONFIRMATION]`.
- **Mixer & Tumbler Exposure Check:** Identifying and rejecting deposits originating from privacy mixers (e.g. Tornado Cash) `[PENDING QUIDAX CONFIRMATION]`.
- **VASP Travel Rule Compliance:** Exchanging originator and beneficiary VASP information for cross-border crypto transfers exceeding regulatory thresholds (`IVMS101 protocol`) `[PENDING QUIDAX CONFIRMATION]`.
- **HSM & Cold Storage Custody:** Securing underlying crypto assets using Hardware Security Modules (HSMs) and multi-signature cold storage vaults `[PENDING QUIDAX CONFIRMATION]`.

> [!CAUTION]
> **CRITICAL COMPLIANCE NOTICE:**  
> NoteStandard does **not** operate native Chainalysis, Elliptic, Sumsub, or native IVMS101 Travel Rule software within its application codebase `[VERIFIED]`. All statements regarding on-chain monitoring, wallet risk scoring, and Travel Rule compliance represent controls **delegated to Quidax** as the underlying Virtual Asset Service Provider (VASP), pending formal written confirmation from Quidax `[PENDING QUIDAX CONFIRMATION]`.

---

## 5. SUSPICIOUS CRYPTO ACTIVITY ESCALATION & FREEZE PROTOCOL `[INTERNAL DESIGN]`

1. **Quidax Risk Alert / High-Risk Webhook:** If Quidax flags an incoming deposit as high-risk or sanctioned, Quidax quarantines the deposit.
2. **Automated NoteStandard Interception:** NoteStandard's webhook controller (`quidaxController.js`) catches the high-risk notification and places a compliance hold on the user's NoteStandard profile `[INTERNAL DESIGN]`.
3. **Compliance Review:** The Designated Compliance Officer inspects the user's identity dossier, deposit origin, and liquidation request `[VERIFIED]`.
4. **NFIU Escalation:** If confirmed suspicious, an STR is drafted and filed with the NFIU and Quidax Compliance within 24 hours `[VERIFIED]`.

---

## 6. DOCUMENT APPROVAL & SIGN-OFF `[VERIFIED]`

**Approved by:** Aghogho Jossy Oboh `[VERIFIED]`  
**Title:** Founder & Chief Executive Officer, Jossy Digital Technologies Ltd. `[VERIFIED]`  
**Date:** August 11, 2026 / Current Revision 2026 `[VERIFIED]`  
**Signature:** *[Executed Corporate Document — Signed & Corporate Seal Affixed]* `[VERIFIED]`  
