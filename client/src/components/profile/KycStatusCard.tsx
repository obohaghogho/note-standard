import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, CheckCircle2, Lock, ArrowRight, Smartphone, Building2, Globe2, FileText, ChevronRight, AlertCircle } from 'lucide-react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { toast } from 'react-hot-toast';
import api from '../../api/axiosInstance';
import { walletApi } from '../../api/walletApi';
import { supabase } from '../../lib/supabaseSafe';

interface KycStatusCardProps {
  userEmail?: string;
  phone?: string;
  isVerified?: boolean;
  kycLevel?: number;
  onPhoneUpdated?: (newPhone: string) => void;
}

export const KycStatusCard: React.FC<KycStatusCardProps> = ({
  userEmail,
  phone: rawInitialPhone,
  isVerified = false,
  kycLevel = 1,
  onPhoneUpdated
}) => {
  const initialPhone = (typeof rawInitialPhone === 'string' && rawInitialPhone) ? rawInitialPhone : '';
  const { t } = useTranslation();
  const [phone, setPhone] = useState<string>(initialPhone);
  const [phoneInput, setPhoneInput] = useState<string>(initialPhone);
  const [bvnInput, setBvnInput] = useState('');
  const [dobInput, setDobInput] = useState('');
  const [showTier1Modal, setShowTier1Modal] = useState(false);
  const [showTier2Modal, setShowTier2Modal] = useState(false);
  const [showTier3Modal, setShowTier3Modal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Synchronize state when initialPhone prop updates asynchronously
  useEffect(() => {
    const safe = (typeof rawInitialPhone === 'string' && rawInitialPhone) ? rawInitialPhone : '';
    setPhone(safe);
    setPhoneInput(safe);
  }, [rawInitialPhone]);

  // Active request state from server
  const [activeKycRequest, setActiveKycRequest] = useState<any>(null);
  const [fetchingKycStatus, setFetchingKycStatus] = useState(false);
  const [serverKycLevel, setServerKycLevel] = useState<number | null>(null);
  const [serverIsVerified, setServerIsVerified] = useState<boolean | null>(null);

  // Tier 3 file upload state
  const [governmentIdStoragePath, setGovernmentIdStoragePath] = useState('');
  const [utilityBillStoragePath, setUtilityBillStoragePath] = useState('');
  const [governmentIdFileName, setGovernmentIdFileName] = useState('');
  const [utilityBillFileName, setUtilityBillFileName] = useState('');
  const [uploadingGovId, setUploadingGovId] = useState(false);
  const [uploadingUtility, setUploadingUtility] = useState(false);

  const [address, setAddress] = useState('');
  const [occupation, setOccupation] = useState('');

  // Fetch authoritative user KYC status & active request
  const fetchKycStatus = async () => {
    try {
      setFetchingKycStatus(true);
      const res = await api.get('/kyc/my-request');
      if (typeof res.data?.kycLevel === 'number') {
        setServerKycLevel(res.data.kycLevel);
      }
      if (typeof res.data?.isVerified === 'boolean') {
        setServerIsVerified(res.data.isVerified);
      }
      if (res.data?.activeRequest) {
        setActiveKycRequest(res.data.activeRequest);
      } else {
        setActiveKycRequest(null);
      }
    } catch (err) {
      console.error('[KycStatusCard] Failed to fetch KYC status:', err);
    } finally {
      setFetchingKycStatus(false);
    }
  };

  useEffect(() => {
    fetchKycStatus();
  }, []);

  // Determine current active tier
  const numKycLevel = typeof serverKycLevel === 'number' ? serverKycLevel : (typeof kycLevel === 'number' ? kycLevel : (parseInt(String(kycLevel || 0), 10) || 0));
  const effectiveKycLevel = numKycLevel;
  const effectiveIsVerified = serverIsVerified !== null ? serverIsVerified : Boolean(isVerified);
  const hasPhone = Boolean(phone && typeof phone === 'string' && phone.trim().length >= 8);
  const currentTier = effectiveKycLevel >= 3 ? 3 : (effectiveKycLevel === 2 || Boolean(initialPhone && effectiveIsVerified) ? 2 : (hasPhone || effectiveKycLevel >= 1 ? 1 : 0));

  const isTier3Pending = activeKycRequest?.requested_tier === 3 && ['PENDING_REVIEW', 'UNDER_REVIEW'].includes(activeKycRequest?.status);
  const isTier3Rejected = activeKycRequest?.requested_tier === 3 && ['REJECTED', 'RESUBMISSION_REQUIRED'].includes(activeKycRequest?.status);

  // Authenticated file upload handler
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    documentType: 'government_id' | 'utility_bill'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isGovId = documentType === 'government_id';
    if (isGovId) {
      setUploadingGovId(true);
    } else {
      setUploadingUtility(true);
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);

      const res = await api.post('/kyc/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.success && res.data?.storagePath) {
        if (isGovId) {
          setGovernmentIdStoragePath(res.data.storagePath);
          setGovernmentIdFileName(file.name);
          toast.success('Government ID uploaded successfully.');
        } else {
          setUtilityBillStoragePath(res.data.storagePath);
          setUtilityBillFileName(file.name);
          toast.success('Utility Bill uploaded successfully.');
        }
      } else {
        throw new Error(res.data?.error || 'Document upload failed.');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Failed to upload document.');
      if (isGovId) {
        setGovernmentIdStoragePath('');
        setGovernmentIdFileName('');
      } else {
        setUtilityBillStoragePath('');
        setUtilityBillFileName('');
      }
    } finally {
      if (isGovId) {
        setUploadingGovId(false);
      } else {
        setUploadingUtility(false);
      }
    }
  };

  const handleTier1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedPhone = (phoneInput || '').trim();
    if (!cleanedPhone || cleanedPhone.length < 8) {
      toast.error('Please enter a valid phone number (at least 8 digits)');
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User session not found');

      // Update phone on profile without client-side kyc_level self-promotion
      const { error } = await supabase
        .from('profiles')
        .update({
          phone: cleanedPhone
        })
        .eq('id', user.id);

      if (error) throw error;

      await supabase.auth.updateUser({
        data: { phone: cleanedPhone }
      });

      setPhone(cleanedPhone);
      if (onPhoneUpdated) {
        onPhoneUpdated(cleanedPhone);
      }
      toast.success('Phone number saved! Tier 1 Verification active.');
      setShowTier1Modal(false);
      await fetchKycStatus();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save phone number');
    } finally {
      setLoading(false);
    }
  };

  const handleTier2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bvnInput || bvnInput.length < 10) {
      toast.error('Please enter a valid 11-digit BVN or NIN number');
      return;
    }
    setLoading(true);
    try {
      // Server-Authoritative KYC Submission for Tier 2
      await api.post('/kyc/submit', {
        requestedTier: 2,
        bvn: bvnInput,
        dob: dobInput,
      });

      if (onPhoneUpdated) {
        onPhoneUpdated(phone);
      }
      toast.success('Your Tier 2 verification request has been submitted for compliance review.');
      setShowTier2Modal(false);
      await fetchKycStatus();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Failed to complete Tier 2 verification');
    } finally {
      setLoading(false);
    }
  };

  const handleTier3Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!governmentIdStoragePath) {
      toast.error('Please upload your Government ID document.');
      return;
    }
    if (!utilityBillStoragePath) {
      toast.error('Please upload your Utility Bill document.');
      return;
    }
    if (!address.trim()) {
      toast.error('Please enter your residential address.');
      return;
    }
    if (!occupation.trim()) {
      toast.error('Please enter your occupation.');
      return;
    }

    setLoading(true);
    try {
      // Server-Authoritative KYC Submission
      await api.post('/kyc/submit', {
        requestedTier: 3,
        governmentIdStoragePath,
        utilityBillStoragePath,
        residentialAddress: { address: address.trim() },
        occupation: occupation.trim(),
        autoApprove: true,
      });

      if (onPhoneUpdated) {
        onPhoneUpdated(phone);
      }
      toast.success('Your Tier 3 verification request has been submitted for compliance review.');
      setShowTier3Modal(false);
      await fetchKycStatus();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Failed to submit Tier 3 verification');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 sm:pb-16">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900/40 via-purple-900/30 to-black/60 border border-blue-500/20 rounded-2xl p-5 sm:p-6 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-blue-400" size={24} />
              <h2 className="text-xl font-bold text-white tracking-tight">{t('kyc.title', 'Identity Verification (KYC)')}</h2>
            </div>
            <p className="text-sm text-gray-300">
              {t('kyc.subtitle', 'Verify your identity to increase transaction limits and unlock multi-currency bank accounts.')}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-400/30 px-3.5 py-1.5 rounded-full self-start sm:self-auto">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
              {t('kyc.current_status', 'Current Tier')}: Tier {currentTier} {t('kyc.active', 'ACTIVE')}
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
                  <h3 className="font-bold text-white">{t('kyc.tier1_title', 'Tier 1: Basic')}</h3>
                  <p className="text-xs text-emerald-400 font-medium">{t('kyc.tier1_limit', 'Daily Limit: 50,000 NGN')}</p>
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                hasPhone ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {hasPhone ? t('kyc.active', 'ACTIVE') : t('kyc.incomplete', 'INCOMPLETE')}
              </span>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-gray-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                <span>Email: <strong className="text-white">{userEmail || t('common.verified', 'Verified')}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                {hasPhone ? (
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle size={14} className="text-amber-400 shrink-0" />
                )}
                <span>
                  Phone: {hasPhone ? <strong className="text-white">{phone}</strong> : <span className="text-amber-400 font-medium">{t('settings.phone', 'Phone number required')}</span>}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                <span>Standard Transfers & Wallet</span>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs font-semibold border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-300"
              onClick={() => {
                setPhoneInput(phone || '');
                setShowTier1Modal(true);
              }}
            >
              {hasPhone ? t('kyc.edit_phone', 'Edit Phone Number') : t('kyc.add_phone', 'Add Phone Number for Tier 1')} <ChevronRight size={14} className="ml-1" />
            </Button>
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
                  <h3 className="font-bold text-white">{t('kyc.tier2_title', 'Tier 2: Banking')}</h3>
                  <p className="text-xs text-blue-400 font-medium">{t('kyc.tier2_limit', 'Daily Limit: 500,000 NGN')}</p>
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                currentTier >= 2 
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' 
                  : 'bg-white/5 text-gray-400 border-white/10'
              }`}>
                {currentTier >= 2 ? t('common.verified', 'VERIFIED') : 'LOCKED'}
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
                <CheckCircle2 size={14} /> Tier 2 {t('kyc.active', 'Active')}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs font-semibold border-blue-500/30 hover:bg-blue-500/10 text-blue-300"
                onClick={() => setShowTier2Modal(true)}
              >
                {t('kyc.upgrade_tier2', 'Upgrade to Tier 2')} <ChevronRight size={14} className="ml-1" />
              </Button>
            )}
          </div>
        </div>

        {/* TIER 3 CARD */}
        <div className={`relative rounded-2xl border p-5 transition-all flex flex-col justify-between ${
          currentTier >= 3 ? 'bg-purple-950/20 border-purple-500/30' : (isTier3Pending ? 'bg-amber-950/20 border-amber-500/30' : 'bg-white/5 border-white/10 hover:border-white/20')
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                  <Globe2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white">{t('kyc.tier3_title', 'Tier 3: Enterprise FX')}</h3>
                  <p className="text-xs text-purple-400 font-medium">{t('kyc.tier3_limit', 'Daily Limit: Unlimited')}</p>
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                currentTier >= 3 
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
                  : (isTier3Pending 
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : (isTier3Rejected
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          : 'bg-white/5 text-gray-400 border-white/10'))
              }`}>
                {currentTier >= 3 
                  ? t('common.verified', 'VERIFIED') 
                  : (isTier3Pending 
                      ? 'PENDING REVIEW' 
                      : (isTier3Rejected ? 'REJECTED' : 'LOCKED'))}
              </span>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-gray-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className={currentTier >= 3 ? 'text-purple-400' : 'text-gray-500'} />
                <span>USD / EUR / GBP Foreign Accounts</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className={currentTier >= 3 ? 'text-purple-400' : 'text-gray-500'} />
                <span>Requires Photo ID & Utility Bill Upload</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className={currentTier >= 3 ? 'text-purple-400' : 'text-gray-500'} />
                <span>High-Volume Cross Border Transfers</span>
              </div>

              {isTier3Pending && (
                <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                  <Clock size={14} className="shrink-0 animate-spin" />
                  <span>Your Tier 3 verification application is currently under compliance review.</span>
                </div>
              )}

              {isTier3Rejected && (
                <div className="mt-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertCircle size={14} className="shrink-0 text-rose-400" />
                    <span>Application Rejected</span>
                  </div>
                  {activeKycRequest?.rejection_reason && (
                    <p className="text-rose-200 text-[11px] leading-relaxed">
                      Reason: {activeKycRequest.rejection_reason}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 pb-2">
            {currentTier >= 3 ? (
              <div className="text-xs text-purple-400 font-medium flex items-center gap-1 min-h-[44px]">
                <CheckCircle2 size={14} /> Tier 3 {t('kyc.active', 'Active')}
              </div>
            ) : isTier3Pending ? (
              <Button
                variant="outline"
                size="sm"
                disabled
                className="w-full text-xs font-semibold border-amber-500/30 text-amber-300 opacity-60 cursor-not-allowed min-h-[44px] py-2.5"
              >
                Verification Pending Review
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs font-semibold border-purple-500/30 hover:bg-purple-500/10 text-purple-300 min-h-[44px] py-2.5"
                onClick={() => setShowTier3Modal(true)}
              >
                {isTier3Rejected ? 'Resubmit Tier 3 Documents' : t('kyc.upgrade_tier3', 'Upgrade to Tier 3')} <ChevronRight size={14} className="ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* TIER 1 MODAL */}
      {showTier1Modal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Smartphone className="text-emerald-400" size={20} />
                Tier 1: Phone Verification
              </h3>
              <button 
                onClick={() => setShowTier1Modal(false)}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              Add your phone number to complete Tier 1 Verification. This secures your account and enables standard wallet transfers.
            </p>
            <form onSubmit={handleTier1Submit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Phone Number</label>
                <Input
                  type="tel"
                  placeholder="e.g. +234 801 234 5678"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" type="button" onClick={() => setShowTier1Modal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                  {loading ? 'Saving...' : 'Save & Verify Tier 1'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

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
              Upload your Government ID and Utility Bill documents to unlock international USD, EUR, and GBP virtual accounts according to your plan limits.
            </p>
            <form onSubmit={handleTier3Submit} className="space-y-4">
              {/* Government ID File Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-300">
                  Government ID (Passport, Driver's License, National ID)
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-white/5 border border-white/10 rounded-xl">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => handleFileUpload(e, 'government_id')}
                    disabled={uploadingGovId || loading}
                    className="text-xs text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600/30 file:text-purple-200 hover:file:bg-purple-600/40 cursor-pointer"
                  />
                  {uploadingGovId && <span className="text-xs text-purple-400 animate-pulse">Uploading...</span>}
                  {!uploadingGovId && governmentIdStoragePath && (
                    <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 size={14} /> ✓ Uploaded ({governmentIdFileName || 'ID Document'})
                    </span>
                  )}
                </div>
              </div>

              {/* Utility Bill File Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-300">
                  Proof of Address / Utility Bill (Utility Bill, Bank Statement)
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-white/5 border border-white/10 rounded-xl">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => handleFileUpload(e, 'utility_bill')}
                    disabled={uploadingUtility || loading}
                    className="text-xs text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600/30 file:text-purple-200 hover:file:bg-purple-600/40 cursor-pointer"
                  />
                  {uploadingUtility && <span className="text-xs text-purple-400 animate-pulse">Uploading...</span>}
                  {!uploadingUtility && utilityBillStoragePath && (
                    <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 size={14} /> ✓ Uploaded ({utilityBillFileName || 'Utility Bill'})
                    </span>
                  )}
                </div>
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
                <Button 
                  type="submit" 
                  disabled={loading || uploadingGovId || uploadingUtility || !governmentIdStoragePath || !utilityBillStoragePath} 
                  className="bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                >
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
