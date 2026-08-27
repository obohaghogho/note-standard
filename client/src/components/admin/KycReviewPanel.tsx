import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle, XCircle, RefreshCw, FileText, ExternalLink, AlertCircle } from 'lucide-react';

interface KycRequest {
  id: string;
  user_id: string;
  requested_tier: number;
  status: string;
  government_id_storage_path?: string;
  utility_bill_storage_path?: string;
  residential_address?: any;
  occupation?: string;
  submitted_at: string;
  signedGovIdUrl?: string;
  signedUtilityBillUrl?: string;
  profiles?: {
    email: string;
    full_name: string;
    kyc_level: number;
    is_verified: boolean;
  };
}

export const KycReviewPanel: React.FC = () => {
  const [requests, setRequests] = useState<KycRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedReq, setSelectedReq] = useState<KycRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [reviewerNotes, setReviewerNotes] = useState<string>('');
  const [processing, setProcessing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchPendingRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/kyc/admin/pending', {
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setRequests(data.requests || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch pending KYC requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const handleSelectRequest = async (reqId: string) => {
    try {
      const res = await fetch(`/api/kyc/admin/${reqId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedReq(data.request);
      }
    } catch (err: any) {
      console.error('Failed to fetch request detail:', err);
    }
  };

  const handleAction = async (action: 'approve' | 'reject' | 'resubmit') => {
    if (!selectedReq) return;
    if ((action === 'reject' || action === 'resubmit') && !rejectionReason.trim()) {
      setFeedback({ type: 'error', message: 'A reason must be provided for rejection/resubmission.' });
      return;
    }

    setProcessing(true);
    setFeedback(null);
    try {
      const endpoint = `/api/kyc/admin/${selectedReq.id}/${action}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: rejectionReason,
          notes: reviewerNotes,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setFeedback({ type: 'success', message: data.message });
        setSelectedReq(null);
        setRejectionReason('');
        setReviewerNotes('');
        fetchPendingRequests();
      } else {
        throw new Error(data.error || 'Action failed.');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 bg-neutral-900 border border-white/10 rounded-2xl space-y-6 text-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-purple-400" size={28} />
          <div>
            <h2 className="text-xl font-bold">KYC & Verification Compliance Review</h2>
            <p className="text-xs text-gray-400">Server-authoritative tier promotion & document review queue</p>
          </div>
        </div>
        <button
          onClick={fetchPendingRequests}
          className="flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl transition"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2 ${feedback.type === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
          <AlertCircle size={16} />
          {feedback.message}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Loading pending KYC requests...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">No pending KYC verification requests.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* REQUESTS QUEUE */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pending Queue ({requests.length})</h3>
            {requests.map((req) => (
              <div
                key={req.id}
                onClick={() => handleSelectRequest(req.id)}
                className={`p-4 rounded-xl border transition cursor-pointer ${selectedReq?.id === req.id ? 'bg-purple-900/30 border-purple-500' : 'bg-neutral-800/50 border-white/5 hover:border-white/20'}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm">{req.profiles?.full_name || req.profiles?.email || req.user_id}</div>
                    <div className="text-xs text-gray-400">{req.profiles?.email}</div>
                  </div>
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs font-bold">
                    Tier {req.requested_tier} Request
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-xs text-gray-400">
                  <span>Current: Tier {req.profiles?.kyc_level || 0}</span>
                  <span>{new Date(req.submitted_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* DETAIL & ACTION PANEL */}
          <div className="bg-neutral-800/40 border border-white/10 rounded-xl p-5 space-y-4">
            {selectedReq ? (
              <>
                <div className="border-b border-white/10 pb-3">
                  <h3 className="font-bold text-base">Request Details</h3>
                  <p className="text-xs text-gray-400">ID: {selectedReq.id}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-400">User Email:</span>
                    <div className="font-medium">{selectedReq.profiles?.email}</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Requested Upgrade:</span>
                    <div className="font-bold text-purple-400">Tier {selectedReq.requested_tier}</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Occupation:</span>
                    <div>{selectedReq.occupation || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Address:</span>
                    <div>{typeof selectedReq.residential_address === 'object' ? JSON.stringify(selectedReq.residential_address) : selectedReq.residential_address || 'N/A'}</div>
                  </div>
                </div>

                {/* DOCUMENTS LINKS */}
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-semibold text-gray-400">Private Documents (Signed 15m Links):</span>
                  <div className="flex flex-col gap-2">
                    {selectedReq.signedGovIdUrl ? (
                      <a
                        href={selectedReq.signedGovIdUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-2.5 bg-neutral-900 border border-white/10 rounded-lg text-xs hover:border-purple-400 text-purple-300 transition"
                      >
                        <span className="flex items-center gap-2"><FileText size={14} /> Government ID Document</span>
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <div className="text-xs text-gray-500 italic">No Government ID document submitted</div>
                    )}

                    {selectedReq.signedUtilityBillUrl ? (
                      <a
                        href={selectedReq.signedUtilityBillUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-2.5 bg-neutral-900 border border-white/10 rounded-lg text-xs hover:border-purple-400 text-purple-300 transition"
                      >
                        <span className="flex items-center gap-2"><FileText size={14} /> Utility Bill / Address Proof</span>
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <div className="text-xs text-gray-500 italic">No Utility Bill document submitted</div>
                    )}
                  </div>
                </div>

                {/* REVIEW INPUTS */}
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Rejection / Resubmission Reason</label>
                    <input
                      type="text"
                      placeholder="Reason if rejecting or requesting resubmission..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Internal Reviewer Notes</label>
                    <input
                      type="text"
                      placeholder="Optional compliance audit notes..."
                      value={reviewerNotes}
                      onChange={(e) => setReviewerNotes(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-xs text-white"
                    />
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex gap-2 pt-2">
                  <button
                    disabled={processing}
                    onClick={() => handleAction('approve')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition"
                  >
                    <CheckCircle size={14} /> Approve Tier {selectedReq.requested_tier}
                  </button>
                  <button
                    disabled={processing}
                    onClick={() => handleAction('reject')}
                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition"
                  >
                    <XCircle size={14} /> Reject
                  </button>
                  <button
                    disabled={processing}
                    onClick={() => handleAction('resubmit')}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition"
                  >
                    <RefreshCw size={14} /> Resubmit
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-gray-500 text-xs">
                Select a KYC request from the queue to review submitted information and documents.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
