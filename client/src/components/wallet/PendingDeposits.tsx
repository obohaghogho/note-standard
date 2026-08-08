import React, { useState, useEffect } from 'react';
import { Clock, ShieldCheck, CheckCircle2, AlertCircle, Upload, Loader2, ArrowRight, FileText, RefreshCw } from 'lucide-react';
import walletApi from '../../api/walletApi';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

interface PendingDeposit {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  provider: string;
  paymentStatus: string;
  receiptStatus: string;
  walletCreditStatus: string;
  reconciliationStatus: string;
  receiptUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PendingDeposits: React.FC<{ onRefreshWallets?: () => void }> = ({ onRefreshWallets }) => {
  const [deposits, setDeposits] = useState<PendingDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const fetchPendingDeposits = async () => {
    try {
      const res = await walletApi.getPendingDeposits();
      if (res.success) {
        setDeposits(res.deposits || []);
      }
    } catch (err) {
      console.error('Failed to fetch pending deposits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingDeposits();
    const interval = setInterval(fetchPendingDeposits, 15000); // Polling every 15s
    return () => clearInterval(interval);
  }, []);

  const handleFileUpload = async (deposit: PendingDeposit, file: File) => {
    setUploadingId(deposit.id);
    try {
      let publicUrl = '';
      const fileExt = file.name.split('.').pop();
      const fileName = `${deposit.reference}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `deposit-proofs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file);

      if (!uploadError) {
        const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
        publicUrl = data.publicUrl;
      } else {
        // Fallback Base64 reader if storage fails
        publicUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
      }

      await walletApi.submitDepositProof({
        reference: deposit.reference,
        proof_url: publicUrl,
        amount: deposit.amount,
        currency: deposit.currency,
      });

      toast.success('Receipt uploaded successfully!');
      fetchPendingDeposits();
      onRefreshWallets?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload receipt');
    } finally {
      setUploadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-xl flex items-center justify-center gap-2 text-xs text-gray-400">
        <Loader2 className="animate-spin" size={14} />
        Loading pending deposits...
      </div>
    );
  }

  if (deposits.length === 0) {
    return null; // Don't render section if no pending deposits
  }

  return (
    <div className="space-y-3 my-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="text-amber-400" size={16} />
          <h3 className="text-sm font-bold text-white tracking-wide">Pending Deposits ({deposits.length})</h3>
        </div>
        <button
          onClick={fetchPendingDeposits}
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="space-y-2.5">
        {deposits.map((dep) => (
          <div
            key={dep.id}
            className="p-4 bg-gray-900/90 border border-gray-800 hover:border-gray-700 rounded-xl space-y-3 transition-all"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800/60 pb-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-base">
                    {dep.currency} {dep.amount.toLocaleString()}
                  </span>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 font-bold px-2 py-0.5 rounded-full uppercase">
                    {dep.provider} Bank Transfer
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 font-mono mt-0.5">Ref: {dep.reference}</p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-gray-500 block">Initiated</span>
                <span className="text-[11px] text-gray-400">{new Date(dep.createdAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Status Badges Matrix */}
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              {/* Payment Status Badge */}
              <div className="p-2 bg-gray-800/60 rounded-lg space-y-0.5">
                <span className="text-gray-400 text-[9px] uppercase font-bold block">Payment Status</span>
                {dep.paymentStatus === 'WALLET_CREDITED' || dep.paymentStatus === 'PAYMENT_CONFIRMED' ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 size={12} /> Confirmed
                  </span>
                ) : dep.paymentStatus === 'PAYMENT_FAILED' ? (
                  <span className="text-red-400 font-bold flex items-center gap-1">
                    <AlertCircle size={12} /> Failed
                  </span>
                ) : (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Verifying...
                  </span>
                )}
              </div>

              {/* Receipt Status Badge */}
              <div className="p-2 bg-gray-800/60 rounded-lg space-y-0.5">
                <span className="text-gray-400 text-[9px] uppercase font-bold block">Receipt Status</span>
                {dep.receiptStatus === 'UPLOADED' || dep.receiptStatus === 'VERIFIED' ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <FileText size={12} /> Uploaded
                  </span>
                ) : (
                  <span className="text-gray-400 font-bold flex items-center gap-1">
                    <Clock size={12} /> Optional / Not Provided
                  </span>
                )}
              </div>

              {/* Wallet Credit Status Badge */}
              <div className="p-2 bg-gray-800/60 rounded-lg space-y-0.5">
                <span className="text-gray-400 text-[9px] uppercase font-bold block">Wallet Credit</span>
                {dep.walletCreditStatus === 'WALLET_CREDITED' ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <ShieldCheck size={12} /> Credited
                  </span>
                ) : (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <Clock size={12} /> Pending Credit
                  </span>
                )}
              </div>
            </div>

            {/* Optional Receipt Upload & Actions */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-800/40">
              <p className="text-[11px] text-gray-400">
                {dep.paymentStatus === 'PAYMENT_CONFIRMED'
                  ? 'Payment confirmed by provider! Wallet credit in progress.'
                  : 'Your bank transfer is being verified. Funds will credit automatically upon confirmation.'}
              </p>

              <div>
                <input
                  type="file"
                  id={`receipt-upload-${dep.id}`}
                  className="hidden"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleFileUpload(dep, e.target.files[0]);
                    }
                  }}
                />
                {dep.receiptStatus === 'NOT_PROVIDED' && (
                  <label
                    htmlFor={`receipt-upload-${dep.id}`}
                    className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-purple-300 rounded-md text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 border border-purple-500/30"
                  >
                    {uploadingId === dep.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    Upload Receipt
                  </label>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
