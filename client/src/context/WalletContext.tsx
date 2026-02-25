import React, { createContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseSafe';
import { walletApi } from '../lib/walletApi';
import type { Wallet, Transaction, InternalTransferRequest, WithdrawalRequest, CommissionSettings } from '@/types/wallet';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

export interface WalletContextValue {
    wallets: Wallet[];
    transactions: Transaction[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    createWallet: (currency: string) => Promise<Wallet>;
    sendFunds: (data: InternalTransferRequest) => Promise<void>;
    withdraw: (data: WithdrawalRequest) => Promise<void>;
    getCommissionRate: (type: string, currency: string) => Promise<CommissionSettings[]>;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, profile, authReady } = useAuth();
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchingRef = useRef(false);

    const fetchData = useCallback(async () => {
        if (!user || !profile || !authReady) return;
        if (fetchingRef.current) return;
        
        fetchingRef.current = true;
        setLoading(true);
        setError(null);

        try {
            const [walletsData, transactionsData] = await Promise.all([
                walletApi.getWallets(),
                walletApi.getTransactions()
            ]);

            setWallets(walletsData);
            setTransactions(transactionsData);
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
                        const newTx = payload.new as any;
                        const oldTx = payload.old as any;

                        if (oldTx.status === 'PENDING' && newTx.status === 'COMPLETED') {
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

    const createWallet = async (currency: string) => {
        try {
            const wallet = await walletApi.createWallet(currency);
            await fetchData();
            return wallet;
        } catch (err: unknown) {
            console.error('Create wallet error:', err);
            const message = err instanceof Error ? err.message : 'Failed to create wallet';
            toast.error(message);
            throw err;
        }
    };

    const sendFunds = async (data: InternalTransferRequest) => {
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
            toast.success(`Successfully withdrew ${data.amount} ${data.currency}`);
            await fetchData();
        } catch (err: unknown) {
            console.error('Withdraw error:', err);
            const message = err instanceof Error ? err.message : 'Failed to withdraw funds';
            toast.error(message);
            throw err;
        }
    };

    const getCommissionRate = async (type: string, currency: string) => {
        return walletApi.getCommissionRate(type, currency);
    };

    return (
        <WalletContext.Provider value={{ wallets, transactions, loading, error, refresh: fetchData, createWallet, sendFunds, withdraw, getCommissionRate }}>
            {children}
        </WalletContext.Provider>
    );
};
