# Enterprise Treasury & Operational Governance Manual

## 1. Liquidity Management & Reserve Tracking
Treasury tracks operational balances separately from customer double-entry ledger balances:
- **Operational Balance**: Total cash held at banking provider.
- **Reserved Balance**: Locked funds reserved for pending payouts.
- **Pending Credits**: Transfers detected but not yet settled.
- **Spendable Liquidity**: $Spendable = Operational - Reserved - MinimumReserve$.

---

## 2. Emergency Command Center & Controls
Operations can toggle controls in `treasury_command_controls`:
- `pause_deposits`: Pauses new deposit session generation.
- `pause_withdrawals`: Pauses outbound payout processing.
- `provider_maintenance_mode`: Signals maintenance for a specific provider.
- `emergency_ledger_lock`: Prevents ledger posting during financial audits.
