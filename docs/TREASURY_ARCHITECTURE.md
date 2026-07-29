# NoteStandard Enterprise Treasury Architecture
## Technical Reference Document

---

## 1. Architecture Overview

NoteStandard's treasury layer sits above the existing payment core and never replaces it. The relationship is strictly additive:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT / ADMIN UI                            │
└────────────────────────────┬────────────────────────────────────┘
                             │  HTTP
┌────────────────────────────▼────────────────────────────────────┐
│                 API LAYER  (Express)                            │
│     /api/admin/treasury/*    (new — requireAdmin)              │
│     /api/*                   (existing — unchanged)            │
└────────┬───────────────────────────────────────────────────────┘
         │
┌────────▼───────────────────────────────────────────────────────┐
│               TREASURY DOMAIN  (NEW)                           │
│  server/services/treasury/                                     │
│                                                                │
│  TreasuryMonitor ──orchestrates──▶ TreasuryService             │
│       │                                ├── FincraBalanceFetcher │
│       │                                ├── PaystackBalanceFetcher│
│       │                                ├── NowPaymentsBalanceFetcher│
│       │                                └── GreyBalanceFetcher  │
│       │                                                        │
│       ├──────────────────────▶ ReserveCalculator               │
│       ├──────────────────────▶ TreasuryAlertService            │
│       ├──────────────────────▶ LiquidityEngine                 │
│       └──────────────────────▶ TreasuryHealth                  │
│                                                                │
│  SettlementStateMachine    FXTreasuryEngine                    │
│  ProviderHealthEngine      ImmutableAuditLog                   │
│  TreasuryDashboardService                                      │
└────────┬───────────────────────────────────────────────────────┘
         │  reads only
┌────────▼───────────────────────────────────────────────────────┐
│         EXISTING PAYMENT CORE  (UNCHANGED)                     │
│                                                                │
│  LedgerService ─▶ execute_ledger_transaction_v6 (RPC)         │
│  FiatWalletService    CryptoWalletService                      │
│  PaymentOrchestrator  GatewayRouter                            │
│  FraudEngine          ReconciliationWorker                     │
│  SnapshotService      CommissionService                        │
└────────────────────────────────────────────────────────────────┘
```

**Key contract:** The treasury layer is read-only with respect to user wallets and the ledger. It only writes to its own tables (`treasury_provider_balances`, `treasury_balance_snapshots`, `reserve_ratios`, `settlements`, `treasury_transfers`, `fx_positions`, `treasury_audit_log`, `liquidity_recommendations`, `provider_health_status`, `provider_health_probes`).

---

## 2. Treasury Service Index

| Service | File | Purpose |
|---|---|---|
| TreasuryService | `services/treasury/TreasuryService.js` | Orchestrates provider balance fetching and snapshot storage |
| TreasuryMonitor | `services/treasury/TreasuryMonitor.js` | Single cycle runner: sync → reserve → alert → liquidity → health |
| ReserveCalculator | `services/treasury/ReserveCalculator.js` | Reserve ratio computation per currency |
| LiquidityEngine | `services/treasury/LiquidityEngine.js` | Liquidity gap analysis and recommendations |
| TreasuryHealth | `services/treasury/TreasuryHealth.js` | Unified 0–100 health score with grade |
| TreasuryAlertService | `services/treasury/TreasuryAlertService.js` | Tiered alert dispatch with deduplication |
| TreasuryDashboardService | `services/treasury/TreasuryDashboardService.js` | Dashboard payload assembly |
| SettlementStateMachine | `services/treasury/SettlementStateMachine.js` | 9-stage settlement lifecycle |
| ImmutableAuditLog | `services/treasury/ImmutableAuditLog.js` | SHA-256 hash-chained audit records |
| ProviderHealthEngine | `services/treasury/ProviderHealthEngine.js` | Circuit breaker + GatewayRouter integration |
| FXTreasuryEngine | `services/treasury/FXTreasuryEngine.js` | FX trade P&L and exposure recording |

---

## 3. Worker Schedule

| Worker | File | Interval | Boot Delay | Purpose |
|---|---|---|---|---|
| TreasuryBalanceSyncWorker | `workers/TreasuryBalanceSyncWorker.js` | 5 min (env: `TREASURY_SYNC_INTERVAL_MS`) | 15s | Full monitoring cycle |
| AggregateReconciliationWorker | `workers/AggregateReconciliationWorker.js` | 15 min (env: `AGG_RECON_INTERVAL_MS`) | 45s | Currency-level ledger vs. provider comparison |
| ProviderHealthWorker | `workers/ProviderHealthWorker.js` | 60s (env: `PROVIDER_PROBE_INTERVAL_MS`) | 30s | Active provider probing + circuit breakers |
| LiquidityForecastWorker | `workers/LiquidityForecastWorker.js` | 10 min (env: `LIQUIDITY_INTERVAL_MS`) | 60s | Liquidity gap detection and auto-resolution |

---

## 4. Database Schema Summary

| Table | Type | Purpose |
|---|---|---|
| `treasury_provider_balances` | Live (upsert) | Latest known balance per provider+currency |
| `treasury_balance_snapshots` | Append-only | Immutable history with reserve_ratio generated column |
| `reserve_ratios` | Append-only | Time-series reserve ratios per currency |
| `reserve_thresholds` | Config | Per-currency warn/critical/freeze thresholds |
| `settlements` | Mutable | Settlement lifecycle records |
| `settlement_transitions` | Append-only | Every stage transition (immutable) |
| `treasury_transfers` | Mutable | Inter-provider transfer requests + approval |
| `fx_positions` | Append-only | Every FX swap trade with rate traceability |
| `fx_exposure_summary` | Upsert daily | Daily currency pair exposure |
| `treasury_audit_log` | Append-only | Hash-chained immutable audit stream |
| `provider_health_status` | Upsert | Current provider health + circuit breaker |
| `provider_health_probes` | Append-only | Historical probe results |
| `liquidity_recommendations` | Mutable | Open/resolved liquidity gap recommendations |
| `system_treasury_accounts` | Config | System wallet address registry |

---

## 5. API Reference

All routes require `requireAdmin` middleware. Base path: `/api/admin/treasury`

### Dashboard
| Method | Path | Description |
|---|---|---|
| GET | `/dashboard` | Full dashboard payload |
| GET | `/summary` | Quick header summary |
| GET | `/metrics` | Observability metrics |

### Reserves
| Method | Path | Description |
|---|---|---|
| GET | `/reserves` | Latest reserve ratios (all currencies) |
| GET | `/reserves/:currency/history?hours=24` | Historical ratio time-series |

### Provider Balances
| Method | Path | Description |
|---|---|---|
| GET | `/balances` | All synced provider balances |
| GET | `/balances/:provider/:currency/snapshots` | Snapshot history |
| POST | `/sync` | Trigger manual sync |

### Provider Health
| Method | Path | Description |
|---|---|---|
| GET | `/providers/health` | All provider statuses and circuit breakers |
| GET | `/providers/:provider/probes` | Probe history |

### Settlements
| Method | Path | Description |
|---|---|---|
| GET | `/settlements?stage=&currency=` | List settlements |
| GET | `/settlements/:id` | Detail with full transition history |

### Treasury Transfers
| Method | Path | Description |
|---|---|---|
| GET | `/transfers` | List all transfers |
| POST | `/transfers` | Request new inter-provider transfer |
| POST | `/transfers/:id/approve` | Approve (blocked if requester = approver) |
| POST | `/transfers/:id/cancel` | Cancel |

### Liquidity
| Method | Path | Description |
|---|---|---|
| GET | `/liquidity` | Liquidity report for all currencies |
| GET | `/liquidity/recommendations` | Open recommendations |

### FX
| Method | Path | Description |
|---|---|---|
| GET | `/fx/exposure` | Today's currency pair exposure + daily P&L |
| GET | `/fx/trades?limit=50` | Recent FX trades |

### Audit
| Method | Path | Description |
|---|---|---|
| GET | `/audit?event_type=&currency=` | Query audit events |
| GET | `/audit/chain?limit=200` | Verify hash chain integrity |

---

## 6. Reserve Ratio Formula

```
Reserve Ratio (%) = (External Available Balance / Net User Liability) × 100

External Available = SUM(treasury_provider_balances.available_balance)
                     WHERE currency = X AND sync_status = 'SUCCESS'

Net User Liability = SUM(wallets_v6.balance)
                     WHERE currency = X AND network != 'SYSTEM'

⚠️  CRITICAL: SYSTEM wallets (network = 'SYSTEM') are EXCLUDED from liabilities.
    Including them would falsely inflate the liability sum.
```

Default alert thresholds (configurable per currency in `reserve_thresholds`):

| Level | Default Trigger | Action |
|---|---|---|
| INFO | < 110% | Dashboard indicator only |
| WARN | < 105% | Dashboard + admin email |
| CRITICAL | < 100% | Email + withdrawals set to DEGRADED |
| FREEZE | 3 consecutive CRITICAL cycles | Withdrawals FROZEN |

---

## 7. Settlement Lifecycle

```
INITIATED
    │
    ▼
PROVIDER_PENDING   ──(failure)──▶ FAILED
    │
    ▼
PROVIDER_CONFIRMED ──(chargeback)──▶ REVERSED
    │
    ▼
LEDGER_POSTED
    │
    ▼
TREASURY_VERIFIED  ← checks reserve ratio (non-blocking warning)
    │
    ▼
SETTLED
    │
    ▼
ARCHIVED
```

Stage transitions are:
- **Forward-only** — no stage may be skipped
- **Immutably recorded** in `settlement_transitions`
- **Audited** in `treasury_audit_log`

---

## 8. Circuit Breaker States

```
          ┌─────────────────────────────┐
          │           CLOSED            │  ← Normal operation
          │  (provider in GatewayRouter)│
          └──────────────┬──────────────┘
                         │ N consecutive failures
                         ▼
          ┌─────────────────────────────┐
          │            OPEN             │  ← Provider excluded from routing
          │ (removed from GatewayRouter)│
          └──────────────┬──────────────┘
                         │ After 30s
                         ▼
          ┌─────────────────────────────┐
          │         HALF_OPEN           │  ← One probe attempt
          │  (DEGRADED in GatewayRouter)│
          └──────┬───────────┬──────────┘
                 │ Success   │ Failure
                 ▼           ▼
            CLOSED         OPEN
```

`N` = `FAILURE_THRESHOLD` (default: 5, set in `ProviderHealthEngine.js`).

---

## 9. FX Trade Recording

`FXTreasuryEngine.recordTrade()` must be called **after** `execute_swap_v6` completes successfully. It is **fire-and-forget** — failure does not affect the swap result.

```javascript
// After execute_swap_v6 RPC succeeds:
FXTreasuryEngine.recordTrade({
  transactionId:   tx.id,
  fromCurrency:    'NGN',
  toCurrency:      'USD',
  fromAmount:      100000,
  toAmount:        62.50,
  feeAmount:       4700,
  executionRate:   1600,
  marketRate:      1598,
  rateSource:      'coingecko',
  rateConfidence:  0.98,
  rateMode:        'LIVE',
  priceAgeSeconds: 12,
}).catch(() => {}); // Never await — never block swap
```

---

## 10. Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `TREASURY_SYNC_INTERVAL_MS` | `300000` (5m) | Provider balance sync interval |
| `AGG_RECON_INTERVAL_MS` | `900000` (15m) | Aggregate reconciliation interval |
| `PROVIDER_PROBE_INTERVAL_MS` | `60000` (1m) | Provider health probe interval |
| `LIQUIDITY_INTERVAL_MS` | `600000` (10m) | Liquidity forecast interval |
| `AGG_RECON_TOLERANCE` | `0.5` | Reconciliation discrepancy tolerance (%) |
| `GREY_API_KEY` | — | Grey provider API key (optional) |
| `GREY_API_URL` | `https://api.grey.co` | Grey API base URL |

---

## 11. Backward Compatibility Guarantee

The following existing components were **not modified** by this upgrade:

- `LedgerService.js` — unchanged
- `execute_ledger_transaction_v6` RPC — unchanged
- `FiatWalletService.js` — unchanged
- `CryptoWalletService.js` — unchanged
- `PaymentOrchestrator.js` — unchanged
- `GatewayRouter.js` — only `setHealth()` called externally (existing method)
- `ReconciliationWorker.js` — unchanged (new AggregateReconciliationWorker is additive)
- All existing routes and controllers — unchanged
- All existing database migrations — unchanged
- All existing worker schedules — unchanged

The only changes to existing files were:
1. `server/routes/admin.js` — 5 lines added to mount `/treasury` sub-router
2. `server/index.js` — 8 lines added to import and start 4 new workers
