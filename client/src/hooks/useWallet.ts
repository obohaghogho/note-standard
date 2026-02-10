import { useContext } from 'react';
import { WalletContext, type WalletContextValue } from '../context/WalletContext';

export const useWallet = (): WalletContextValue => {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
};
