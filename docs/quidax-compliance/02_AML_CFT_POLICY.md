# NOTESTANDARD — COMPREHENSIVE ANTI-MONEY LAUNDERING & COUNTER-TERRORIST FINANCING POLICY

**Document ID:** `JDT-AML-POL-2026-V1` `[VERIFIED]`  
**Legal Entity:** Jossy Digital Technologies Ltd. (RC 9586407) `[VERIFIED]`  
**Operating Brand / Platform:** NoteStandard `[VERIFIED]`  
**Managing Director & CEO:** Aghogho Jossy Oboh `[VERIFIED]`  
**Target Submission:** Quidax Compliance Review Team `[VERIFIED]`  
**Effective Date:** August 11, 2026 / Current Revision 2026 `[VERIFIED]`  
**Version / Status:** Version 1.0 &bull; Approved `[VERIFIED]`  

---

## 1. EXECUTIVE POLICY STATEMENT & GOVERNANCE `[VERIFIED]`

Jossy Digital Technologies Ltd. ("Jossy Digital" or "the Company"), operating the NoteStandard financial technology platform, is fully committed to preventing its platform, digital wallets, payment infrastructure, and third-party clearing integrations from being used for money laundering (ML), terrorist financing (TF), proliferation financing (PF), or other financial crimes.

The Board of Directors of Jossy Digital retains ultimate responsibility for the enterprise AML/CFT/CPF compliance framework. Executive governance and day-to-day oversight are delegated to the **Designated Compliance Officer** and Managing Director (Aghogho Jossy Oboh). 

The Compliance Officer is endowed with complete operational independence, adequate resources, and full executive authority to:
1. Inspect all user profiles, identification records, transaction logs, and wallet activity.
2. Halt, quarantine, or freeze non-compliant or high-risk accounts without internal interference.
3. File Suspicious Transaction Reports (STRs) and Currency Transaction Reports (CTRs) directly with the Nigeria Financial Intelligence Unit (NFIU) and partner compliance teams.
4. Implement, update, and enforce risk mitigation policies across all NoteStandard products.

---

## 2. REGULATORY ALIGNMENT & LEGISLATIVE FRAMEWORK `[VERIFIED]`

This Policy is formulated in strict compliance with applicable statutory provisions, regulatory directives, and international standards governing financial institutions and financial technology platforms in the Federal Republic of Nigeria, including:
- **Money Laundering (Prevention and Prohibition) Act, 2022 (MLPA);**
- **Terrorism (Prevention and Prohibition) Act, 2022 (TPPA);**
- **Central Bank of Nigeria (CBN) AML/CFT/CPF Regulations, 2022;**
- **Nigeria Financial Intelligence Unit (NFIU) Act and Reporting Guidelines;**
- **Financial Action Task Force (FATF) 40 Recommendations** (specifically Recommendations 10, 11, 15, and 16);
- **Nigeria Data Protection Act, 2023 (NDPA).**

---

## 3. RISK-BASED APPROACH (RBA) & CUSTOMER RISK CLASSIFICATION `[VERIFIED]`

Jossy Digital applies a strict **Risk-Based Approach (RBA)** to categorize all customers, products, and geographic corridors into three distinct risk tiers. Risk scoring determines the level of Customer Due Diligence (CDD), transaction limits, and ongoing monitoring frequency.

```
+---------------------------------------------------------------------------------------------------+
| NOTESTANDARD CUSTOMER RISK CLASSIFICATION MATRIX                                                  |
+---------------+----------------------------------+------------------------------+-----------------+
| Risk Level    | Customer Characteristics         | Verification / CDD Required  | Review Cycle    |
+---------------+----------------------------------+------------------------------+-----------------+
| LOW RISK      | Verified Nigerian individuals,   | Standard CDD (Tier 1 BVN/NIN | 36 Months       |
|               | salaried wage earners, standard  | validation via Prembly).     |                 |
|               | domestic NGN wallet transfers.   |                              |                 |
+---------------+----------------------------------+------------------------------+-----------------+
| MEDIUM RISK   | Registered SMEs, corporate       | Standard CDD + CAC Status    | 24 Months       |
|               | entities, high-frequency personal| Report & Business Address    |                 |
|               | transaction accounts.            | Verification.                |                 |
+---------------+----------------------------------+------------------------------+-----------------+
| HIGH RISK     | Politically Exposed Persons      | Enhanced Due Diligence (EDD),| 12 Months       |
|               | (PEPs), high-velocity accounts,  | Source of Wealth Validation, | (Annual Board   |
|               | cross-border remittance actors,  | & Senior Management Sign-off.| Review)         |
|               | complex SME equity structures.   |                              |                 |
+---------------+----------------------------------+------------------------------+-----------------+
```

