# NOTESTANDARD — KYC/CDD & CUSTOMER RISK FRAMEWORK

**Document ID:** `JDT-KYC-POL-2026-V1` `[VERIFIED]`  
**Legal Entity:** Jossy Digital Technologies Ltd. (RC 9586407) `[VERIFIED]`  
**Operating Brand / Platform:** NoteStandard `[VERIFIED]`  
**Managing Director & CEO:** Aghogho Jossy Oboh `[VERIFIED]`  
**Target Submission:** Quidax Compliance Review Team `[VERIFIED]`  
**Effective Date:** August 11, 2026 / Current Revision 2026 `[VERIFIED]`  
**Version / Status:** Version 1.0 &bull; Approved `[VERIFIED]`  

---

## 1. POLICY OBJECTIVE & SCOPE `[VERIFIED]`

This Know Your Customer (KYC) & Customer Due Diligence (CDD) Framework defines the mandatory identity verification standards, tiered transaction limits, customer risk classification, corporate onboarding rules, and ongoing monitoring cycles enforced by Jossy Digital Technologies Ltd. across the NoteStandard platform `[VERIFIED]`.

The primary objective is to verify the identity of every individual and corporate user before activating wallet functionality or executing transactions, ensuring strict alignment with Central Bank of Nigeria (CBN) Tiered KYC Regulations, Money Laundering (Prevention and Prohibition) Act 2022, and partner clearing requirements `[VERIFIED]`.

---

## 2. TIERED CUSTOMER IDENTIFICATION ARCHITECTURE `[VERIFIED]`

NoteStandard operates a strict **Three-Tier Customer Account Architecture** `[VERIFIED]`. Tier movement requires successful verification of cumulative identity artifacts.

```
+---------------------------------------------------------------------------------------------------+
| NOTESTANDARD TIERED KYC & TRANSACTION LIMIT MATRIX                                                |
+-------+----------------------------------+-------------------+------------------------------------+
| Tier  | Verification Artifacts Required  | Single Tx Limit   | Daily Cumulative / Balance Limit   |
+-------+----------------------------------+-------------------+------------------------------------+
| TIER 1| - Full Legal Name                | ₦50,000           | ₦300,000 Cumulative Daily          |
|       | - Date of Birth                  |                   |                                    |
|       | - Mobile Phone Number            |                   |                                    |
|       | - Verified BVN or NIN (Prembly)  |                   |                                    |
+-------+----------------------------------+-------------------+------------------------------------+
| TIER 2| - Tier 1 Requirements            | ₦200,000          | ₦500,000 Cumulative Daily          |
|       | - Verified Government Photo ID   |                   |                                    |
|       |   (NIN Slip / Driver's Licence / |                   |                                    |
|       |   International Passport)        |                   |                                    |
|       | - Live Biometric Liveness Check  |                   |                                    |
+-------+----------------------------------+-------------------+------------------------------------+
| TIER 3| - Tier 2 Requirements            | ₦5,000,000        | Unlimited Cumulative Daily         |
|       | - Proof of Residential Address   |                   | (Subject to Risk Engine Checks)   |
|       |   (Utility Bill < 3 months)      |                   |                                    |
|       | - Source of Income Verification  |                   |                                    |
+-------+----------------------------------+-------------------+------------------------------------+
```

### Verification Vendor Integration `[VERIFIED]`
All individual customer identity checks (BVN validation, NIN verification, Government ID matching, facial liveness verification, and OFAC/sanctions screening) are executed automatically via integrated APIs provided by **Prembly (IdentityPass)** `[VERIFIED]`.

---

## 3. CORPORATE & SME ONBOARDING STANDARDS `[VERIFIED]`

Corporate and business entity accounts opened on NoteStandard require comprehensive corporate due diligence prior to account activation:

1. **Certificate of Incorporation:** Issued by the Corporate Affairs Commission (CAC) confirming legal status (RC 9586407 equivalent) `[VERIFIED]`.
2. **Form CAC 1.1 / Status Report:** Official status report detailing legal directors, company secretary, and shareholding structure `[VERIFIED]`.
3. **Tax Identification Number (TIN):** Verified against official Federal Inland Revenue Service (FIRS) records `[VERIFIED]`.
4. **Memorandum and Articles of Association (MEMART):** Certified copy detailing corporate objects and powers `[VERIFIED]`.
5. **Director & UBO Identification:** Verified BVN/NIN and government-issued IDs for all Directors and Ultimate Beneficial Owners holding qualifying equity `[VERIFIED]`.
6. **Board Resolution:** Executed board resolution authorizing the opening of the NoteStandard account and designating authorized signatories `[VERIFIED]`.

---

## 4. ULTIMATE BENEFICIAL OWNERSHIP (UBO) VERIFICATION `[VERIFIED]`

