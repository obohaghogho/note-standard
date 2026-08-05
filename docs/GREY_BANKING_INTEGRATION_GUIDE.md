# Enterprise Grey Business Banking & Lead Bank Virtual USD Checking Integration Guide

**Platform Version**: NoteStandard Financial Subsystem v4.5  
**Banking Partner**: Lead Bank (Virtual USD Checking Accounts via Grey Business API)  
**Document Classification**: Enterprise Architecture & Operational Playbook  

---

## 1. Overview & Operational Architecture

NoteStandard integrates Grey Business API strictly as a **Banking & Settlement Provider** (`GreyBankingProvider`), **not** as a wallet. The internal double-entry ledger (`journal_lines`) remains the sole authoritative source of truth for all user balances.

### Banking Architecture Flow:

```text
User Deposit Intent
       │
       ▼
NoteStandard Wallet
       │
       ▼
Internal Double-Entry Ledger (Authoritative Source of Truth)
       │
       ▼
Treasury Engine & Deposit Matching Engine (Confidence Scoring)
       │
       ▼
BankingProviderRouter & SettlementLayerRouter
       │
       ▼
GreyBankingProvider (Lead Bank Virtual USD Checking Account)
       │
       ▼
U.S. Domestic Banking Network (ACH / Domestic Wire)
```

---

## 2. Lead Bank Virtual USD Checking Account Capabilities

| Attribute | Capability | Operational Rule / Boundary |
| :--- | :--- | :--- |
| **Account Type** | Virtual USD Checking Account | U.S. Domestic Checking Account |
| **Bank Partner** | Lead Bank | FDIC insured partner bank |
| **ACH Receiving** | Supported | Lower cost, 1 - 2 business days settlement |
| **Domestic Wire** | Supported | Higher priority, same-day settlement |
| **SWIFT International** | **NOT Supported** | Transfers MUST originate from U.S. domestic banks in USD |
| **P2P & FX Swaps** | Supported | Grey Business API P2P transfers & FX currency swaps |
| **Daily Payout Cap** | $100,000 USD / Day | Real-time capacity gauge tracking with alerts |

---

## 3. Dynamic Deposit Instruction Generation

Deposit instructions are never hardcoded. `DepositInstructionService` queries `BankingProviderRouter` & `GreyBankingProvider` to fetch dynamic Lead Bank account credentials and outputs structured user instructions:

```json
{
  "providerId": "grey",
  "currency": "USD",
  "accountHolder": "Jossy Digital Technologies Ltd / NoteStandard",
  "bankName": "Lead Bank",
  "accountNumber": "8839201948",
  "achRouting": "074000010",
  "wireRouting": "074000010",
  "accountType": "Checking",
  "referenceMemo": "NS-USER123",
  "supportedMethods": ["ACH", "Domestic Wire", "U.S. Bank Transfers"],
  "unsupportedMethods": ["SWIFT International Wires", "Non-USD Currencies"],
  "estimatedProcessingTime": "1 - 2 Business Days (ACH) / Same Day (Wire)",
  "notices": [
    "USD deposits MUST originate from a U.S. domestic bank account.",
    "ACH and Domestic Wire transfers are fully supported.",
    "International SWIFT transfers are NOT supported and will be rejected by Lead Bank."
  ]
}
```

---

## 4. Confidence-Scored Deposit Matching Engine

`DepositMatchingService` evaluates incoming deposits against expected deposit intents using a multi-factor confidence scoring waterfall:

| Criteria | Score Contribution |
| :--- | :---: |
| **Reference Match in Memo** | +60 pts |
| **Virtual Account Match** | +50 pts |
| **Expected User Intent Match** | +30 pts |
| **Exact Amount Match** | +20 pts |
| **Currency Match** | +15 pts |
| **Deposit Window (72h)** | +10 pts |
| **Description / Memo Match** | +15 pts |

### Threshold Action Rules:
- $\ge 95\%$: **Automatic Wallet Credit** (State: `COMPLETED`)
- $70\% - 94\%$: **Manual Review Recommended** (State: `MANUAL_REVIEW`)
- $< 70\%$: **Unknown Deposit Queue** (State: `UNALLOCATED` $\rightarrow$ routed to `unallocated_deposits` table for admin resolution)

---

## 5. Explicit Double-Entry Fee Accounting

Provider incoming fees (ACH & Wire fees) are **never deducted silently** from user deposits.

### Journal Entry Pattern:
1. **Debit**: `Treasury Receivable / Grey Custody` (`+ $1,000.00`)
2. **Debit**: `Grey Fee Expense` (`+ $2.50` ACH/Wire Fee)
3. **Credit**: `User Wallet Available Balance` (`+ $1,000.00`)
4. **Credit**: `Settlement Payable / Provider Fee Reserve` (`+ $2.50`)

*Total Debits ($1,002.50) = Total Credits ($1,002.50)* — Double-entry parity guaranteed.
