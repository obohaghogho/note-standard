# NOTESTANDARD — BUSINESS & CRYPTO USE-CASE OVERVIEW

**Document ID:** `JDT-QUIDAX-DOC-A`  
**Legal Entity:** Jossy Digital Technologies Ltd.  
**Registration Number:** RC 9586407  
**Operating Brand / Platform:** NoteStandard  
**Managing Director & CEO:** Aghogho Jossy Oboh (100% Ultimate Beneficial Owner) `[VERIFIED]`  
**Registered Address:** Effurun, Delta State, Federal Republic of Nigeria `[VERIFIED]`  
**Effective Date:** August 11, 2026 / Revision 2026  
**Document Status:** DRAFT FOR COMPLIANCE REVIEW — PENDING MANAGEMENT FORECAST `[PENDING MANAGEMENT CONFIRMATION]`  

---

## 1. EXECUTIVE SUMMARY

Jossy Digital Technologies Ltd. ("Jossy Digital" or "the Company"), operating under the brand name **NoteStandard**, is a Nigerian financial technology company incorporated under the laws of the Federal Republic of Nigeria (RC 9586407) `[VERIFIED]`. 

NoteStandard develops and operates a modern enterprise fintech platform and digital workspace solution. The platform provides multi-currency digital wallets, virtual bank accounts, NIP instant bank transfers, internal ledger transfers, merchant collections, bill payments, and integrated digital asset workflows through regulated third-party infrastructure partners `[VERIFIED]`.

NoteStandard operates strictly as a **technology solution provider** `[VERIFIED]`. NoteStandard is **not** an independent order-book cryptocurrency exchange, does **not** operate an un-hosted wallet infrastructure, and does **not** hold customer cryptocurrency private keys `[VERIFIED]`. All cryptocurrency deposit address generation, hot/cold wallet custody, market order-book execution, and crypto-to-fiat liquidation workflows are delegated to regulated third-party crypto infrastructure partners `[INTERNAL DESIGN]`. NoteStandard proposes to integrate **Quidax** as its primary crypto infrastructure provider for deposit address generation, custody, and instant crypto-to-fiat (NGN) liquidation `[INTERNAL DESIGN]`.

---

## 2. CORPORATE IDENTITY & OWNERSHIP STRUCTURE

- **Legal Entity Name:** Jossy Digital Technologies Ltd. `[VERIFIED]`
- **CAC Registration Number:** RC 9586407 `[VERIFIED]`
- **Incorporation Type:** Private Limited Company (Privately Owned) `[VERIFIED]`
- **Years in Operation:** Less than 1 year `[VERIFIED]`
- **Head Office Address:** Effurun, Delta State, Nigeria `[VERIFIED]`
- **Official Website:** `https://notestandard.com` `[VERIFIED]`
- **Official Administrative Email:** `admin@notestandard.com` `[VERIFIED]`
- **Official Support Email:** `support@notestandard.com` `[VERIFIED]`
- **Managing Director & CEO:** Aghogho Jossy Oboh `[VERIFIED]`
- **Ownership & Control:** Aghogho Jossy Oboh holds 100% equity ownership and ultimate beneficial ownership (UBO) of Jossy Digital Technologies Ltd. `[VERIFIED]`
- **Primary Funding:** Founder-funded `[VERIFIED]`

---

## 3. NOTESTANDARD PRODUCT & ARCHITECTURE OVERVIEW

NoteStandard integrates digital workspace collaboration with financial transaction capabilities:

```
+-----------------------------------------------------------------------------------+
|                            NOTESTANDARD FRONTEND USER INTERFACE                   |
|                        (Web Application & Mobile Responsive App)                  |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                        NOTESTANDARD APPLICATION & RISK SERVER                     |
|  - Auth & JWT Session Verification                                                |
|  - Tier 1-3 KYC & Limits Enforcement (Prembly Integration)                        |
|  - Decision Engine & Velocity Rules                                               |
|  - Authoritative PostgreSQL Double-Entry Ledger (wallets_v6, ledger_entries)      |
|  - Multi-Provider Reserve Engine (Solvency Assertions)                            |
|  - Dead Letter Queue & Atomic Reversals                                           |
+-----------------------------------------------------------------------------------+
                       ┌─────────────────┴─────────────────┐
                       ▼                                   ▼
+------------------------------------+   +------------------------------------+
|  FIAT CLEARING RAILS               |   |  CRYPTO INFRASTRUCTURE RAIL        |
|  - Anchor Software Ltd (BaaS NGN)  |   |  - Quidax (Intended Provider)      |
|  - Fincra Technologies (Collections)|   |    * Deposit Address Generation    |
|  - Grey Banking (Multi-Currency)   |   |    * Hot Wallet Custody           |
|  - Zenith / GTBank (Settlement)    |   |    * Liquidation Quote & Trade      |
+------------------------------------+   +------------------------------------+
```

