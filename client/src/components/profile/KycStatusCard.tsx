import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, Lock, ArrowRight, Smartphone, Building2, Globe2, FileText, ChevronRight, AlertCircle } from 'lucide-react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { toast } from 'react-hot-toast';
import { walletApi } from '../../api/walletApi';

interface KycStatusCardProps {
  userEmail?: string;
  phone?: string;
  isVerified?: boolean;
  kycLevel?: number;
  onPhoneUpdated?: (newPhone: string) => void;
}

export const KycStatusCard: React.FC<KycStatusCardProps> = ({
  userEmail,
  phone: initialPhone = '',
  isVerified = false,
  kycLevel = 1,
  onPhoneUpdated
}) => {
  const [phone, setPhone] = useState(initialPhone);
  const [bvnInput, setBvnInput] = useState('');
  const [dobInput, setDobInput] = useState('');
  const [showTier2Modal, setShowTier2Modal] = useState(false);
  const [showTier3Modal, setShowTier3Modal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Tier 3 inputs
  const [idCardUrl, setIdCardUrl] = useState('');
  const [utilityBillUrl, setUtilityBillUrl] = useState('');
  const [address, setAddress] = useState('');
  const [occupation, setOccupation] = useState('');

  // Determine current active tier
  const hasPhone = Boolean(phone && phone.trim().length >= 8);
  const currentTier = kycLevel >= 3 ? 3 : (kycLevel === 2 || Boolean(initialPhone && isVerified) ? 2 : 1);

  const handleTier2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bvnInput || bvnInput.length < 10) {
      toast.error('Please enter a valid 11-digit BVN or NIN number');
      return;
    }
    setLoading(true);
    try {
      // Provision/upgrade NGN Virtual Account with BVN
      await walletApi.createVirtualAccount('NGN', {
        bvn: bvnInput,
        dob: dobInput,
        phone: phone
      });
      toast.success('Tier 2 Verification Submitted! Virtual Account Activated.');
      setShowTier2Modal(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Failed to complete Tier 2 verification');
    } finally {
      setLoading(false);
    }
  };

  const handleTier3Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idCardUrl || !utilityBillUrl) {
      toast.error('Government ID Card and Utility Bill URLs are required for Tier 3 verification');
      return;
    }
    setLoading(true);
    try {
      await walletApi.createVirtualAccount('USD', {
        dob: dobInput,
        occupation,
        address,
        documentUrls: {
          idCard: idCardUrl,
          utilityBill: utilityBillUrl
        }
      });
      toast.success('Tier 3 Verification Submitted! USD/EUR/GBP accounts unlocked.');
      setShowTier3Modal(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Failed to submit Tier 3 verification');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900/40 via-purple-900/30 to-black/60 border border-blue-500/20 rounded-2xl p-5 sm:p-6 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-blue-400" size={24} />
              <h2 className="text-xl font-bold text-white tracking-tight">Identity Verification (KYC)</h2>
            </div>
            <p className="text-sm text-gray-300">
              Verify your identity to increase transaction limits and unlock multi-currency bank accounts.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-400/30 px-3.5 py-1.5 rounded-full self-start sm:self-auto">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
              Current: Tier {currentTier} Active
            </span>
          </div>
        </div>
      </div>

      {/* Tier Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* TIER 1 CARD */}
        <div className={`relative rounded-2xl border p-5 transition-all flex flex-col justify-between ${
          currentTier >= 1 ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-white/5 border-white/10'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Smartphone size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white">Tier 1: Basic</h3>
                  <p className="text-xs text-emerald-400 font-medium">Daily Limit: 50,000 NGN</p>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                ACTIVE
              </span>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-gray-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                <span>Email: <strong className="text-white">{userEmail || 'Verified'}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                {hasPhone ? (
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle size={14} className="text-amber-400 shrink-0" />
                )}
                <span>
                  Phone: {hasPhone ? <strong className="text-white">{phone}</strong> : <span className="text-amber-400 font-medium">Phone number required</span>}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                <span>Standard Transfers & Wallet</span>
              </div>
            </div>
          </div>
        </div>

        {/* TIER 2 CARD */}
        <div className={`relative rounded-2xl border p-5 transition-all flex flex-col justify-between ${
          currentTier >= 2 ? 'bg-blue-950/20 border-blue-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white">Tier 2: Banking</h3>
                  <p className="text-xs text-blue-400 font-medium">Daily Limit: 500,000 NGN</p>
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                currentTier >= 2 
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' 
                  : 'bg-white/5 text-gray-400 border-white/10'
              }`}>
                {currentTier >= 2 ? 'VERIFIED' : 'LOCKED'}
              </span>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-gray-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className={currentTier >= 2 ? 'text-blue-400' : 'text-gray-500'} />
                <span>Dedicated NGN Virtual Bank Account</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className={currentTier >= 2 ? 'text-blue-400' : 'text-gray-500'} />
                <span>Requires BVN or NIN Verification</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className={currentTier >= 2 ? 'text-blue-400' : 'text-gray-500'} />
                <span>Instant Bank Payouts & Crypto Swaps</span>
              </div>
            </div>
          </div>

          <div className="pt-4">
            {currentTier >= 2 ? (
              <div className="text-xs text-blue-400 font-medium flex items-center gap-1">
                <CheckCircle2 size={14} /> Tier 2 Active
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs font-semibold border-blue-500/30 hover:bg-blue-500/10 text-blue-300"
                onClick={() => setShowTier2Modal(true)}
              >
                Upgrade to Tier 2 <ChevronRight size={14} className="ml-1" />
              </Button>
            )}
          </div>
        </div>

        {/* TIER 3 CARD */}
        <div className={`relative rounded-2xl border p-5 transition-all flex flex-col justify-between ${
          currentTier >= 3 ? 'bg-purple-950/20 border-purple-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                  <Globe2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white">Tier 3: Enterprise FX</h3>
                  <p className="text-xs text-purple-400 font-medium">Daily Limit: Unlimited</p>
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                currentTier >= 3 
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
                  : 'bg-white/5 text-gray-400 border-white/10'
              }`}>
                {currentTier >= 3 ? 'VERIFIED' : 'LOCKED'}
              </span>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-gray-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className={currentTier >= 3 ? 'text-purple-400' : 'text-gray-500'} />
                <span>USD / EUR / GBP Foreign Accounts</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className={currentTier >= 3 ? 'text-purple-400' : 'text-gray-500'} />
                <span>Requires Photo ID & Utility Bill</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className={currentTier >= 3 ? 'text-purple-400' : 'text-gray-500'} />
                <span>High-Volume Cross Border Transfers</span>
              </div>
            </div>
          </div>

          <div className="pt-4">
            {currentTier >= 3 ? (
              <div className="text-xs text-purple-400 font-medium flex items-center gap-1">
                <CheckCircle2 size={14} /> Tier 3 Active (Unlimited)
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs font-semibold border-purple-500/30 hover:bg-purple-500/10 text-purple-300"
                onClick={() => setShowTier3Modal(true)}
              >
                Upgrade to Tier 3 <ChevronRight size={14} className="ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* TIER 2 MODAL */}
      {showTier2Modal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 className="text-blue-400" size={20} />
                Tier 2: BVN / NIN Verification
              </h3>
              <button 
                onClick={() => setShowTier2Modal(false)}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              Enter your BVN or NIN to activate your dedicated NGN virtual bank account and upgrade your daily limit to 500,000 NGN. Your details are encrypted and used solely for name verification.
            </p>
            <form onSubmit={handleTier2Submit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">BVN or NIN Number</label>
                <Input
                  type="text"
                  placeholder="e.g. 22123456789"
                  value={bvnInput}
                  onChange={(e) => setBvnInput(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Date of Birth</label>
                <Input
                  type="date"
                  value={dobInput}
                  onChange={(e) => setDobInput(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" type="button" onClick={() => setShowTier2Modal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white">
                  {loading ? 'Verifying...' : 'Submit & Activate'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TIER 3 MODAL */}
      {showTier3Modal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-lg w-full space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Globe2 className="text-purple-400" size={20} />
                Tier 3: International FX Verification
              </h3>
              <button 
                onClick={() => setShowTier3Modal(false)}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              Upload your Government ID and Utility Bill to unlock international USD, EUR, and GBP virtual accounts with unlimited daily limits.
            </p>
            <form onSubmit={handleTier3Submit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Government ID Document URL</label>
                <Input
                  type="url"
                  placeholder="https://... (International Passport, Driver's License)"
                  value={idCardUrl}
                  onChange={(e) => setIdCardUrl(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Proof of Address / Utility Bill URL</label>
                <Input
                  type="url"
                  placeholder="https://... (Utility Bill, Bank Statement)"
                  value={utilityBillUrl}
                  onChange={(e) => setUtilityBillUrl(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Residential Address</label>
                  <Input
                    type="text"
                    placeholder="Street Address, City"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Occupation</label>
                  <Input
                    type="text"
                    placeholder="e.g. Software Engineer"
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" type="button" onClick={() => setShowTier3Modal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-500 text-white">
                  {loading ? 'Submitting...' : 'Submit Tier 3 Upgrade'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
