import React, { useState, useEffect } from 'react';
import { X, Copy, Share2, AlertTriangle, CheckCircle2, QrCode, Loader2 } from 'lucide-react';
import { Button } from '../common/Button';
import { useWallet } from '../../hooks/useWallet';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { walletApi } from '../../api/walletApi';
import { motion, AnimatePresence } from 'framer-motion';

interface ReceiveModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialCurrency?: string;
    initialNetwork?: string;
}

export const ReceiveModal: React.FC<ReceiveModalProps> = ({ isOpen, onClose, initialCurrency = 'BTC', initialNetwork = 'native' }) => {
    const { wallets, createWallet, loading: walletLoading } = useWallet();
    const [selectedCurrency, setSelectedCurrency] = useState(initialCurrency);
    const [selectedNetwork, setSelectedNetwork] = useState(initialNetwork);
    const [copied, setCopied] = useState(false);
    const [hdAddress, setHdAddress] = useState<string | null>(null);
    const [hdLoading, setHdLoading] = useState(false);

    // Filter only crypto wallets for receiving (assuming fiat deposits are handled in FundModal)
    const currentWallet = wallets.find(w => w.currency === selectedCurrency && w.network === selectedNetwork);
    const displayAddress = hdAddress || currentWallet?.address || '';

    useEffect(() => {
        if (isOpen) {
            setSelectedCurrency(initialCurrency);
            setSelectedNetwork(initialNetwork);
            fetchCurrentHdAddress(initialCurrency, initialNetwork);
        }
    }, [isOpen, initialCurrency, initialNetwork]);

    const fetchCurrentHdAddress = async (asset: string, network: string) => {
        if (['BTC', 'ETH', 'USDT', 'USDC'].includes(asset)) {
            try {
                setHdLoading(true);
                const result = await walletApi.getCurrentAddress(asset, network);
                setHdAddress(result.address);
            } catch (error) {
                console.error('Failed to fetch HD address:', error);
            } finally {
                setHdLoading(false);
            }
        } else {
            setHdAddress(null);
        }
    };

    const handleGenerateNew = async () => {
        if (!['BTC', 'ETH', 'USDT', 'USDC'].includes(selectedCurrency)) return;
        
        try {
            setHdLoading(true);
            const result = await walletApi.generateNewAddress(selectedCurrency, selectedNetwork);
            setHdAddress(result.address);
            toast.success('New address generated');
        } catch (error: any) {
            toast.error(error.message || 'Failed to generate new address');
        } finally {
            setHdLoading(false);
        }
    };

    const handleCopy = () => {
        if (displayAddress) {
            navigator.clipboard.writeText(displayAddress);
            setCopied(true);
            toast.success('Address copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleShare = async () => {
        if (displayAddress && navigator.share) {
            try {
                await navigator.share({
                    title: `Receive ${selectedCurrency}`,
                    text: `My ${selectedCurrency} address: ${displayAddress}`,
                });
            } catch (err) {
                console.error('Share failed:', err);
            }
        } else {
             handleCopy();
        }
    };
    
    // Auto-create wallet if it doesn't exist for selected currency/network
    const handleCurrencyChange = async (currency: string, network: string) => {
        setSelectedCurrency(currency);
        setSelectedNetwork(network);
        fetchCurrentHdAddress(currency, network);
        const exists = wallets.find(w => w.currency === currency && w.network === network);
        if (!exists) {
            try {
                toast.loading(`Creating ${currency} ${network !== 'native' ? `(${network})` : ''} wallet...`, { id: 'create-wallet' });
                await createWallet(currency, network);
                toast.success(`${currency} wallet ready`, { id: 'create-wallet' });
            } catch (error) {
                toast.error(`Failed to create ${currency} wallet`, { id: 'create-wallet' });
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="modal-content"
            >
                <button onClick={onClose} className="modal-close">
                    <X size={20} />
                </button>

                <h2 className="modal-header">
                    <QrCode className="text-purple-500" size={24} />
                    Receive Assets
                </h2>

                <div className="modal-body">
                    {/* Currency Selector */}
                    <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
                        {wallets.filter(w => ['BTC', 'ETH', 'USDT', 'USDC'].includes(w.currency)).map(w => (
                            <button
                                key={`${w.currency}_${w.network}`}
                                onClick={() => handleCurrencyChange(w.currency, w.network)}
                                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all whitespace-nowrap flex flex-col items-center ${
                                    selectedCurrency === w.currency && selectedNetwork === w.network
                                    ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20' 
                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white'
                                }`}
                            >
                                <span>{w.currency}</span>
                                {w.network !== 'native' && <span className="text-[10px] opacity-70 uppercase">{w.network}</span>}
                            </button>
                        ))}
                    </div>

                    <AnimatePresence mode="wait">
                        {currentWallet || hdAddress ? (
                            <motion.div 
                                key={selectedCurrency}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-6"
                            >
                                {/* QR Code Card */}
                                <div className="bg-white p-6 rounded-2xl mx-auto w-max shadow-xl ring-4 ring-white/10 relative">
                                    {hdLoading ? (
                                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-2xl backdrop-blur-sm z-10">
                                             <Loader2 className="animate-spin text-purple-600" size={40} />
                                        </div>
                                    ) : null}
                                    <QRCodeSVG 
                                        value={displayAddress} 
                                        size={200}
                                        level="H"
                                        includeMargin={false}
                                    />
                                </div>

                                {/* Address Display */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-end ml-1">
                                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Your {selectedCurrency} {selectedNetwork !== 'native' ? `(${selectedNetwork})` : ''} Address
                                        </label>
                                        {['BTC', 'ETH', 'USDT', 'USDC'].includes(selectedCurrency) && (
                                            <button 
                                                onClick={handleGenerateNew}
                                                disabled={hdLoading}
                                                className="text-[10px] text-purple-400 hover:text-purple-300 font-bold uppercase tracking-tighter transition-colors disabled:opacity-50"
                                            >
                                                {hdLoading ? 'Generating...' : 'Regenerate New'}
                                            </button>
                                        )}
                                    </div>
                                    <div 
                                        onClick={handleCopy}
                                        className="group relative bg-gray-800/50 border border-gray-700/50 hover:border-purple-500/50 rounded-xl p-4 cursor-pointer transition-all active:scale-[0.99]"
                                    >
                                        <p className="font-mono text-sm text-gray-300 break-all text-center select-all">
                                            {hdLoading ? '••••••••••••••••••••••••••••••••••••' : displayAddress}
                                        </p>
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl backdrop-blur-[1px]">
                                            <span className="text-white font-medium flex items-center gap-2">
                                                <Copy size={16} /> Click to Copy
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="grid grid-cols-2 gap-3">
                                    <Button 
                                        onClick={handleCopy} 
                                        variant="secondary" 
                                        className={copied ? "bg-green-500/20 text-green-400 border-green-500/50" : ""}
                                    >
                                        {copied ? <CheckCircle2 size={18} className="mr-2" /> : <Copy size={18} className="mr-2" />}
                                        {copied ? 'Copied' : 'Copy'}
                                    </Button>
                                    <Button onClick={handleShare} variant="outline">
                                        <Share2 size={18} className="mr-2" />
                                        Share
                                    </Button>
                                </div>

                                {/* Security Notice */}
                                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex gap-3 text-orange-200/90 text-sm">
                                    <AlertTriangle size={20} className="shrink-0 text-orange-500" />
                                    <div>
                                        <p className="font-bold text-orange-400 mb-1">Send only {selectedCurrency} to this address.</p>
                                        <p className="text-xs opacity-80 leading-relaxed">
                                            Sending any other asset to this address may result in the permanent loss of your funds. Ensure you are on the correct network.
                                        </p>
                                    </div>
                                </div>

                            </motion.div>
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
                                    {walletLoading ? (
                                        <Loader2 className="animate-spin text-purple-500" size={32} />
                                    ) : (
                                        <AlertTriangle className="text-gray-500" size={32} />
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">
                                        {walletLoading ? 'Creating Wallet...' : 'Wallet Not Found'}
                                    </h3>
                                    <p className="text-gray-400 text-sm mt-1 max-w-xs mx-auto">
                                        {walletLoading 
                                            ? `Setting up your secure ${selectedCurrency} address.` 
                                            : `You don't have a ${selectedCurrency} wallet yet.`}
                                    </p>
                                </div>
                                {!walletLoading && (
                                    <Button onClick={() => handleCurrencyChange(selectedCurrency, selectedNetwork)} className="bg-purple-600 hover:bg-purple-500">
                                        Create {selectedCurrency} Wallet
                                    </Button>
                                )}
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};
