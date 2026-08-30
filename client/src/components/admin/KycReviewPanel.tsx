import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle, XCircle, RefreshCw, FileText, ExternalLink, AlertCircle, X, Maximize2 } from 'lucide-react';
import api from '../../api/axiosInstance';
import { API_URL } from '../../lib/api';

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
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const resolveDocumentUrl = (url?: string) => {
    if (!url) return undefined;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return `${API_URL}${cleanUrl}`;
  };

  const formatAddress = (addr: any) => {
    if (!addr) return 'N/A';
    if (typeof addr === 'string') {
      try {
        const parsed = JSON.parse(addr);
        return parsed.address || parsed.street || addr;
      } catch {
        return addr;
      }
    }
    if (typeof addr === 'object') {
      return addr.address || addr.street || JSON.stringify(addr);
    }
    return String(addr);
  };

  const fetchPendingRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get('/kyc/admin/pending');
      if (res.data?.success) {
        setRequests(res.data.requests || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch pending KYC requests:', err);
      setFeedback({ type: 'error', message: err.response?.data?.error || err.message || 'Failed to fetch pending KYC requests.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const handleSelectRequest = async (reqId: string) => {
    try {
      const res = await api.get(`/kyc/admin/${reqId}`);
      if (res.data?.success) {
        setSelectedReq(res.data.request);
      }
    } catch (err: any) {
      console.error('Failed to fetch request detail:', err);
      setFeedback({ type: 'error', message: err.response?.data?.error || err.message || 'Failed to fetch request detail.' });
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
      const res = await api.post(`/kyc/admin/${selectedReq.id}/${action}`, {
        reason: rejectionReason,
        notes: reviewerNotes,
      });

      if (res.data?.success) {
        setFeedback({ type: 'success', message: res.data.message });
        setSelectedReq(null);
        setRejectionReason('');
        setReviewerNotes('');
        fetchPendingRequests();
      } else {
        throw new Error(res.data?.error || 'Action failed.');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.response?.data?.error || err.message || 'Action failed.' });
    } finally {
      setProcessing(false);
    }
  };

  const renderDocumentCard = (title: string, rawUrl?: string) => {
    const fullUrl = resolveDocumentUrl(rawUrl);
    if (!fullUrl) {
      return (
        <div className="p-3 bg-neutral-900 border border-white/5 rounded-xl text-xs text-gray-500 italic">
          No {title} submitted
        </div>
      );
    }

    return (
      <div className="bg-neutral-900 border border-white/10 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-purple-300 flex items-center gap-1.5">
            <FileText size={14} /> {title}
          </span>
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            className="text-purple-400 hover:text-purple-300 flex items-center gap-1 text-[11px] font-medium bg-purple-500/10 border border-purple-500/20 px-2 py-1 rounded-lg"
          >
            Open Full <ExternalLink size={12} />
          </a>
        </div>

        {/* Inline Image Preview Frame */}
        <div
          onClick={() => setPreviewImageUrl(fullUrl)}
          className="relative group overflow-hidden rounded-lg border border-white/10 bg-black/60 min-h-[140px] max-h-60 flex items-center justify-center cursor-pointer"
        >
          <img
            src={fullUrl}
            alt={title}
            className="max-h-56 w-full object-contain rounded transition-transform duration-200 group-hover:scale-105"
            onError={(e) => {
              // Hide broken image placeholder if document is a PDF or unsupported file
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold transition-opacity gap-1.5">
            <Maximize2 size={16} /> Tap to Zoom Image
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 bg-neutral-900 border border-white/10 rounded-2xl space-y-6 text-white">
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
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2 ${feedback.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
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
          <div className="bg-neutral-800/40 border border-white/10 rounded-xl p-4 sm:p-5 space-y-4">
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
                    <div className="text-gray-200">{formatAddress(selectedReq.residential_address)}</div>
                  </div>
                </div>

                {/* INLINE DOCUMENTS PREVIEWS */}
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-semibold text-gray-300 block">Submitted Compliance Documents:</span>
                  <div className="space-y-3">
                    {renderDocumentCard('Government ID Document', selectedReq.signedGovIdUrl)}
                    {renderDocumentCard('Utility Bill / Address Proof', selectedReq.signedUtilityBillUrl)}
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
                      className="w-full bg-neutral-900 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Internal Reviewer Notes</label>
                    <input
                      type="text"
                      placeholder="Optional compliance audit notes..."
                      value={reviewerNotes}
                      onChange={(e) => setReviewerNotes(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* RESPONSIVE TOUCH ACTION BUTTONS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3">
                  <button
                    disabled={processing}
                    onClick={() => handleAction('approve')}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white min-h-[46px] py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle size={16} /> Approve Tier {selectedReq.requested_tier}
                  </button>
                  <button
                    disabled={processing}
                    onClick={() => handleAction('reject')}
                    className="w-full bg-rose-600 hover:bg-rose-500 text-white min-h-[46px] py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg disabled:opacity-50 cursor-pointer"
                  >
                    <XCircle size={16} /> Reject
                  </button>
                  <button
                    disabled={processing}
                    onClick={() => handleAction('resubmit')}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white min-h-[46px] py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw size={16} /> Resubmit
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

      {/* ENLARGED IMAGE LIGHTBOX MODAL */}
      {previewImageUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setPreviewImageUrl(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition cursor-pointer"
            >
              <X size={24} />
            </button>
            <img
              src={previewImageUrl}
              alt="KYC Document Preview"
              className="max-h-[85vh] max-w-full object-contain rounded-xl border border-white/20 shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};

