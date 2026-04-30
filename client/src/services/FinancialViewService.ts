import type { WalletEntry, WalletViewDTO, GlobalViewDTO } from '@/types/wallet';
import { ValuationMode } from '@/types/wallet';
import { formatCurrency } from '../lib/CurrencyFormatter';

/**
 * Financial View Service (Hardened v5.4)
 * The sole "Valuation Singleton" for the application.
 * Enforces absolute separation between Holdings (Truth) and Valuation (Display).
 */
export const FinancialViewService = {
    /**
     * Internal: Formats a number to string with deterministic rounding.
     */
    format(amount: number, currency: string): string {
        return formatCurrency(amount, currency);
    },

    /**
     * Compute a single WalletViewDTO from raw data.
     * This is the only place valuation math (Holdings * Price) is permitted.
     */
    computeWalletView(
        wallet: WalletEntry, 
        rate: number, 
        mode: ValuationMode = ValuationMode.FRESH
    ): WalletViewDTO {
        // Valuation Layer (Layer C): Derived only, never stored.
        const valuation = rate > 0 ? wallet.balance * rate : 0;
        
        // Execution gate: FRESH and STALE are both executable.
        // Only INVALID (feed down >2h) is a hard block.
        const canExecute = mode !== ValuationMode.INVALID && !wallet.is_frozen;

        return {
            id: wallet.id,
            type: wallet.type,
            asset: wallet.asset,
            balance: this.format(wallet.balance, wallet.asset),
            available: this.format(wallet.available, wallet.asset),
            valuationUsd: this.format(valuation, 'USD'),
            mode,
            canExecute,
            network: wallet.network,
            address: wallet.address,
            isFrozen: wallet.is_frozen
        };
    },

    /**
     * Compute the global financial state for the dashboard.
     */
    computeGlobalView(
        wallets: WalletEntry[], 
        rates: Record<string, number>, 
        rateMetadata: Record<string, { mode: ValuationMode; canExecute: boolean; regime?: string }>,
        evaluationId?: string,
        frozenAssets?: string[],
        regime?: string
    ): GlobalViewDTO {
        let totalValuation = 0;
        let totalAvailable = 0;
        // systemStale: true only when ANY asset feed is completely INVALID (>2h stale).
        // STALE mode (within the 2h LKG window) is still executable — do NOT block on it.
        let systemStale = false;

        const walletViews = wallets.map(wallet => {
            // Default to STALE (not INVALID) so wallets during initial load
            // don't pre-emptively show as non-executable before rates arrive.
            const meta = rateMetadata[wallet.asset] || { mode: ValuationMode.STALE, canExecute: true };
            const rate = rates[wallet.asset] || 0;
            
            // Only flag systemStale when the feed is truly down (INVALID = >2h stale).
            // STALE is within the acceptable LKG window and should not block user actions.
            if (meta.mode === ValuationMode.INVALID) systemStale = true;

            const view = this.computeWalletView(wallet, rate, meta.mode);
            
            // Aggregation Invariant: Total is Sum(Holdings * Price)
            const usdValue = rate > 0 ? wallet.balance * rate : 0;
            const usdAvail = rate > 0 ? wallet.available * rate : 0;
            
            totalValuation += usdValue;
            totalAvailable += usdAvail;

            return { ...view, evaluationId };
        });

        return {
            totalBalanceValuation: this.format(totalValuation, 'USD'),
            totalAvailableValuation: this.format(totalAvailable, 'USD'),
            wallets: walletViews,
            ratesReady: Object.keys(rates).length > 0,
            systemStale,
            evaluationId,
            frozenAssets,
            regime
        };
    }
};

export default FinancialViewService;