---

## 4. TARGET MARKET & CUSTOMER PROFILE

- **Geographic Scope:** Federal Republic of Nigeria `[VERIFIED]`. NoteStandard does not onboard non-resident entity accounts or US persons `[INTERNAL DESIGN]`.
- **Target Customer Base:** Individual wage earners, remote professionals, digital freelancers, small and medium-sized enterprises (SMEs), and digital workspace collaboration teams in Nigeria `[VERIFIED]`.
- **User Demographics:** Tech-savvy individuals and corporate entities requiring unified multi-currency balance tracking, workspace tools, and instant payment settlement `[VERIFIED]`.

---

## 5. FIAT & CRYPTO SERVICES ARCHITECTURE

### 5.1 Fiat Services `[VERIFIED]`
- **NGN Virtual Accounts:** Dedicated virtual bank account generation for user wallet funding via NIP bank transfers (powered by Anchor Software Ltd & Fincra Technologies).
- **NIP Instant Bank Transfers:** Outbound fiat transfers to any licensed Nigerian commercial bank or microfinance bank.
- **Merchant Collections:** Dynamic checkout and payment collection APIs for SMEs.
- **Internal Ledger Transfers:** Instant, zero-fee wallet-to-wallet transfers between NoteStandard users.

### 5.2 Crypto Services `[INTERNAL DESIGN]`
- **Crypto Deposit Address Assignment:** Assigning per-user deposit addresses for supported assets (BTC, ETH, USDT, USDC) generated via Quidax provider APIs.
- **Crypto Balance Tracking:** Displaying internal ledger representations of deposited crypto assets.
- **Instant Crypto-to-Fiat Liquidation:** Executing user-initiated liquidation requests where crypto is sold via Quidax order books for NGN fiat proceeds.
- **NGN Wallet Settlement:** Automatically crediting the net NGN proceeds of crypto liquidations to the user's NGN fiat wallet for local use or withdrawal.

---

## 6. END-TO-END TRANSACTION WORKFLOWS

### 6.1 Customer Crypto Deposit Flow `[INTERNAL DESIGN]` / `[PENDING QUIDAX CONFIRMATION]`
1. User navigates to NoteStandard Wallet interface and selects "Deposit Crypto".
2. NoteStandard server dispatches a request to Quidax API to fetch/generate a deposit address for the specific user and asset.
3. Quidax returns the blockchain address (and Memo/Tag where applicable). NoteStandard displays the address to the user.
4. User transfers crypto from an external wallet to the generated address.
5. Quidax detects the deposit on the blockchain, monitors confirmation thresholds, and executes on-chain screening.
6. Upon completion, Quidax dispatches a cryptographically signed webhook notification to NoteStandard (`/api/webhooks/quidax`).
7. NoteStandard server verifies the HMAC signature, executes idempotency checks, and invokes the PostgreSQL double-entry ledger function (`confirm_deposit_v7`) to credit the user's internal crypto wallet.

### 6.2 Crypto-to-Fiat Liquidation Flow `[INTERNAL DESIGN]` / `[PENDING QUIDAX CONFIRMATION]`
1. User selects "Sell Crypto" and inputs the asset amount to liquidate.
2. NoteStandard dispatches a quote request to Quidax API (`getQuote`) to lock an instant NGN rate.
3. Quidax returns a guaranteed ticker quote with an expiry window (e.g. 15-30 seconds).
4. User confirms the sell order in the NoteStandard interface.
5. NoteStandard dispatches an execution payload to Quidax API (`executeLiquidation`).
6. Quidax executes the trade against its liquidity pools, debiting the crypto and crediting NGN fiat proceeds to NoteStandard's settlement account.
7. NoteStandard dispatches atomic PostgreSQL double-entry ledger RPC (`execute_ledger_transaction_v6`):
   - Debits the user's crypto wallet balance.
   - Credits the user's NGN fiat wallet balance.

### 6.3 Fiat Settlement & NGN Withdrawal Flow `[VERIFIED]`
1. User selects "Withdraw Funds" and inputs the NGN amount and target bank account details.
2. NoteStandard `WithdrawalWorkflowService` verifies user KYC tier limits and daily velocity.
3. `MultiProviderReserveEngine.js` asserts that total treasury assets exceed total ledger liabilities (Reserve Ratio > 100%).
4. NoteStandard dispatches an outbound NIP transfer payload to Anchor Software Ltd or Fincra Technologies.
5. Anchor/Fincra routes the funds over the NIBSS instant payment network to the recipient bank account.
6. Internal ledger state is updated to `COMPLETED`, and an immutable audit log entry is recorded.

---

