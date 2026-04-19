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
        const valuation = wallet.balance * rate;
        
        // Final Execution Guard: Stale prices block financial actions
        const canExecute = mode === ValuationMode.FRESH && !wallet.is_frozen;

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
        let systemStale = false;

        const walletViews = wallets.map(wallet => {
            const meta = rateMetadata[wallet.asset] || { mode: ValuationMode.INVALID, canExecute: false };
            const rate = rates[wallet.asset] || 0;
            
            if (meta.mode !== ValuationMode.FRESH) systemStale = true;

            const view = this.computeWalletView(wallet, rate, meta.mode);
            
            // Aggregation Invariant: Total is Sum(Holdings * Price)
            const usdValue = wallet.balance * rate;
            const usdAvail = wallet.available * rate;
            
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