---

## 4. CUSTOMER IDENTIFICATION & VERIFICATION (KYC/CDD) `[VERIFIED]`

No account or digital wallet may be activated on NoteStandard without successful identity verification through our primary automated compliance provider (**Prembly / IdentityPass**) `[VERIFIED]`.

- **Mandatory Verification:** Every individual user must submit a verified Bank Verification Number (BVN) or National Identification Number (NIN). Name, Date of Birth, and Phone Number are cross-checked directly against official government databases via Prembly API `[VERIFIED]`.
- **Liveness & Biometric Verification:** Live facial liveness verification and government-issued photo ID validation are mandatory for Tier 2 and Tier 3 account upgrades `[VERIFIED]`.
- **Prohibited Accounts:** Jossy Digital strictly prohibits anonymous accounts, shell bank accounts, accounts using pseudonyms/fictitious names, and accounts belonging to sanctioned individuals or entities `[VERIFIED]`.

---

## 5. ENHANCED DUE DILIGENCE (EDD) `[VERIFIED]`

Enhanced Due Diligence (EDD) is mandatorily triggered whenever:
1. A customer is identified as a **Politically Exposed Person (PEP)** or a close associate/family member of a PEP `[VERIFIED]`.
2. A customer requests transaction limit upgrades to Tier 3 (single transactions > ₦200,000 or cumulative daily > ₦500,000) `[VERIFIED]`.
3. Transaction activity involves high-risk geographic jurisdictions designated by FATF, NFIU, or Quidax Schedule 1 `[VERIFIED]`.
4. Automated risk monitoring flags unusual, complex, or structured transaction patterns (structuring/smurfing) `[VERIFIED]`.

**EDD Dossier Requirements:**
- Verification of Source of Funds and Source of Wealth documentation (e.g. bank statements, tax returns, audited accounts) `[VERIFIED]`.
- Verification of physical residential/business address via utility bills (< 3 months old) `[VERIFIED]`.
- Formal approval by the Designated Compliance Officer prior to account activation or limit increase `[VERIFIED]`.

---

## 6. SANCTIONS & PEP SCREENING PROTOCOL `[VERIFIED]`

All customers are automatically screened upon initial onboarding and continuously re-screened on a **daily automated batch cycle** against national and international sanctions databases via Prembly API `[VERIFIED]`:
- **Nigeria Sanctions List** (NFIU / Ministry of Foreign Affairs / Attorney General of the Federation) `[VERIFIED]`;
- **United Nations Security Council Consolidated Sanctions List** `[VERIFIED]`;
- **US Office of Foreign Assets Control (OFAC) Specially Designated Nationals (SDN) List** `[VERIFIED]`;
- **EU Consolidated Financial Sanctions List & UK HMT Sanctions List** `[VERIFIED]`.

**Sanctions Match Protocol:** Any positive sanctions match results in an **immediate automated freeze** of funds and account access, escalation to the Compliance Officer, and notification to partner compliance teams and the NFIU within 24 hours `[VERIFIED]`.

---

## 7. AUTOMATED TRANSACTION MONITORING & FRAUD CONTROLS `[VERIFIED]`

NoteStandard enforces automated real-time transaction monitoring rule engines (`DecisionEngine.js`) `[VERIFIED]`. The system monitors transaction velocity, volume, value, frequency, and pattern anomalies `[VERIFIED]`.