NoteStandard enforces a strict **Ultimate Beneficial Owner (UBO)** threshold `[VERIFIED]`:
- **UBO Threshold:** Identification and verification are mandatory for every natural person who ultimately owns, controls, or holds voting rights of **5% or more** in a corporate account `[VERIFIED]`.
- **UBO Documentation:** Verified BVN/NIN, government ID, residential address proof, and notarised ownership declaration `[VERIFIED]`.
- **Ownership Verification:** Complex corporate structures are traced through parent entities to identify the final natural persons holding controlling interest `[VERIFIED]`.

---

## 5. SANCTIONS & PEP SCREENING PROTOCOL `[VERIFIED]`

All customers (individuals, corporate directors, and UBOs) are screened against global and national watchlist databases prior to account activation and continuously re-screened on a **daily automated batch schedule** via Prembly `[VERIFIED]`.

**Watchlist Coverage:**
- **Nigeria Sanctions List** (NFIU / Ministry of Foreign Affairs) `[VERIFIED]`;
- **United Nations Security Council Consolidated Sanctions List** `[VERIFIED]`;
- **US OFAC Specially Designated Nationals (SDN) List** `[VERIFIED]`;
- **EU Consolidated Financial Sanctions List & UK HMT List** `[VERIFIED]`.

**PEP Risk Management:**
- Politically Exposed Persons (PEPs), their family members, and close associates are classified as **High Risk** `[VERIFIED]`.
- Account approval for PEPs requires mandatory Enhanced Due Diligence (EDD), Source of Wealth validation, and formal sign-off by the Designated Compliance Officer `[VERIFIED]`.

---

## 6. ENHANCED DUE DILIGENCE (EDD) TRIGGERS `[VERIFIED]`

EDD procedures are automatically triggered under the following operational conditions:
1. **PEP Identification:** Matches against national or international PEP lists `[VERIFIED]`.
2. **High-Value Limits Request:** Customer requests upgrade to Tier 3 limits (> ₦200,000 single / > ₦500,000 daily) `[VERIFIED]`.
3. **Geographic Risk:** Transactions involving high-risk jurisdictions designated by FATF, NFIU, or Quidax Schedule 1 `[VERIFIED]`.
4. **Suspicious Pattern Alert:** Flagged velocity spikes, pass-through transfers, or structuring patterns `[VERIFIED]`.

**EDD Action Steps:**
- Obtaining certified proof of residential address (< 3 months old utility bill) `[VERIFIED]`.
- Obtaining documented proof of Source of Funds / Source of Wealth (bank statements, salary slips, corporate audited accounts) `[VERIFIED]`.
- Mandatory review and written approval by the Compliance Officer prior to transaction release `[VERIFIED]`.

---

## 7. ONGOING MONITORING & DATA REFRESH CYCLES `[VERIFIED]`

Customer profiles and KYC records are subjected to periodic reviews and trigger-based refreshes:

```
+-----------------------------------------------------------------------------------+
| ONGOING MONITORING & DATA REFRESH SCHEDULE                                        |
+-------------------+-----------------------------------+---------------------------+
| Risk Tier         | Data Refresh Frequency            | Monitoring Scope          |
+-------------------+-----------------------------------+---------------------------+
| HIGH RISK / PEP   | Every 12 Months (Annual Audit)    | Full KYC & EDD Dossier,   |
|                   |                                   | Daily Sanctions Rescreen  |
+-------------------+-----------------------------------+---------------------------+
| MEDIUM RISK (SME) | Every 24 Months                   | CAC Status Check,         |
|                   |                                   | Daily Sanctions Rescreen  |
+-------------------+-----------------------------------+---------------------------+
| LOW RISK (TIER 1) | Every 36 Months                   | BVN/NIN Status Check,     |
|                   |                                   | Daily Sanctions Rescreen  |
+-------------------+-----------------------------------+---------------------------+
| TRIGGER EVENT     | Immediate Mandatory Refresh       | Required on Legal Name    |
|                   |                                   | Change, Structuring Alert,|
|                   |                                   | or Limit Upgrade Request  |
+-------------------+-----------------------------------+---------------------------+
```

---

## 8. ACCOUNT RESTRICTION & SUSPENSION PROTOCOL `[VERIFIED]`

NoteStandard enforces immediate automated account restrictions under the following conditions:
- **Sanctions Match:** Instant freeze of all wallet balances and transfer functionality upon positive sanctions hit `[VERIFIED]`.
- **Falsified ID:** Immediate account suspension if submitted BVN, NIN, or government ID is flagged as revoked, falsified, or belonging to another deceased individual `[VERIFIED]`.
- **Unverified Tier 1:** Accounts failing initial BVN/NIN validation are blocked from creating deposit virtual accounts or executing transactions `[VERIFIED]`.

---

## 9. POLICY APPROVAL & EXECUTIVE SIGN-OFF `[VERIFIED]`

**Approved by:** Aghogho Jossy Oboh `[VERIFIED]`  
**Title:** Founder & Chief Executive Officer, Jossy Digital Technologies Ltd. `[VERIFIED]`  
**Date:** August 11, 2026 / Current Revision 2026 `[VERIFIED]`  
**Signature:** *[Executed Corporate Document — Signed & Corporate Seal Affixed]* `[VERIFIED]`  
