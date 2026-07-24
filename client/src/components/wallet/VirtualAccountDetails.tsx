import React, { useState, useEffect } from 'react';
import { Copy, Check, RefreshCw, AlertTriangle, CheckCircle, ShieldAlert, Clock, ArrowRight, Upload } from 'lucide-react';
import walletApi from '../../api/walletApi';
import toast from 'react-hot-toast';

interface VirtualAccountDetailsProps {
  currency: string;
  onAccountCreated?: () => void;
}

export function VirtualAccountDetails({ currency, onAccountCreated }: VirtualAccountDetailsProps) {
  const [account, setAccount] = useState<any>(null);
  const [status, setStatus] = useState<string>('NOT_REQUESTED');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // KYC Form State
  const [showKycForm, setShowKycForm] = useState(false);
  const [idCardUrl, setIdCardUrl] = useState('');
  const [utilityBillUrl, setUtilityBillUrl] = useState('');
  const [dob, setDob] = useState('1995-01-01');
  const [occupation, setOccupation] = useState('Software Developer');
  const [address, setAddress] = useState({
    street: '123 Financial Way',
    city: 'Lagos',
    state: 'Lagos State',
    country: 'NG',
    postalCode: '100001',
  });

  const isFcy = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(currency);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const res = await walletApi.getVirtualAccount(currency);
      setAccount(res.account);
      setStatus(res.status || 'NOT_REQUESTED');
    } catch (err: any) {
      console.error('Failed to load virtual account details', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [currency]);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`${fieldName} copied to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRefresh = async () => {
    try {
      setActionLoading(true);
      const res = await walletApi.refreshVirtualAccount(currency);
      setAccount(res.account);
      setStatus(res.account.status);
      toast.success('Account status updated!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to refresh status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleProvision = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setActionLoading(true);
      
      let kycData: any = {};
      if (isFcy) {
        if (!idCardUrl || !utilityBillUrl) {
          toast.error('ID Card and Utility Bill URLs are required for international accounts');
          return;
        }
        kycData = {
          dob,
          occupation,
          address,
          documentUrls: {
            idCard: idCardUrl,
            utilityBill: utilityBillUrl,
          },
        };
      }

      const res = await walletApi.createVirtualAccount(currency, kycData);
      setAccount(res.account);
      setStatus(res.account.status);
      setShowKycForm(false);
      onAccountCreated?.();
      toast.success(`Virtual account provisioned successfully!`);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message;
      if (err.response?.data?.code === 'MISSING_KYC_DOCUMENTS' || errMsg.includes('MISSING_KYC_DOCUMENTS')) {
        setShowKycForm(true);
        toast.error('KYC documentation is required to open this account.');
      } else {
        toast.error(errMsg || 'Failed to provision virtual account');
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mt-4 animate-pulse">
        <div className="h-6 w-40 bg-white/10 rounded-md mb-4" />
        <div className="space-y-3">
          <div className="h-4 w-full bg-white/5 rounded-md" />
          <div className="h-4 w-3/4 bg-white/5 rounded-md" />
          <div className="h-4 w-1/2 bg-white/5 rounded-md" />
        </div>
      </div>
    );
  }

  // --- 1. RENDER NOT REQUESTED STATE ---
  if (status === 'NOT_REQUESTED' && !showKycForm) {
    return (
      <div className="bg-white/5 border border-white/5 rounded-2xl p-6 mt-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="text-indigo-400" size={24} />
        </div>
        <h4 className="text-white font-bold text-base mb-1">Fund via Dedicated Virtual Account</h4>
        <p className="text-gray-400 text-sm max-w-md mx-auto mb-5 leading-relaxed">
          Create a dedicated bank account for your {currency} wallet. Any payments made to this account will credit your balance instantly.
        </p>
        <button
          onClick={() => (isFcy ? setShowKycForm(true) : handleProvision())}
          disabled={actionLoading}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg hover:shadow-indigo-500/25 flex items-center justify-center gap-2 mx-auto disabled:opacity-50"
        >
          {actionLoading && <RefreshCw className="animate-spin" size={14} />}
          Create Virtual Account
          <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  // --- 2. RENDER KYC FORM IF REQUESTED/REQUIRED ---
  if (showKycForm) {
    return (
      <form onSubmit={handleProvision} className="bg-gray-950 border border-white/10 rounded-2xl p-6 mt-4 space-y-4">
        <div className="flex items-center gap-3 mb-2 pb-2 border-b border-white/5">
          <Upload className="text-indigo-400" size={20} />
          <div>
            <h4 className="text-white font-bold text-base">KYC Document Verification</h4>
            <p className="text-gray-500 text-xs">Fincra compliance requirement for international {currency} funding</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1">ID Card URL</label>
            <input
              type="url"
              required
              placeholder="https://example.com/id-card.jpg"
              value={idCardUrl}
              onChange={(e) => setIdCardUrl(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1">Utility Bill URL</label>
            <input
              type="url"
              required
              placeholder="https://example.com/utility-bill.jpg"
              value={utilityBillUrl}
              onChange={(e) => setUtilityBillUrl(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1">Date of Birth</label>
            <input
              type="date"
              required
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1">Occupation</label>
            <input
              type="text"
              required
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <h5 className="text-white text-xs font-bold uppercase tracking-wider text-gray-500">Billing Address</h5>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Street"
              value={address.street}
              onChange={(e) => setAddress({ ...address, street: e.target.value })}
              className="md:col-span-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="City"
              value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="State"
              value={address.state}
              onChange={(e) => setAddress({ ...address, state: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="Country Code (e.g. CA, AU)"
              value={address.country}
              onChange={(e) => setAddress({ ...address, country: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="Postal Code"
              value={address.postalCode}
              onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
          <button
            type="button"
            onClick={() => setShowKycForm(false)}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={actionLoading}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50"
          >
            {actionLoading && <RefreshCw className="animate-spin" size={12} />}
            Submit & Provision Account
          </button>
        </div>
      </form>
    );
  }

  // --- 3. RENDER PROCESSING / FAILED STATES ---
  if (status === 'PROCESSING') {
    return (
      <div className="bg-white/5 border border-white/5 rounded-2xl p-6 mt-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-4 animate-bounce">
          <Clock className="text-yellow-400" size={24} />
        </div>
        <h4 className="text-white font-bold text-base mb-1">Provisioning in Progress</h4>
        <p className="text-gray-400 text-sm max-w-md mx-auto mb-5">
          We are creating your virtual account with the clearing provider. This usually takes less than 2 minutes.
        </p>
        <button
          onClick={handleRefresh}
          disabled={actionLoading}
          className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold flex items-center gap-2 mx-auto disabled:opacity-50"
        >
          <RefreshCw className={actionLoading ? 'animate-spin' : ''} size={12} />
          Check Status
        </button>
      </div>
    );
  }

  if (status === 'FAILED') {
    return (
      <div className="bg-white/5 border border-white/5 rounded-2xl p-6 mt-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="text-red-400" size={24} />
        </div>
        <h4 className="text-red-400 font-bold text-base mb-1">Provisioning Failed</h4>
        <p className="text-gray-400 text-sm max-w-md mx-auto mb-5">
          The banking partner rejected the request. Please try again or contact customer support.
        </p>
        <button
          onClick={() => setStatus('NOT_REQUESTED')}
          className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold mx-auto"
        >
          Try Again
        </button>
      </div>
    );
  }

  // --- 4. RENDER SUCCESS / ACTIVE ACCOUNT STATE ---
  const routing = account.metadata || {};

  return (
    <div className="bg-gradient-to-br from-indigo-950/20 to-gray-900 border border-white/5 rounded-2xl p-6 mt-4 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-white/5">
        <div>
          <h4 className="text-white font-black text-sm tracking-wide uppercase">Dedicated Virtual Account</h4>
          <p className="text-gray-500 text-xs">Direct bank transfer funding info</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
          <button
            onClick={handleRefresh}
            disabled={actionLoading}
            className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className={actionLoading ? 'animate-spin' : ''} size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bank Name */}
        <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex justify-between items-center">
          <div>
            <span className="text-gray-500 text-xs block mb-0.5">Bank Name</span>
            <span className="text-white font-bold text-sm">{account.bank_name}</span>
          </div>
          <button onClick={() => handleCopy(account.bank_name, 'Bank Name')} className="text-gray-400 hover:text-white">
            {copiedField === 'Bank Name' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>

        {/* Account Holder Name */}
        <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex justify-between items-center">
          <div>
            <span className="text-gray-500 text-xs block mb-0.5">Account Holder</span>
            <span className="text-white font-bold text-sm">{account.account_name}</span>
          </div>
          <button onClick={() => handleCopy(account.account_name, 'Account Holder')} className="text-gray-400 hover:text-white">
            {copiedField === 'Account Holder' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>

        {/* Account Number */}
        <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex justify-between items-center">
          <div>
            <span className="text-gray-500 text-xs block mb-0.5">Account Number</span>
            <span className="text-white font-bold text-sm tracking-wider">{account.account_number}</span>
          </div>
          <button onClick={() => handleCopy(account.account_number, 'Account Number')} className="text-gray-400 hover:text-white">
            {copiedField === 'Account Number' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>

        {/* IBAN (for EUR) */}
        {routing.iban && (
          <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex justify-between items-center">
            <div>
              <span className="text-gray-500 text-xs block mb-0.5">IBAN</span>
              <span className="text-white font-bold text-sm tracking-wider">{routing.iban}</span>
            </div>
            <button onClick={() => handleCopy(routing.iban, 'IBAN')} className="text-gray-400 hover:text-white">
              {copiedField === 'IBAN' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        )}

        {/* Routing Number (for USD) */}
        {routing.routingNumber && (
          <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex justify-between items-center">
            <div>
              <span className="text-gray-500 text-xs block mb-0.5">Routing Number</span>
              <span className="text-white font-bold text-sm tracking-wider">{routing.routingNumber}</span>
            </div>
            <button onClick={() => handleCopy(routing.routingNumber, 'Routing Number')} className="text-gray-400 hover:text-white">
              {copiedField === 'Routing Number' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        )}

        {/* Sort Code (for GBP) */}
        {routing.sortCode && (
          <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex justify-between items-center">
            <div>
              <span className="text-gray-500 text-xs block mb-0.5">Sort Code</span>
              <span className="text-white font-bold text-sm tracking-wider">{routing.sortCode}</span>
            </div>
            <button onClick={() => handleCopy(routing.sortCode, 'Sort Code')} className="text-gray-400 hover:text-white">
              {copiedField === 'Sort Code' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        )}

        {/* Transit Number (for CAD) */}
        {routing.transitNumber && (
          <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex justify-between items-center">
            <div>
              <span className="text-gray-500 text-xs block mb-0.5">Transit Number</span>
              <span className="text-white font-bold text-sm tracking-wider">{routing.transitNumber}</span>
            </div>
            <button onClick={() => handleCopy(routing.transitNumber, 'Transit Number')} className="text-gray-400 hover:text-white">
              {copiedField === 'Transit Number' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        )}

        {/* BSB Number (for AUD) */}
        {routing.bsbNumber && (
          <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex justify-between items-center">
            <div>
              <span className="text-gray-500 text-xs block mb-0.5">BSB Number</span>
              <span className="text-white font-bold text-sm tracking-wider">{routing.bsbNumber}</span>
            </div>
            <button onClick={() => handleCopy(routing.bsbNumber, 'BSB Number')} className="text-gray-400 hover:text-white">
              {copiedField === 'BSB Number' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        )}

        {/* SWIFT / BIC */}
        {routing.swift && (
          <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex justify-between items-center">
            <div>
              <span className="text-gray-500 text-xs block mb-0.5">SWIFT / BIC</span>
              <span className="text-white font-bold text-sm tracking-wider">{routing.swift}</span>
            </div>
            <button onClick={() => handleCopy(routing.swift, 'SWIFT')} className="text-gray-400 hover:text-white">
              {copiedField === 'SWIFT' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        )}
      </div>

      <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 flex gap-3 text-left">
        <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
        <div>
          <span className="text-amber-400 font-bold text-xs block mb-0.5">Important Transfer Rules</span>
          <p className="text-gray-400 text-[11px] leading-relaxed">
            Ensure the sender name matches your registered name exactly to prevent payment holds. Only transfer <strong>{currency}</strong> to this account. Third-party deposits may require manual verification.
          </p>
        </div>
      </div>
    </div>
  );
}
