import React, { createContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseSafe';
import walletApi from '../api/walletApi';
import type { 
    WalletEntry, 
    Transaction, 
    InternalTransferRequest, 
    WithdrawalRequest, 
    CommissionSettings,
    GlobalViewDTO,
    ValuationMode 
} from '@/types/wallet';
import { FinancialViewService } from '../services/FinancialViewService';
import { useAuth } from './AuthContext';
import { useSocket, type RealtimeNotification } from './SocketContext';
import toast from 'react-hot-toast';

export interface WalletContextValue {
    wallets: WalletEntry[];
    financialView: GlobalViewDTO;
    transactions: Transaction[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    createWallet: (currency: string, network?: string) => Promise<any>;
    sendFunds: (data: InternalTransferRequest) => Promise<void>;
    withdraw: (data: WithdrawalRequest) => Promise<void>;
    getCommissionRate: (type: 'swap' | 'withdrawal' | 'deposit', currency: string) => Promise<CommissionSettings[]>;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, profile, authReady } = useAuth();
    const { socket, connected } = useSocket();
    
    // Internal State: Raw Holdings & Rates Metadata
    const [wallets, setWallets] = useState<WalletEntry[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [rates, setRates] = useState<Record<string, number>>({});
    const [rateMeta, setRateMeta] = useState<Record<string, { mode: ValuationMode; canExecute: boolean }>>({});
    const [evaluationId, setEvaluationId] = useState<string | undefined>(undefined);
    const [frozenAssets, setFrozenAssets] = useState<string[] | undefined>(undefined);
    const [regime, setRegime] = useState<string | undefined>(undefined);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchingRef = useRef(false);

    // Derived State: The Valuation Singleton DTO
    const financialView = useMemo(() => {
        return FinancialViewService.computeGlobalView(wallets, rates, rateMeta, evaluationId, frozenAssets, regime);
    }, [wallets, rates, rateMeta, evaluationId, frozenAssets, regime]);

    const fetchData = useCallback(async () => {
        if (!user || !profile || !authReady) return;
        if (fetchingRef.current) return;
        
        fetchingRef.current = true;
        setLoading(true);
        setError(null);

        try {
            const [walletsData, transactionsData, ratesData] = await Promise.all([
                walletApi.getWallets(),
                walletApi.getTransactions(),
                walletApi.getExchangeRates()
            ]);

            // Map raw wallets to Unified Balance Model (WalletEntry)
            const rawWallets = Array.isArray(walletsData) ? walletsData : [];
            const mappedWallets: WalletEntry[] = rawWallets.map((w: any) => ({
                id: w.id,
                asset: w.currency,
                type: w.provider === 'nowpayments' ? 'external' : 'custodial',
                balance: w.balance,
                available: w.available_balance ?? w.balance,
                locked: (w.balance - (w.available_balance ?? w.balance)),
                source: w.provider === 'nowpayments' ? 'external_provider' : 'internal_ledger',
                network: w.network,
                address: w.address,
                is_frozen: w.is_frozen,
                provider: w.provider
            }));

            setWallets(mappedWallets);
            setTransactions(Array.isArray(transactionsData?.transactions) ? transactionsData.transactions : []);
            
            // Handle Rates & Metadata (Phase 3 Regime Aware)
            if (ratesData?.rates) {
                setRates(ratesData.rates);
                setRateMeta(ratesData.metadata || {});
                setEvaluationId(ratesData.evaluationId);
                setFrozenAssets(ratesData.frozenAssets);
                
                // Extract regime from any metadata entry (global signal)
                const firstMeta = Object.values(ratesData.metadata || {})[0] as any;
                setRegime(firstMeta?.regime);
            } else if (typeof ratesData === 'object') {
                // Compatibility for old simple rate objects
                setRates(ratesData as unknown as Record<string, number>);
            }
        } catch (err) {
            console.error('Error fetching wallet data:', err);
            setError(err instanceof Error ? err.message : 'Failed to load wallet data');
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, [user, profile, authReady]);


    // Initial Load
    useEffect(() => {
        if (authReady && user && profile) {
            fetchData();
        } else if (authReady && (!user || !profile)) {
            setWallets([]);
            setTransactions([]);
            setLoading(false);
        }
    }, [user, profile, authReady, fetchData]);

    // Real-time Updates (Listen to ledger and transaction changes)
    useEffect(() => {
        if (!user) return;

        // 1. Listen to Ledger Entries (Balance Source of Truth)
        const ledgerChannel = supabase.channel(`ledger_realtime:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'ledger_entries',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('Ledger update received (Balance Refresh):', payload.eventType);
                    fetchData(); // Recalculate balances
                }
            )
            .subscribe();

        // 2. Listen to Transactions (History Source of Truth)
        const txChannel = supabase.channel(`tx_realtime:${user.id}`)
             .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'transactions',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('Transaction update received:', payload.eventType);
                    fetchData(); // Refresh history and redundant balance check
                    
                    // Live Status Notifications
                    if (payload.eventType === 'UPDATE') {
                        const newTx = payload.new as Partial<{ status: string; display_label?: string; metadata?: Record<string, string>; }>;
                        const oldTx = payload.old as Partial<{ status: string }>;

                        if (oldTx.status === 'PENDING' && (newTx.status === 'COMPLETED' || newTx.status === 'SUCCESSFUL')) {
                            toast.success(`${newTx.display_label || 'Transaction'} confirmed!`, { 
                                duration: 5000,
                                icon: '🟢',
                                style: {
                                    background: '#064e3b',
                                    color: '#ecfdf5',
                                    borderRadius: '12px',
                                    border: '1px solid #059669'
                                }
                            });
                        } else if (newTx.status === 'FAILED') {
                            toast.error(`Transaction failed: ${newTx.metadata?.failReason || 'Unknown error'}`, {
                                icon: '🔴'
                            });
                        }
                    }
                    
                    if (payload.eventType === 'INSERT') {
                        toast('New transaction initiated', { 
                            icon: '🟡',
                            style: {
                                background: '#451a03',
                                color: '#fef3c7',
                                borderRadius: '12px'
                            }
                        });
                    }
                }
             )
             .subscribe();

        return () => {
            supabase.removeChannel(ledgerChannel);
            supabase.removeChannel(txChannel);
        };
    }, [user, fetchData]);

    // Socket.io Real-time
    useEffect(() => {
        if (!socket || !connected) return;

        const onBalanceUpdated = (data: BalanceUpdate) => {
            console.log('[WalletContext] Balance update via Socket:', data);
            fetchData();
        };

        const onNotification = (data: RealtimeNotification) => {
            if (data.type === 'payment_success' || data.type === 'wallet_update') {
                fetchData();
            }
        };

        socket.on('balance_updated', onBalanceUpdated);
        socket.on('notification', onNotification);

        return () => {
            socket.off('balance_updated', onBalanceUpdated);
            socket.off('notification', onNotification);
        };
    }, [socket, connected, fetchData]);

    const createWallet = async (currency: string, network: string = 'native') => {
        try {
            const wallet = await walletApi.createWallet(currency, network);
            await fetchData();
            return wallet;
        } catch (err: unknown) {
            console.error('Create wallet error:', err);
            const message = err instanceof Error ? err.message : 'Failed to create wallet';
            toast.error(message);
            throw err;
        }
    };

    const sendFunds = async (data: InternalTransferRequest & { captchaToken?: string }) => {
        try {
            // Generate idempotency key if not provided
            const idempotencyKey = data.idempotencyKey || `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await walletApi.internalTransfer({ ...data, idempotencyKey });
            toast.success(`Successfully sent ${data.amount} ${data.currency}`);
            await fetchData(); // Refresh balances immediately
        } catch (err: unknown) {
            console.error('Send funds error:', err);
            const message = err instanceof Error ? err.message : 'Failed to send funds';
            toast.error(message);
            throw err;
        }
    };

    const withdraw = async (data: WithdrawalRequest) => {
        try {
            // Generate idempotency key if not provided
            const idempotencyKey = data.idempotencyKey || `withdraw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await walletApi.withdraw({ ...data, idempotencyKey });
            toast.success(`Withdrawal request submitted for ${data.amount} ${data.currency}`);
            await fetchData();
        } catch (err: unknown) {
            console.error('Withdraw error:', err);
            const message = err instanceof Error ? err.message : 'Failed to withdraw funds';
            toast.error(message);
            throw err;
        }
    };

    const getCommissionRate = async (type: 'swap' | 'withdrawal' | 'deposit', currency: string) => {
        return walletApi.getCommissionRate(type, currency);
    };

    return (
        <WalletContext.Provider value={{ wallets, financialView, transactions, loading, error, refresh: fetchData, createWallet, sendFunds, withdraw, getCommissionRate }}>
            {children}
        </WalletContext.Provider>
    );
};
