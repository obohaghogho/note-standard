import React, { useState, useEffect } from 'react';
import { Landmark, Copy, Check, Play, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_URL } from '../../lib/api';
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
    <div className="collection-accounts-page">
      <div className="page-header">
        <div className="page-title">
          <Landmark size={24} color="#818cf8" />
          <span>Merchant Collection Accounts</span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-secondary" onClick={fetchAccounts}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="btn-primary" onClick={() => toast.info('Account provisioning dialog')}>
            <Plus size={16} /> Add Collection Account
          </button>
        </div>
      </div>

      {loading ? (
        <div>Loading collection accounts...</div>
      ) : (
        <div className="accounts-grid">
          {accounts.map((acc) => (
            <div key={acc.id} className="account-card">
              <div className="account-header">
                <span className="currency-badge">{acc.currency} ({acc.rail})</span>
                <span className={`health-tag ${acc.health.toLowerCase()}`}>{acc.health}</span>
              </div>
              <div className="account-detail-row">
                <span>Provider:</span>
                <span className="account-detail-val">{acc.provider.toUpperCase()}</span>
              </div>
              <div className="account-detail-row">
                <span>Beneficiary:</span>
                <span className="account-detail-val">{acc.beneficiary}</span>
              </div>
              <div className="account-detail-row">
                <span>Bank:</span>
                <span className="account-detail-val">{acc.bank_name}</span>
              </div>
              {acc.iban && (
                <div className="account-detail-row">
                  <span>IBAN:</span>
                  <span className="account-detail-val">{acc.iban}</span>
                </div>
              )}
              {acc.account_number && (
                <div className="account-detail-row">
                  <span>Account Number:</span>
                  <span className="account-detail-val">{acc.account_number}</span>
                </div>
              )}
              {acc.sort_code && (
                <div className="account-detail-row">
                  <span>Sort Code / Routing:</span>
                  <span className="account-detail-val">{acc.sort_code}</span>
                </div>
              )}
              {acc.swift && (
                <div className="account-detail-row">
                  <span>SWIFT:</span>
                  <span className="account-detail-val">{acc.swift}</span>
                </div>
              )}

              <div className="card-actions">
                <button className="btn-secondary" onClick={() => handleCopyDetails(acc)}>
                  {copiedId === acc.id ? <Check size={14} color="#34d399" /> : <Copy size={14} />} Copy
                </button>
                <button className="btn-secondary" onClick={() => handleTestDeposit(acc)}>
                  <Play size={14} color="#818cf8" /> Test Deposit
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
