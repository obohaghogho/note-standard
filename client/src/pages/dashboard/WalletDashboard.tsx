import React, { useState } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { Button } from '../../components/common/Button';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  History,
  Copy,
  RefreshCw,
  X,
  Send,
  Download,
  ArrowRightLeft
} from 'lucide-react';
import toast from 'react-hot-toast';
import './WalletDashboard.css';
import type { Currency } from '@/types/wallet';
import { FundModal } from '../../components/wallet/FundModal';
import { SwapModal } from '../../components/wallet/SwapModal';
import { formatCurrency } from '../../lib/CurrencyFormatter';

const SUPPORTED_CURRENCIES: Currency[] = ['BTC', 'ETH', 'USD', 'NGN', 'EUR', 'GBP', 'JPY'];

export const WalletDashboard: React.FC = () => {
  const { wallets, transactions, loading, createWallet, sendFunds, withdraw, getCommissionRate, refresh } = useWallet();
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('BTC');
  
  // Transfer Form State
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [transferFee, setTransferFee] = useState<{ fee: number, net: number } | null>(null);

  // Withdraw Form State
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState(''); // Or Bank ID
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawFee, setWithdrawFee] = useState<{ fee: number, net: number } | null>(null);

  // Helper to get icon for currency
  const getCurrencyIcon = (curr: string) => {
    switch (curr) {
      case 'BTC': return '₿';
      case 'ETH': return 'Ξ';
      case 'USD': return '$';
      case 'USDT': return '₮';
      case 'NGN': return '₦';
      default: return '$';
    }
  };

  // Fee Calculation
  React.useEffect(() => {
    const calculateTransferFee = async () => {
        if (!amount || isNaN(parseFloat(amount))) {
            setTransferFee(null);
            return;
        }
        const val = parseFloat(amount);
        const settings = await getCommissionRate('TRANSFER_OUT', selectedCurrency);
        // Simple client-side estimation based on settings (Production should use a verify-fee endpoint)
        let fee = 0;
        if (settings && settings.length > 0) {
            const s = settings[0];
            if (s.commission_type === 'PERCENTAGE') fee = val * s.value;
            else fee = s.value;
            if (s.min_fee && fee < s.min_fee) fee = s.min_fee;
            if (s.max_fee && fee > s.max_fee) fee = s.max_fee;
        }
        setTransferFee({ fee, net: val + fee }); // Transfer: Sender pays Amount + Fee
    };
    calculateTransferFee();
  }, [amount, selectedCurrency, getCommissionRate]);

  React.useEffect(() => {
    const calculateWithdrawFee = async () => {
        if (!withdrawAmount || isNaN(parseFloat(withdrawAmount))) {
            setWithdrawFee(null);
            return;
        }
        const val = parseFloat(withdrawAmount);
        const settings = await getCommissionRate('WITHDRAWAL', selectedCurrency);
        let fee = 0;
        if (settings && settings.length > 0) {
            const s = settings[0];
            if (s.commission_type === 'PERCENTAGE') fee = val * s.value;
            else fee = s.value;
            if (s.min_fee && fee < s.min_fee) fee = s.min_fee;
            if (s.max_fee && fee > s.max_fee) fee = s.max_fee;
        }
        setWithdrawFee({ fee, net: val - fee }); // Withdraw: User gets Amount - Fee
    };
    calculateWithdrawFee();
  }, [withdrawAmount, selectedCurrency, getCommissionRate]);

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied!');
  };

  const handleCreateWallet = async (currency: string) => {
    try {
      await createWallet(currency);
      toast.success(`${currency} wallet created!`);
      setShowCreateModal(false);
    } catch (err) {
      // Error handled in context
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !recipient) return;

    setIsSending(true);
    try {
      const isEmail = recipient.includes('@');
      await sendFunds({
        currency: selectedCurrency,
        amount: parseFloat(amount),
        recipientEmail: isEmail ? recipient : undefined,
        recipientId: !isEmail ? recipient : undefined,
      });
      setShowTransferModal(false);
      setRecipient('');
      setAmount('');
    } catch (err) {
      // Error handled in context
    } finally {
      setIsSending(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!withdrawAmount) return;

      setIsWithdrawing(true);
      try {
          await withdraw({
              currency: selectedCurrency,
              amount: parseFloat(withdrawAmount),
              address: withdrawAddress
          });
          setShowWithdrawModal(false);
          setWithdrawAmount('');
          setWithdrawAddress('');
      } catch (err) {

      } finally {
          setIsWithdrawing(false);
      }
  };

  const groupedTransactions = transactions.slice(0, 10); // Show last 10

  return (
    <div className="wallet-dashboard">
      <div className="wallet-dashboard__header">
        <h1>My Wallet</h1>
        <Button onClick={refresh} variant="ghost" size="sm">
          <RefreshCw size={18} /> Refresh
        </Button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="animate-spin text-purple-500" size={32} />
          <span className="ml-3 text-gray-400">Loading wallets...</span>
        </div>
      )}

      {/* Wallets Grid */}
      {!loading && (
      <div className="wallet-grid">
        {wallets.map((wallet) => (
          <div key={wallet.id} className="wallet-card">
            <div>
              <div className="wallet-card__header">
                <div className="wallet-card__currency">
                  <span className="wallet-card__icon">{getCurrencyIcon(wallet.currency)}</span>
                  {wallet.currency}
                </div>
                {wallet.is_frozen && <span className="text-red-400 text-xs">FROZEN</span>}
              </div>
              <div className="wallet-card__balance">
                {formatCurrency(wallet.balance, wallet.currency)}
              </div>
              <div className="wallet-card__available">
                Available: <span>{formatCurrency(wallet.available_balance || wallet.balance, wallet.currency)}</span>
              </div>
              <div 
                className="wallet-card__address" 
                onClick={() => handleCopyAddress(wallet.address)}
                title="Click to copy"
              >
                {wallet.address.substring(0, 6)}...{wallet.address.substring(wallet.address.length - 4)}
                <Copy size={12} />
              </div>
            </div>
            <div className="wallet-card__actions flex flex-wrap gap-2">
              <Button 
                size="sm" 
                onClick={() => {
                  setSelectedCurrency(wallet.currency);
                  setShowTransferModal(true);
                }}
              >
                <Send size={16} /> Send
              </Button>
              <Button 
                size="sm" 
                variant="secondary" 
                onClick={() => {
                  setSelectedCurrency(wallet.currency);
                  setShowFundModal(true);
                }}
              >
                <Download size={16} /> Fund
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                className="bg-transparent border-purple-500/50 hover:bg-purple-500/10 text-purple-400"
                onClick={() => {
                  setSelectedCurrency(wallet.currency);
                  setShowSwapModal(true);
                }}
              >
                <ArrowRightLeft size={16} /> Swap
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                className="bg-transparent border-red-500/50 hover:bg-red-500/10 text-red-400"
                onClick={() => {
                    setSelectedCurrency(wallet.currency);
                    setShowWithdrawModal(true);
                }}
               >
                <ArrowUpRight size={16} /> Withdraw
              </Button>
            </div>
          </div>
        ))}

        {/* Create Wallet Button */}
        <div 
          className="wallet-card create-wallet-card"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={32} />
          <span>Add New Wallet</span>
        </div>
      </div>
      )}

      {/* Transaction History */}
      <div className="wallet-history">
        <div className="flex items-center gap-2 mb-4">
          <History size={20} className="text-gray-400" />
          <h3>Recent Transactions</h3>
        </div>
        
        {transactions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No transactions yet</p>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Fee</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {groupedTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td>
                    <div className="tx-type">
                      {tx.type === 'DEPOSIT' || tx.type === 'TRANSFER_IN' ? (
                        <ArrowDownLeft size={16} className="text-green-400" />
                      ) : (
                        <ArrowUpRight size={16} className="text-red-400" />
                      )}
                      {tx.type.replace('_', ' ')}
                    </div>
                  </td>
                  <td className={`tx-amount ${
                    tx.type === 'DEPOSIT' || tx.type === 'TRANSFER_IN' ? 'positive' : 'negative'
                  }`}>
                    {tx.type === 'DEPOSIT' || tx.type === 'TRANSFER_IN' ? '+' : '-'}
                    {formatCurrency(tx.amount, tx.currency)}
                  </td>
                  <td className="text-gray-400 text-sm">
                      {tx.fee > 0 ? formatCurrency(tx.fee, tx.currency) : '-'}
                  </td>
                  <td>
                    <span className={`history-status ${tx.status.toLowerCase()}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="text-gray-400">
                    {new Date(tx.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      
      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowTransferModal(false)}>
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-6">Send {selectedCurrency}</h2>
            
            <form onSubmit={handleSend} className="flex flex-column gap-4">
              <div>
                <label htmlFor="transferRecipient" className="block text-sm text-gray-400 mb-2 cursor-pointer">Recipient Email</label>
                <input 
                  id="transferRecipient"
                  name="recipient"
                  type="email" 
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none"
                  placeholder="user@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              
              <div>
                <label htmlFor="transferAmount" className="block text-sm text-gray-400 mb-2 cursor-pointer">Amount</label>
                <div className="relative">
                  <input 
                    id="transferAmount"
                    name="amount"
                    type="number" 
                    step="0.000001"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none pr-16"
                    placeholder="0.00"
                    required
                    autoComplete="off"
                  />
                  <span className="absolute right-4 top-3 text-gray-400 font-bold">
                    {selectedCurrency}
                  </span>
                </div>
              </div>

               {transferFee && (
                  <div className="bg-gray-800 p-3 rounded-lg text-sm space-y-1">
                      <div className="flex justify-between text-gray-400">
                          <span>Network Fee (Est.):</span>
                          <span>{formatCurrency(transferFee.fee, selectedCurrency)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-white pt-2 border-t border-gray-700">
                          <span>Total Deducted:</span>
                          <span>{formatCurrency(transferFee.net, selectedCurrency)}</span>
                      </div>
                  </div>
              )}

              <div className="mt-4 flex gap-3 justify-end">
                <Button variant="ghost" onClick={() => setShowTransferModal(false)} type="button">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSending}>
                  {isSending ? 'Sending...' : 'Confirm Transfer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowWithdrawModal(false)}>
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-6">Withdraw {selectedCurrency}</h2>
            
            <form onSubmit={handleWithdraw} className="flex flex-column gap-4">
              <div>
                <label htmlFor="withdrawAddress" className="block text-sm text-gray-400 mb-2 cursor-pointer">
                    {selectedCurrency === 'USD' || selectedCurrency === 'NGN' ? 'Bank Account / Details' : 'Destination Address'}
                </label>
                <input 
                  id="withdrawAddress"
                  name="address"
                  type="text" 
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none"
                  placeholder={selectedCurrency === 'BTC' ? 'bc1q...' : 'Bank details...'}
                  required
                  autoComplete="off"
                />
              </div>
              
              <div>
                <label htmlFor="withdrawAmount" className="block text-sm text-gray-400 mb-2 cursor-pointer">Amount to Withdraw</label>
                <div className="relative">
                  <input 
                    id="withdrawAmount"
                    name="amount"
                    type="number" 
                    step="0.000001"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none pr-16"
                    placeholder="0.00"
                    required
                    autoComplete="off"
                  />
                  <span className="absolute right-4 top-3 text-gray-400 font-bold">
                    {selectedCurrency}
                  </span>
                </div>
              </div>

              {withdrawFee && (
                  <div className="bg-gray-800 p-3 rounded-lg text-sm space-y-1">
                      <div className="flex justify-between text-gray-400">
                          <span>Platform Fee:</span>
                          <span>{formatCurrency(withdrawFee.fee, selectedCurrency)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-white pt-2 border-t border-gray-700">
                          <span>You Receive (Est.):</span>
                          <span>{formatCurrency(withdrawFee.net, selectedCurrency)}</span>
                      </div>
                  </div>
              )}

              <div className="mt-4 flex gap-3 justify-end">
                <Button variant="ghost" onClick={() => setShowWithdrawModal(false)} type="button">
                  Cancel
                </Button>
                <Button type="submit" disabled={isWithdrawing}>
                  {isWithdrawing ? 'Processing...' : 'Confirm Withdrawal'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Wallet Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowCreateModal(false)}>
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-6">Add New Wallet</h2>
            
            <div className="grid grid-cols-2 gap-4">
              {SUPPORTED_CURRENCIES.map((curr) => {
                const exists = wallets.some(w => w.currency === curr);
                if (exists) return null;
                
                return (
                  <button
                    key={curr}
                    onClick={() => handleCreateWallet(curr)}
                    className="p-4 border border-gray-700 rounded-xl hover:border-purple-500 hover:bg-gray-800 transition-all flex flex-col items-center gap-2"
                  >
                    <span className="text-2xl">{getCurrencyIcon(curr)}</span>
                    <span className="font-bold">{curr}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Fund Modal */}
      <FundModal
        isOpen={showFundModal}
        onClose={() => setShowFundModal(false)}
        selectedCurrency={selectedCurrency}
        onSuccess={refresh}
      />

      {/* Swap Modal */}
      <SwapModal
        isOpen={showSwapModal}
        onClose={() => setShowSwapModal(false)}
        initialFromCurrency={selectedCurrency}
        onSuccess={refresh}
      />
    </div>
  );
};
