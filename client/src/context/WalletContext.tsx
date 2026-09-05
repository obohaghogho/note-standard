import React, { createContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseSafe';
import { v4 as uuidv4 } from 'uuid';
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
    createWallet: (currency: string, network?: string) => Promise<Record<string, unknown>>;
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
    const lastUserIdRef = useRef<string | null>(null);

    // Derived State: The Valuation Singleton DTO
    const financialView = useMemo(() => {
        return FinancialViewService.computeGlobalView(wallets, rates, rateMeta, evaluationId, frozenAssets, regime);
    }, [wallets, rates, rateMeta, evaluationId, frozenAssets, regime]);

    const fetchData = useCallback(async (isSilent = false) => {
        if (!user || !profile || !authReady) return;
        if (fetchingRef.current) return;
        
        fetchingRef.current = true;
        // Only trigger full skeleton loading if explicitly not silent AND we have no existing wallet data
        if (!isSilent && wallets.length === 0) {
            setLoading(true);
        }
        setError(null);

        const currentFetchUserId = user.id;

        try {
            // 1. Fetch Core Data (High Priority)
            const [walletsData, transactionsData] = await Promise.all([
                walletApi.getWallets(),
                walletApi.getTransactions()
            ]);

            // Identity verification guard: Discard response if active user changed during fetch
            if (user.id !== currentFetchUserId) {
                console.warn('[Wallet] User identity changed during fetch — discarding stale wallet response');
                return;
            }

            // Map raw wallets to Unified Balance Model (WalletEntry)
            const rawWallets = Array.isArray(walletsData) ? walletsData : [];
            const mappedWallets: WalletEntry[] = (rawWallets as Array<Record<string, unknown>>).map((w) => ({
                id: w.id as string,
                asset: w.currency as string,
                type: w.provider === 'nowpayments' ? 'external' : 'custodial',
                balance: Math.max(0, Number(w.balance) || 0),
                available: Math.max(0, Number(w.available_balance != null ? w.available_balance : w.balance) || 0),
                locked: Math.max(0, (Number(w.balance) || 0) - (Number(w.available_balance != null ? w.available_balance : w.balance) || 0)),
                source: w.provider === 'nowpayments' ? 'external_provider' : 'internal_ledger',
                network: w.network as string,
                address: w.address as string,
                is_frozen: w.is_frozen as boolean,
                provider: w.provider as string
            }));

            // Only update wallets if values actually changed to preserve reference identity
            setWallets(prev => {
                const prevStr = JSON.stringify(prev);
                const nextStr = JSON.stringify(mappedWallets);
                return prevStr === nextStr ? prev : mappedWallets;
            });

            const newTxs = Array.isArray(transactionsData?.transactions) ? transactionsData.transactions : [];
            setTransactions(prev => {
                const prevStr = JSON.stringify(prev);
                const nextStr = JSON.stringify(newTxs);
                return prevStr === nextStr ? prev : newTxs;
            });

            // 2. Clear initial loading state once core data is ready
            setLoading(false);

            // 3. Fetch Rates (Secondary Priority - Non-blocking)
            try {
                const ratesData = await walletApi.getExchangeRates();
                if (ratesData?.rates) {
                    setRates(ratesData.rates);
                    setRateMeta(ratesData.metadata || {});
                    setEvaluationId(ratesData.evaluationId);
                    setFrozenAssets(ratesData.frozenAssets);
                    
                    const firstMeta = Object.values(ratesData.metadata || {})[0] as Record<string, unknown> | undefined;
                    setRegime(firstMeta?.regime as string);
                } else if (typeof ratesData === 'object') {
                    setRates(ratesData as unknown as Record<string, number>);
                }
            } catch (rateErr) {
                console.warn('Failed to fetch latest rates, using LKG (if any):', rateErr);
            }
        } catch (err) {
            console.warn('Wallet data fetch warning (server initializing):', err instanceof Error ? err.message : String(err));
            setError(err instanceof Error ? err.message : 'Failed to load wallet data');
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, [user?.id, profile?.id, authReady, wallets.length]);


    // Initial Load & Financial Data Isolation on Account Switch
    useEffect(() => {
        const handleAccountSwitch = () => {
            console.log('[WalletContext] Account switch event detected — immediately resetting wallet state');
            setWallets([]);
            setTransactions([]);
            setLoading(true);
            fetchingRef.current = false;
            lastUserIdRef.current = null;
        };

        window.addEventListener('account-switched', handleAccountSwitch);

        if (authReady && user && profile) {
            // Financial Data Isolation: Only flush state when user ID actually changes
            if (lastUserIdRef.current !== user.id) {
                lastUserIdRef.current = user.id;
                setWallets([]);
                setTransactions([]);
                setLoading(true);
                fetchingRef.current = false;
                fetchData(false); // Non-silent for initial load
            } else {
                fetchData(true); // Silent refresh if same user
            }
        } else if (authReady && (!user || !profile)) {
            setWallets([]);
            setTransactions([]);
            setLoading(false);
            lastUserIdRef.current = null;
        }

        return () => window.removeEventListener('account-switched', handleAccountSwitch);
    }, [user?.id, profile?.id, authReady, fetchData]);

    // Real-time Updates (Listen to ledger and transaction changes)
    useEffect(() => {
        if (!user) return;

        // 1. Listen to wallet_store changes (Balance Source of Truth)
        const ledgerChannel = supabase.channel(`wallets_realtime:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'wallets_store',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('Wallet balance updated (Sovereign Ledger sync):', payload.eventType);
                    fetchData(true); // Silent sync
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
                    fetchData(true); // Silent sync
                    
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
                        const newTx = payload.new as Partial<{ amount?: number; currency?: string; display_label?: string; }>;
                        toast(`Processing incoming deposit...`, { 
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

        // 3. Automatic Background Sync Interval (Every 15 seconds when tab is active)
        const autoSyncInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && !fetchingRef.current) {
                fetchData(true); // Silent background sync
            }
        }, 15000);

        return () => {
            clearInterval(autoSyncInterval);
            supabase.removeChannel(ledgerChannel);
            supabase.removeChannel(txChannel);
        };
    }, [user, fetchData]);

    // Socket.io Real-time
    useEffect(() => {
        if (!socket || !connected) return;

        const onBalanceUpdated = (data: unknown) => {
            console.log('[WalletContext] Balance update via Socket:', data);
            fetchData(true); // Silent sync
        };

        const onNotification = (data: RealtimeNotification) => {
            const t = String(data.type || '').toLowerCase();
            if (
                t === 'payment_success' || 
                t === 'wallet_update' || 
                t === 'wallet_deposit' || 
                t === 'deposit' || 
                t === 'withdrawal_completed' || 
                t === 'transaction_confirmed'
            ) {
                console.log('[WalletContext] Triggering silent wallet refresh for notification type:', data.type);
                fetchData(true); // Silent sync
            }
        };

        socket.on('balance_updated', onBalanceUpdated);
        socket.on('wallet_update', onBalanceUpdated);
        socket.on('wallet_credited', onBalanceUpdated);
        socket.on('notification', onNotification);

        return () => {
            socket.off('balance_updated', onBalanceUpdated);
            socket.off('wallet_update', onBalanceUpdated);
            socket.off('wallet_credited', onBalanceUpdated);
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
            // Generate idempotency key if not provided (Institutional Standard: UUID v4)
            const idempotencyKey = data.idempotencyKey || uuidv4();
            await walletApi.internalTransfer({ ...data, idempotencyKey });
            toast.success(`Successfully sent ${data.amount} ${data.currency}`);
            
            // Immediate balance synchronization: Reset fetching guard and re-fetch core balances
            fetchingRef.current = false;
            await fetchData();
        } catch (err: unknown) {
            console.error('Send funds error:', err);
            const message = err instanceof Error ? err.message : 'Failed to send funds';
            toast.error(message);
            throw err;
        }
    };

    const withdraw = async (data: WithdrawalRequest) => {
        try {
            // Generate idempotency key if not provided (Institutional Standard: UUID v4)
            const idempotencyKey = data.idempotencyKey || uuidv4();
            const res = await walletApi.withdraw({ ...data, idempotencyKey });
            if (!res?.otpRequired && res?.status !== 'OTP_REQUIRED') {
                toast.success(`Withdrawal request submitted for ${data.amount} ${data.currency}`);
            }
            fetchingRef.current = false;
            await fetchData();
            return res;
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

export { useWallet } from '../hooks/useWallet';
