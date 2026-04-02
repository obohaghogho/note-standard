import React, { useEffect, useState } from "react";
import depositApi from "../../api/depositApi";
import type { ManualDeposit } from "../../api/depositApi";
import { toast } from "react-hot-toast";
import { format } from "date-fns";
import { Loader2, Check, X, ExternalLink, MessageSquare, AlertTriangle } from "lucide-react";
import { Button } from "../common/Button";

const AdminDepositPanel: React.FC = () => {
  const [deposits, setDeposits] = useState<ManualDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchPending();
  }, []);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const data = await depositApi.getAdminPending();
      setDeposits(data);
    } catch {
      toast.error("Failed to load pending deposits.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!window.confirm("Are you sure you want to approve this deposit and credit the user's wallet?")) return;
    
    setProcessingId(id);
    try {
      await depositApi.approve(id, adminNotes[id]);
      toast.success("Deposit approved successfully!");
      setDeposits(deposits.filter(d => d.id !== id));
    } catch (err: unknown) {
      const errorResponse = (err as Record<string, unknown>)?.response as Record<string, unknown>;
      const data = errorResponse?.data as Record<string, unknown>;
      toast.error(typeof data?.error === 'string' ? data.error : "Failed to approve deposit.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = adminNotes[id];
    if (!reason) {
      return toast.error("Please provide a reason for rejection in the notes field.");
    }

    if (!window.confirm("Are you sure you want to reject this deposit?")) return;

    setProcessingId(id);
    try {
      await depositApi.reject(id, reason);
      toast.success("Deposit rejected.");
      setDeposits(deposits.filter(d => d.id !== id));
    } catch (err: unknown) {
      const errorResponse = (err as Record<string, unknown>)?.response as Record<string, unknown>;
      const data = errorResponse?.data as Record<string, unknown>;
      toast.error(typeof data?.error === 'string' ? data.error : "Failed to reject deposit.");
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
        <p className="text-slate-500 font-medium tracking-tight">Loading pending deposits...</p>
      </div>
    );
  }

  if (deposits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-3xl border-2 border-dashed border-emerald-100 dark:border-emerald-800/50">
        <div className="p-4 bg-emerald-100 dark:bg-emerald-900/30 rounded-full mb-6">
          <Check className="w-12 h-12 text-emerald-500 dark:text-emerald-400" />
        </div>
        <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-300 mb-2">All Clear!</h3>
        <p className="text-emerald-700/70 dark:text-emerald-400/60 text-center max-w-sm font-medium">
          There are no pending manual deposits to review at the moment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Manual Deposit Review</h2>
        <span className="px-4 py-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full text-xs font-black uppercase tracking-widest">
            {deposits.length} PENDING
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {deposits.map((deposit) => (
          <div 
            key={deposit.id} 
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
          >
            <div className="p-6 md:p-8 flex flex-col lg:flex-row gap-8">
              {/* User & Amount Info */}
              <div className="flex-1 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-xl">
                        {deposit.profile?.username?.[0].toUpperCase() || "U"}
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-white">{deposit.profile?.full_name || deposit.profile?.username}</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{deposit.profile?.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Requested Amount</p>
                        <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{deposit.currency} {deposit.amount.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reference</p>
                        <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">{deposit.reference}</p>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Submitted On</p>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                            {format(new Date(deposit.created_at), "MMMM d, yyyy 'at' h:mm a")}
                        </p>
                    </div>
                </div>
              </div>

              {/* Proof & Notes */}
              <div className="flex-1 space-y-6">
                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Payment Proof</label>
                    {deposit.proof_url ? (
                        <a 
                            href={deposit.proof_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="group relative block w-full aspect-video rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-800 hover:border-indigo-500 transition-all shadow-inner"
                        >
                            <img src={deposit.proof_url} alt="Payment Proof" className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <div className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white">
                                    <ExternalLink className="w-6 h-6" />
                                </div>
                            </div>
                        </a>
                    ) : (
                        <div className="w-full aspect-video rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 text-slate-400">
                            <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                            <p className="text-xs font-bold uppercase tracking-widest">No proof uploaded</p>
                        </div>
                    )}
                </div>

                <div className="relative">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Internal Notes / Rejection Reason</label>
                    <div className="relative">
                        <MessageSquare className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                        <textarea 
                            value={adminNotes[deposit.id] || ""}
                            onChange={(e) => handleNoteChange(deposit.id, e.target.value)}
                            placeholder="Add notes for approval or a reason for rejection..."
                            className="w-full h-24 pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none text-slate-700 dark:text-slate-300 resize-none font-medium"
                        />
                    </div>
                </div>
              </div>

              {/* Actions */}
              <div className="lg:w-48 flex flex-col gap-3 justify-center">
                <Button 
                    variant="primary" 
                    onClick={() => handleApprove(deposit.id)}
                    loading={processingId === deposit.id}
                    disabled={!!processingId}
                    className="h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-lg shadow-emerald-600/20 w-full"
                >
                    <Check className="w-5 h-5 mr-2" /> Approve
                </Button>
                <Button 
                    variant="secondary" 
                    onClick={() => handleReject(deposit.id)}
                    loading={processingId === deposit.id}
                    disabled={!!processingId}
                    className="h-14 rounded-2xl border-rose-100 dark:border-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-900/10 text-rose-600 dark:text-rose-400 font-bold w-full"
                >
                    <X className="w-5 h-5 mr-2" /> Reject
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDepositPanel;