**Automated Red-Flag Alert Triggers:**
- **Pass-Through Account Activity:** Rapid deposit and instant withdrawal of funds with minimal residual balance `[VERIFIED]`.
- **Third-Party Deposit Aggregation:** Multiple deposits from unrelated third parties followed by instant aggregated payout `[VERIFIED]`.
- **Structuring / Smurfing:** Multiple structured transactions executed just below regulatory reporting thresholds (e.g., repeated transfers of ₦49,500) `[VERIFIED]`.
- **Sudden Velocity Spikes:** Uncharacteristic spikes in transaction volume inconsistent with documented profile or income source `[VERIFIED]`.
- **Dormant Account Reactivation:** Sudden high-value transactions on previously inactive accounts `[VERIFIED]`.

---

## 8. SUSPICIOUS TRANSACTION ESCALATION & NFIU REPORTING `[VERIFIED]`

```
+-----------------------------------------------------------------------------------+
| SUSPICIOUS ACTIVITY ESCALATION WORKFLOW                                          |
+-----------------------------------------------------------------------------------+
| 1. REAL-TIME ALERT: Transaction flagged by DecisionEngine.js or Compliance Audit. |
|                                         │                                         |
|                                         ▼                                         |
| 2. ACCOUNT HOLD: Instant automated quarantine placed on pending payout.          |
|                                         │                                         |
|                                         ▼                                         |
| 3. INVESTIGATION: Compliance Officer reviews EDD dossier & transaction history.  |
|                                         │                                         |
|                                         ▼                                         |
| 4. DETERMINATION:                                                                 |
|    - Cleared: Restores account to active status.                                  |
|    - Confirmed Suspicious: Permanent account freeze & formal STR drafting.        |
|                                         │                                         |
|                                         ▼                                         |
| 5. REGULATORY ESCALATION: STR/CTR filed with NFIU & partner compliance within 24h.|
+-----------------------------------------------------------------------------------+
```

- **Reporting SLA:** Suspicious Transaction Reports (STRs) and Currency Transaction Reports (CTRs) are evaluated and filed with the NFIU and partner compliance within **24 hours** of confirmation `[VERIFIED]`.
- **Tipping-Off Prohibition:** In strict compliance with MLPA 2022 Section 16, employees are strictly prohibited from disclosing to a customer or third party that an STR has been filed or that an investigation is ongoing `[VERIFIED]`.

---

## 9. RECORD RETENTION & DATA PROTECTION `[VERIFIED]`

- **5-Year Mandatory Retention:** In accordance with MLPA 2022 Section 8 and Quidax partner requirements, all customer identification records, KYC dossiers, transaction logs, ledger entries, EDD files, and STR documentation are retained in secure, encrypted storage for a minimum of **five (5) years** post-account closure or transaction execution `[VERIFIED]`.
- **Cryptographic Audit Trail:** All administrative access and compliance actions are recorded in immutable, append-only database logs (`256_immutable_audit_log.sql`) `[VERIFIED]`.
- **NDPA 2023 Compliance:** Personal data handling complies with the Nigeria Data Protection Act 2023, utilizing AES-256 encryption at rest and TLS 1.3 in transit `[VERIFIED]`.

---

## 10. EMPLOYEE TRAINING, AUDIT & POLICY REVIEW `[VERIFIED]`

- **Mandatory Staff Training:** All staff receive mandatory annual AML/CFT/CPF training covering red-flag identification, smurfing techniques, reporting protocols, and tipping-off prohibitions `[VERIFIED]`.
- **Independent Compliance Review:** Independent annual audits are conducted by external compliance auditors (3rd Line of Defense) to evaluate control effectiveness `[VERIFIED]`.
- **Policy Review Frequency:** This policy is subjected to an annual executive review (or immediate review upon significant regulatory changes) `[VERIFIED]`.

---

## 11. POLICY APPROVAL & EXECUTIVE SIGN-OFF `[VERIFIED]`

**Approved by:** Aghogho Jossy Oboh `[VERIFIED]`  
**Title:** Founder & Chief Executive Officer, Jossy Digital Technologies Ltd. `[VERIFIED]`  
**Date:** August 11, 2026 / Current Revision 2026 `[VERIFIED]`  
**Signature:** *[Executed Corporate Document — Signed & Corporate Seal Affixed]* `[VERIFIED]`  
