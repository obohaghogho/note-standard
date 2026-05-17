import React, { useEffect, useState } from "react";
import payoutApi from "../../api/payoutApi";
import type { ManualWithdrawal } from "../../api/payoutApi";
import { toast } from "react-hot-toast";
import { format } from "date-fns";
import { Loader2, Check, X, MessageSquare, AlertTriangle, Building, CreditCard, User, Globe } from "lucide-react";
import { Button } from "../common/Button";

const AdminWithdrawalPanel: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<ManualWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchPending();
  }, []);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const data = await payoutApi.getAdminPending();
      setWithdrawals(data);
    } catch {
      toast.error("Failed to load pending withdrawals.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    const withdrawal = withdrawals.find(w => w.id === id);
    if (!withdrawal) return;

    if (!window.confirm("Are you sure you have sent the funds via Grey? Approving this will mark the payout as completed.")) return;
    
    setProcessingId(id);
    try {
      await payoutApi.approve(id, adminNotes[id]);
      toast.success("Withdrawal approved successfully!");
      setWithdrawals(withdrawals.filter(w => w.id !== id));
    } catch (err: unknown) {
      const errorResponse = (err as Record<string, unknown>)?.response as Record<string, unknown>;
      const data = errorResponse?.data as Record<string, unknown>;
      toast.error(typeof data?.error === 'string' ? data.error : "Failed to approve withdrawal.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    const withdrawal = withdrawals.find(w => w.id === id);
    if (!withdrawal) return;

    const reason = adminNotes[id];
    if (!reason) {
      return toast.error("Please provide a reason for rejection in the notes field.");
    }

    if (!window.confirm("Are you sure you want to reject this withdrawal? The user's wallet will be automatically refunded.")) return;

    setProcessingId(id);
    try {
      await payoutApi.reject(id, reason);
      toast.success("Withdrawal rejected and funds refunded.");
      setWithdrawals(withdrawals.filter(w => w.id !== id));
    } catch (err: unknown) {
      const errorResponse = (err as Record<string, unknown>)?.response as Record<string, unknown>;
      const data = errorResponse?.data as Record<string, unknown>;
      toast.error(typeof data?.error === 'string' ? data.error : "Failed to reject withdrawal.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleNoteChange = (id: string, value: string) => {
    setAdminNotes(prev => ({ ...prev, [id]: value }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-slate-500 font-medium tracking-tight">Loading pending withdrawals...</p>
      </div>
    );
  }

  if (withdrawals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-3xl border-2 border-dashed border-emerald-100 dark:border-emerald-800/50">
        <div className="p-4 bg-emerald-100 dark:bg-emerald-900/30 rounded-full mb-6">
          <Check className="w-12 h-12 text-emerald-500 dark:text-emerald-400" />
        </div>
        <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-300 mb-2">All Clear!</h3>
        <p className="text-emerald-700/70 dark:text-emerald-400/60 text-center max-w-sm font-medium">
          There are no pending manual withdrawals to fulfill at the moment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Manual Withdrawal Fulfillment</h2>
        <span className="px-4 py-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full text-xs font-black uppercase tracking-widest">
            {withdrawals.length} PENDING
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {withdrawals.map((withdrawal) => (
          <div 
            key={withdrawal.id} 
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
          >
            <div className="p-6 md:p-8 flex flex-col lg:flex-row gap-8">
              {/* User & Amount Info */}
              <div className="flex-1 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-xl">
                        {withdrawal.profile?.username?.[0].toUpperCase() || "U"}
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-white">{withdrawal.profile?.full_name || withdrawal.profile?.username}</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{withdrawal.profile?.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Requested Amount</p>
                        <p className="text-xl font-black text-rose-600 dark:text-rose-400">{withdrawal.currency} {withdrawal.amount.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-black rounded border border-amber-200 dark:border-amber-800 uppercase">
                                {withdrawal.status.replace('_', ' ')}
                            </span>
                        </div>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Requested On</p>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                            {format(new Date(withdrawal.created_at), "MMMM d, yyyy 'at' h:mm a")}
                        </p>
                    </div>
                </div>
              </div>

              {/* Bank Details & Notes */}
              <div className="flex-1 space-y-6">
                <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                        <Building className="w-3 h-3" />
                        Destination Bank Details
                    </label>
                    <div className="space-y-3 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                        {withdrawal.destination?.bank_name && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 flex items-center gap-1.5"><Building className="w-3.5 h-3.5" /> Bank Name</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300">{withdrawal.destination.bank_name}</span>
                            </div>
                        )}
                        {withdrawal.destination?.account_name && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Account Name</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300">{withdrawal.destination.account_name}</span>
                            </div>
                        )}
                        {withdrawal.destination?.account_number && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Account Number</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{withdrawal.destination.account_number}</span>
                            </div>
                        )}
                        {withdrawal.destination?.iban && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> IBAN</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{withdrawal.destination.iban}</span>
                            </div>
                        )}
                        {withdrawal.destination?.sort_code && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Sort Code</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{withdrawal.destination.sort_code}</span>
                            </div>
                        )}
                        {withdrawal.destination?.routing_number && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Routing Number</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{withdrawal.destination.routing_number}</span>
                            </div>
                        )}
                        {withdrawal.destination?.swift_code && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> SWIFT Code</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{withdrawal.destination.swift_code}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="relative">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Internal Notes / Rejection Reason</label>
                    <div className="relative">
                        <MessageSquare className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                        <textarea 
                            id={`admin-note-${withdrawal.id}`}
                            name={`adminNote-${withdrawal.id}`}
                            value={adminNotes[withdrawal.id] || ""}
                            onChange={(e) => handleNoteChange(withdrawal.id, e.target.value)}
                            placeholder="Add notes or a reason if rejecting..."
                            className="w-full h-24 pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none text-slate-700 dark:text-slate-300 resize-none font-medium"
                        />
                    </div>
                </div>
              </div>

              {/* Actions */}
              <div className="lg:w-48 flex flex-col gap-3 justify-center">
                <Button 
                    variant="primary" 
                    onClick={() => handleApprove(withdrawal.id)}
                    loading={processingId === withdrawal.id}
                    disabled={!!processingId}
                    className="h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-lg shadow-emerald-600/20 w-full"
                >
                    <Check className="w-5 h-5 mr-2" /> Mark Sent
                </Button>
                <Button 
                    variant="secondary" 
                    onClick={() => handleReject(withdrawal.id)}
                    loading={processingId === withdrawal.id}
                    disabled={!!processingId}
                    className="h-14 rounded-2xl border-rose-100 dark:border-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-900/10 text-rose-600 dark:text-rose-400 font-bold w-full"
                >
                    <X className="w-5 h-5 mr-2" /> Reject & Refund
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminWithdrawalPanel;
