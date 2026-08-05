# Multi-Factor Provider Routing Guide

## 1. Overview
`BankingProviderRouter` selects banking providers dynamically based on multi-factor evaluation:
- Supported Currency (`NGN` $\rightarrow$ Fincra, `USD` $\rightarrow$ Grey)
- Provider Health Score (0–100)
- Database Capability Registry (`provider_capabilities`)
- Remaining daily capacity and liquidity thresholds
- Active maintenance windows

---

## 2. Onboarding Future Providers (Anchor, Rapyd, Cignum)
To promote a new provider (e.g., Anchor):
1. Implement `IBankingProvider` adapter (e.g. `AnchorBankingProviderV1`).
2. Register with `BankingProviderRouter.registerProvider()`.
3. Enable in `provider_capabilities` DB table.
4. Zero UI redesign, zero API changes, zero double-entry ledger changes required!
