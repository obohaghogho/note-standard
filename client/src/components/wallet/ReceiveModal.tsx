import React, { useState, useEffect } from 'react';
import { X, Copy, Share2, AlertTriangle, CheckCircle2, QrCode, Loader2 } from 'lucide-react';
import { Button } from '../common/Button';
import { useWallet } from '../../hooks/useWallet';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface ReceiveModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialCurrency?: string;
}

export const ReceiveModal: React.FC<ReceiveModalProps> = ({ isOpen, onClose, initialCurrency = 'BTC' }) => {
    const { wallets, createWallet, loading: walletLoading } = useWallet();
    const [selectedCurrency, setSelectedCurrency] = useState(initialCurrency);
    const [copied, setCopied] = useState(false);

    // Filter only crypto wallets for receiving (assuming fiat deposits are handled in FundModal)
    // cryptoWallets variable removed as it was unused.
    const currentWallet = wallets.find(w => w.currency === selectedCurrency);

    useEffect(() => {
        if (isOpen && initialCurrency) {
            setSelectedCurrency(initialCurrency);
        }
    }, [isOpen, initialCurrency]);

    const handleCopy = () => {
        if (currentWallet?.address) {
            navigator.clipboard.writeText(currentWallet.address);
            setCopied(true);
            toast.success('Address copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleShare = async () => {
        if (currentWallet?.address && navigator.share) {
            try {
                await navigator.share({
                    title: `Receive ${selectedCurrency}`,
                    text: `My ${selectedCurrency} address: ${currentWallet.address}`,
                });
            } catch (err) {
                console.error('Share failed:', err);
            }
        } else {
             handleCopy();
        }
    };
    
    // Auto-create wallet if it doesn't exist for selected currency
    const handleCurrencyChange = async (currency: string) => {
        setSelectedCurrency(currency);
        const exists = wallets.find(w => w.currency === currency);
        if (!exists) {
            try {
                toast.loading(`Creating ${currency} wallet...`, { id: 'create-wallet' });
                await createWallet(currency);
                toast.success(`${currency} wallet ready`, { id: 'create-wallet' });
            } catch (error) {
                toast.error(`Failed to create ${currency} wallet`, { id: 'create-wallet' });
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-gray-900 border border-gray-800 rounded-2xl w-[95%] md:w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"

            >
                {/* Header */}
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <QrCode className="text-purple-500" size={24} />
                        Receive Assets
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {/* Currency Selector */}
                    <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
                        {['BTC', 'ETH', 'USDT', 'USDC'].map(curr => (
                            <button
                                key={curr}
                                onClick={() => handleCurrencyChange(curr)}
                                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all whitespace-nowrap ${
                                    selectedCurrency === curr 
                                    ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20' 
                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white'
                                }`}
                            >
                                {curr}
                            </button>
                        ))}
                    </div>

                    <AnimatePresence mode="wait">
                        {currentWallet ? (
                            <motion.div 
                                key={selectedCurrency}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-6"
                            >
                                {/* QR Code Card */}
                                <div className="bg-white p-6 rounded-2xl mx-auto w-max shadow-xl ring-4 ring-white/10">
                                    <QRCodeSVG 
                                        value={currentWallet.address} 
                                        size={200}
                                        level="H"
                                        includeMargin={false}
                                        imageSettings={{
                                            src: `/icons/${selectedCurrency.toLowerCase()}.png`, // Optional logo
                                            x: undefined,
                                            y: undefined,
                                            height: 40,
                                            width: 40,
                                            excavate: true,
                                        }}
                                    />
                                </div>

                                {/* Address Display */}
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider ml-1">
                                        Your {selectedCurrency} Address
                                    </label>
                                    <div 
                                        onClick={handleCopy}
                                        className="group relative bg-gray-800/50 border border-gray-700/50 hover:border-purple-500/50 rounded-xl p-4 cursor-pointer transition-all active:scale-[0.99]"
                                    >
                                        <p className="font-mono text-sm text-gray-300 break-all text-center select-all">
                                            {currentWallet.address}
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
                                    <Button onClick={() => handleCurrencyChange(selectedCurrency)} className="bg-purple-600 hover:bg-purple-500">
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
