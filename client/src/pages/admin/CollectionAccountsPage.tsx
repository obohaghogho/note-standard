import React, { useState, useEffect } from 'react';
import { Landmark, Copy, Check, Play, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_URL } from '../../lib/api';
import EmptyStateCard from '../../components/common/EmptyStateCard';
import './CollectionAccountsPage.css';

interface CollectionAccount {
  id: string;
  provider: string;
  account_type: string;
  currency: string;
  country: string;
  rail: string;
  bank_name: string;
  iban?: string;
  account_number?: string;
  sort_code?: string;
  swift?: string;
  beneficiary: string;
  status: string;
  health: string;
  daily_limit: number;
  monthly_limit: number;
  current_utilization: number;
}

export const CollectionAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<CollectionAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/collection-accounts`);
      if (res.ok) {
        const json = await res.json();
        setAccounts(json.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleCopyDetails = (acc: CollectionAccount) => {
    const details = `Beneficiary: ${acc.beneficiary}\nBank: ${acc.bank_name}\n${acc.iban ? `IBAN: ${acc.iban}\n` : ''}${acc.account_number ? `Account No: ${acc.account_number}\n` : ''}${acc.sort_code ? `Sort Code/Routing: ${acc.sort_code}\n` : ''}${acc.swift ? `SWIFT: ${acc.swift}` : ''}`;
    navigator.clipboard.writeText(details);
    setCopiedId(acc.id);
    toast.success(`${acc.currency} Collection account details copied!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTestDeposit = async (acc: CollectionAccount) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/collection-accounts/${acc.id}/test-deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 500,
          currency: acc.currency,
          reference: `NS-${acc.currency}-TEST99`,
          senderName: 'Test Simulated Depositor'
        })
      });
      if (res.ok) {
        toast.success(`Test deposit simulated for ${acc.currency}`);
        fetchAccounts();
      }
    } catch (e) {
      toast.error('Simulation failed');
    }
  };

  return (
    <div className="collection-accounts-page px-2 sm:px-4 py-3">
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="page-title flex items-center gap-3 text-xl sm:text-2xl font-bold text-white tracking-tight">
          <Landmark size={26} className="text-indigo-400 shrink-0" />
          <span>Merchant Collection Accounts</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button 
            className="btn-secondary flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm font-semibold text-gray-200 hover:bg-gray-800 transition-colors min-h-[44px]" 
            onClick={fetchAccounts}
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button 
            className="btn-primary flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-600/20 min-h-[44px]" 
            onClick={() => toast.info('Account provisioning dialog')}
          >
            <Plus size={16} /> Add Collection Account
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-gray-900/60 border border-gray-800" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <EmptyStateCard
          icon={Landmark}
          title="No Collection Accounts Configured"
          description="Provision merchant collection accounts across fiat and crypto rails to receive deposits."
          actionLabel="Add First Collection Account"
          onAction={() => toast.info('Account provisioning dialog')}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="account-card p-4 rounded-xl bg-gray-900/80 border border-gray-800 flex flex-col justify-between space-y-3 shadow-lg">
              <div>
                <div className="account-header flex items-center justify-between border-b border-gray-800 pb-2.5 mb-3">
                  <span className="currency-badge px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {acc.currency} ({acc.rail})
                  </span>
                  <span className={`health-tag px-2 py-0.5 rounded-full text-[11px] font-semibold ${acc.health === 'HEALTHY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                    {acc.health}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Provider:</span>
                    <span className="font-bold text-white uppercase">{acc.provider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Beneficiary:</span>
                    <span className="font-medium text-gray-200 truncate max-w-[180px]">{acc.beneficiary}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Bank:</span>
                    <span className="font-medium text-gray-200 truncate max-w-[180px]">{acc.bank_name}</span>
                  </div>
                  {acc.iban && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">IBAN:</span>
                      <span className="font-mono text-gray-200">{acc.iban}</span>
                    </div>
                  )}
                  {acc.account_number && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Account No:</span>
                      <span className="font-mono text-gray-200">{acc.account_number}</span>
                    </div>
                  )}
                  {acc.sort_code && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Sort Code:</span>
                      <span className="font-mono text-gray-200">{acc.sort_code}</span>
                    </div>
                  )}
                  {acc.swift && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">SWIFT:</span>
                      <span className="font-mono text-gray-200">{acc.swift}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="card-actions flex gap-2 pt-3 border-t border-gray-800">
                <button 
                  className="flex-1 py-2 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-gray-700 min-h-[44px]" 
                  onClick={() => handleCopyDetails(acc)}
                >
                  {copiedId === acc.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />} Copy
                </button>
                <button 
                  className="flex-1 py-2 px-3 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-indigo-500/40 min-h-[44px]" 
                  onClick={() => handleTestDeposit(acc)}
                >
                  <Play size={14} className="text-indigo-400" /> Test Deposit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CollectionAccountsPage;

