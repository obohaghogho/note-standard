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

    // Real-time Updates (Listen to wallet balance changes)
    useEffect(() => {
        if (!user) return;

        const channel = supabase.channel(`wallet_updates:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'wallets',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('Wallet update:', payload);
                    // Refresh data on any wallet change
                    fetchData();
                    if (payload.eventType === 'UPDATE') {
                        toast('Wallet balance updated!', { icon: '💰' });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
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
            await walletApi.internalTransfer(data);
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
            await walletApi.withdraw(data);
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
