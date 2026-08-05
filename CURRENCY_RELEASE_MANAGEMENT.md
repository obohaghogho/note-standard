# Enterprise Currency Release Management & Feature Flag System

---

## Overview

NoteStandard implements an enterprise-grade, configuration-driven **Currency Release Management System**.

The platform maintains environment-aware visibility rules:
- **Production (`NODE_ENV === 'production'`)**: Only officially launched, production-ready currencies (🇳🇬 **NGN** and 🇺🇸 **USD**) are exposed to non-admin users across UI views and API endpoints.
- **Development (`NODE_ENV === 'development'`)**: Developers and testers retain full operational visibility and execution access to all supported fiat currencies (`NGN`, `USD`, `EUR`, `GBP`, `CAD`, `AUD`, `ZAR`) on `localhost`.
- **Admin Dashboards**: Administrators maintain full visibility across all currencies in all environments with status indicators (🟢 Live, 🟡 Development, ⚪ Coming Soon).
- **Treasury Operations**: Treasury Dashboard tracks balances, liquidity, reconciliation, and provider health for all currencies regardless of environment.

---

## 🏛️ Architecture & Principles

### 1. Zero Schema Deletion
Unreleased currencies (`EUR`, `GBP`, `CAD`, `AUD`, `ZAR`) remain fully defined in:
- Database tables (`wallets`, `transactions`, `ledger_entries`)
- Settlement provider adapters (`GreySettlementProvider`, `FincraSettlementProvider`)
- Internal double-entry ledger

Visibility is controlled strictly through configuration and feature flag evaluation.

### 2. Single Source of Truth (`CurrencyRegistry`)
All currency metadata, availability flags, and release stages are registered in:
- `shared/config/CurrencyRegistry.ts` (Frontend & Shared)
- `server/config/CurrencyRegistry.js` (Backend Services)

```typescript
export interface CurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  status: 'LIVE' | 'DEVELOPMENT' | 'COMING_SOON';
  provider: string;
  enabled: boolean;
  visible: boolean;
  comingSoon: boolean;
  releaseStage: 'PROD_READY' | 'BETA' | 'ALPHA' | 'PLANNED';
  supportedDepositMethods: string[];
  supportedWithdrawalMethods: string[];
  supportedSwapMethods: string[];
}
```

### 3. Feature Flag Engine (`CurrencyFeatureService`)
Methods exposed:
- `getVisibleCurrencies(isAdmin?: boolean)`: Returns list of visible currency codes for current environment.
- `canDeposit(code: string, isAdmin?: boolean)`: Evaluates deposit permission.
- `canWithdraw(code: string, isAdmin?: boolean)`: Evaluates withdrawal permission.
- `canTransfer(code: string, isAdmin?: boolean)`: Evaluates internal transfer permission.
- `canSwap(fromCurrency: string, toCurrency: string, isAdmin?: boolean)`: Evaluates FX swap pair availability (In Production: strictly `NGN ↔ USD`).
- `validateCurrencyRelease(paramName)`: Express middleware enforcing HTTP 403 on unreleased currencies in production.

---

## 🔒 Security Model & API Protection

Backend endpoints (`/deposit`, `/transfer`, `/withdraw`, `/swap`, `/checkout`) validate incoming currency parameters against `CurrencyFeatureService`.

If a non-admin client requests an unreleased currency (e.g. `EUR`) in production, the server responds with:

```json
HTTP 403 Forbidden
{
  "success": false,
  "error": "Currency not yet available."
}
```

---

## 🚀 How to Launch a New Currency

To promote a currency (e.g. `EUR`) from Development to Production:

1. Open `shared/config/CurrencyRegistry.ts` and `server/config/CurrencyRegistry.js`.
2. Update the target currency entry:
   ```javascript
   {
     code: "EUR",
     status: "LIVE",
     enabled: true,
     releaseStage: "PROD_READY"
   }
   ```
3. Deploy the application. No UI redesign, database migration, or component modification is required.