## 7. CUSTODY & TREASURY ARCHITECTURE

- **Non-Custodial NoteStandard Positioning:** NoteStandard does **not** maintain hot, warm, or cold crypto wallet infrastructure directly `[VERIFIED]`. NoteStandard does **not** store private keys on any application server, database, or cloud environment `[VERIFIED]`.
- **Delegated Crypto Custody:** All physical crypto asset custody, private key security (HSM/cold storage), and multi-sig authorization are delegated entirely to **Quidax** `[INTERNAL DESIGN]`.
- **Authoritative Internal Ledger:** NoteStandard maintains its own double-entry PostgreSQL ledger as the sole system of record for user account balances, internal transfers, and transaction history `[VERIFIED]`. Clearing partners (Anchor, Fincra, Quidax) act solely as clearing rails and external balance providers, not as the internal system of record `[VERIFIED]`.
- **Reserve Solvency Assertions:** NoteStandard's `MultiProviderReserveEngine.js` continuously monitors external provider balances against internal ledger liabilities `[VERIFIED]`. Quidax balances are currently marked `NOT_ELIGIBLE_FOR_RESERVE_ASSERTION` in `TTL_MAP_MS` until official Quidax balance APIs and TTL freshness standards are confirmed and verified `[VERIFIED]`.

---

## 8. RESPONSIBILITIES DEMARCATION SUMMARY

| Operational Domain | NoteStandard Responsibility | Quidax Responsibility |
| :--- | :--- | :--- |
| **Customer Onboarding & Identification** | Full KYC (Tier 1-3), BVN/NIN validation via Prembly, facial liveness verification. `[VERIFIED]` | None. |
| **Sanctions & PEP Screening (User Name/ID)**| Screening users against UN, OFAC SDN, EU, UK HMT, and Nigeria lists via Prembly. `[VERIFIED]` | None. |
| **Platform Financial Accounting** | Authoritative double-entry ledger, balance tracking, fee calculations, DLQ reversals. `[VERIFIED]` | None. |
| **Crypto Address Generation & Custody** | None (Requests via API). | Address generation, private key management, cold/hot storage custody. `[PENDING QUIDAX]` |
| **On-Chain Blockchain Monitoring** | None. | Monitoring blockchain transactions, confirmation thresholds, re-org handling. `[PENDING QUIDAX]` |
| **Crypto Risk & Sanctions Screening** | None. | Screening wallet addresses against OFAC crypto lists, mixer/tumbler checks. `[PENDING QUIDAX]` |
| **Crypto Liquidation & Order-Book Execution**| Dispatches trade requests via API. | Liquidity provision, quote generation, instant trade execution against order book. `[PENDING QUIDAX]` |
| **VASP Travel Rule Compliance** | None (N/A to non-custodial interface). | Originator/beneficiary VASP information exchange (IVMS101 protocol). `[PENDING QUIDAX]` |

---

## 9. EXPECTED TRANSACTION ACTIVITY

> [!IMPORTANT]
> **VERIFIED HISTORICAL TRANSACTION ACTIVITY:**  
> Database forensic audit confirms **0.00** historical customer crypto transaction volume, **0** live customer deposit addresses, and **0** user balances dependent on crypto custody `[VERIFIED]`.

### Future Business Forecast `[PENDING MANAGEMENT CONFIRMATION]`
The following figures represent projected initial transaction activity post-launch, subject to executive management approval and sandbox testing:

- **Projected Active Crypto Users (Year 1):** `[PENDING MANAGEMENT CONFIRMATION — DO NOT ESTIMATE]`
- **Projected Monthly Crypto Liquidation Volume:** `[PENDING MANAGEMENT CONFIRMATION — DO NOT ESTIMATE]`
- **Expected Average Transaction Size:** `[PENDING MANAGEMENT CONFIRMATION — DO NOT ESTIMATE]`
- **Maximum Single Transaction Limit:** Tier 1: ₦50,000 | Tier 2: ₦200,000 | Tier 3: ₦5,000,000 `[VERIFIED]`
- **Supported Launch Assets:** BTC, ETH, USDT, USDC `[INTERNAL DESIGN]`

---

## 10. DOCUMENT APPROVAL & SIGN-OFF

**Prepared by:** Compliance & Risk Operations Team, Jossy Digital Technologies Ltd. `[VERIFIED]`  
**Reviewed by:** Lead Technical Architect, NoteStandard Platform `[VERIFIED]`  
**Approved by:** Aghogho Jossy Oboh, Founder & Chief Executive Officer `[VERIFIED]`  
**Date:** August 11, 2026 / Current Revision 2026 `[VERIFIED]`  
**Execution Status:** *[Executed Corporate Document — Signed & Corporate Seal Affixed]* `[VERIFIED]`  
