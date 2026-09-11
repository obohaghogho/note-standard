import React, { useEffect, useState, useCallback } from "react";
import depositApi from "../../api/depositApi";
import type { ManualDeposit } from "../../api/depositApi";
import { toast } from "react-hot-toast";
import { format } from "date-fns";
import {
  Loader2, Check, X, ExternalLink, MessageSquare,
  AlertTriangle, ShieldCheck, Settings2, Zap,
  ShieldAlert, RefreshCw, ToggleLeft, ToggleRight,
  Info, Clock, BadgeCheck
} from "lucide-react";
import { Button } from "../common/Button";
import { API_URL } from "../../lib/api";

/* ─────────────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────────────── */
interface AutoCreditConfig {
  enabled: boolean;
  limit_ngn: number;
  limit_usd: number;
  limit_eur: number;
  limit_gbp: number;
  require_proof: boolean;
  notify_admin_on_high: boolean;
}

type TabKey = "all" | "pending" | "pending_admin_review" | "approved" | "rejected";

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */
const resolveProofUrl = (url?: string) => {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("blob:")) return url;
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return `${API_URL}${cleanUrl}`;
};

const statusStyle = (status: string) => {
  switch (status) {
    case "approved":         return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "rejected":         return "bg-rose-500/20 text-rose-300 border-rose-500/30";
    case "pending_admin_review": return "bg-orange-500/20 text-orange-300 border-orange-500/30";
    default:                 return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   Auto-Credit Settings Sub-Panel
───────────────────────────────────────────────────────────────────────────── */
const AutoCreditSettingsPanel: React.FC = () => {
  const [config, setConfig] = useState<AutoCreditConfig>({
    enabled: true,
    limit_ngn: 50000,
    limit_usd: 50,
    limit_eur: 50,
    limit_gbp: 40,
    require_proof: true,
    notify_admin_on_high: true,
  });
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [dirty,   setDirty]     = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token") || "";
      const res = await fetch(`${API_URL}/api/admin/deposit-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data = await res.json();
      setConfig(data.value || data);
    } catch (e: any) {
      toast.error(e?.message || "Could not load auto-credit settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleChange = (key: keyof AutoCreditConfig, value: number | boolean) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token") || "";
      const res = await fetch(`${API_URL}/api/admin/deposit-settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
      toast.success("Auto-credit settings saved successfully!");
      setDirty(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-medium">Loading auto-credit configuration…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Master Toggle */}
      <div className="flex items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-indigo-950/60 to-violet-950/60 border border-indigo-800/40">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/20">
            <Zap className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Auto-Credit System</p>
            <p className="text-xs text-indigo-300/70 mt-0.5">
              {config.enabled
                ? "Active — deposits within limits are credited instantly"
                : "Disabled — all deposits require admin approval"}
            </p>
          </div>
        </div>
        <button
          onClick={() => handleChange("enabled", !config.enabled)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all"
          style={{ background: config.enabled ? "rgba(99,102,241,0.2)" : "rgba(100,116,139,0.15)" }}
        >
          {config.enabled
            ? <><ToggleRight className="w-6 h-6 text-indigo-400" /><span className="text-indigo-300">ON</span></>
            : <><ToggleLeft className="w-6 h-6 text-slate-500" /><span className="text-slate-400">OFF</span></>}
        </button>
      </div>

      {/* Per-Currency Limits */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Per-Currency Auto-Credit Limits</p>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 mb-4 flex gap-2">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 leading-relaxed">
            Deposits <strong>at or below</strong> the limit with proof are auto-credited instantly.
            Deposits <strong>above</strong> the limit are queued for admin review — no funds are credited until you manually approve.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([
            { key: "limit_ngn", label: "NGN Limit", symbol: "₦" },
            { key: "limit_usd", label: "USD Limit", symbol: "$" },
            { key: "limit_eur", label: "EUR Limit", symbol: "€" },
            { key: "limit_gbp", label: "GBP Limit", symbol: "£" },
          ] as const).map(({ key, label, symbol }) => (
            <div key={key} className="space-y-1.5">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">{symbol}</span>
                <input
                  type="number"
                  value={config[key]}
                  min={0}
                  onChange={e => handleChange(key, parseFloat(e.target.value) || 0)}
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm font-bold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          { key: "require_proof",         label: "Require Proof for Auto-Credit",       desc: "Proof of payment must be uploaded for instant crediting" },
          { key: "notify_admin_on_high",  label: "Notify Admin on High-Value Deposits", desc: "Send an alert when a deposit exceeds the auto-credit limit" },
        ] as const).map(({ key, label, desc }) => (
          <button
            key={key}
            onClick={() => handleChange(key, !config[key])}
            className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
              config[key]
                ? "bg-indigo-500/10 border-indigo-500/30"
                : "bg-slate-800/40 border-slate-700/50"
            }`}
          >
            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
              config[key] ? "border-indigo-400 bg-indigo-400" : "border-slate-500"
            }`}>
              {config[key] && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Save */}
      {dirty && (
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button onClick={fetchConfig} className="px-4 py-2 rounded-xl text-slate-400 text-sm font-semibold hover:text-white transition-colors">
            Discard Changes
          </button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/20"
          >
            <Check className="w-4 h-4 mr-2" /> Save Settings
          </Button>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   Main AdminDepositPanel
───────────────────────────────────────────────────────────────────────────── */
const AdminDepositPanel: React.FC = () => {
  const [deposits,     setDeposits]     = useState<ManualDeposit[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState<TabKey>("pending_admin_review");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminNotes,   setAdminNotes]   = useState<Record<string, string>>({});
  const [showSettings, setShowSettings] = useState(false);

  const TABS: { key: TabKey; label: string; badge?: string }[] = [
    { key: "pending_admin_review", label: "🔴 Needs Review" },
    { key: "pending",              label: "Pending" },
    { key: "approved",             label: "Approved" },
    { key: "rejected",             label: "Rejected" },
    { key: "all",                  label: "All" },
  ];

  const fetchDeposits = useCallback(async (tab: TabKey = activeTab) => {
    setLoading(true);
    try {
      const data = await depositApi.getAdminPending(tab);
      setDeposits(data);
    } catch {
      toast.error("Failed to load deposits.");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { fetchDeposits(activeTab); }, [activeTab]);

  const handleApprove = async (id: string) => {
    const deposit = deposits.find(d => d.id === id);
    if (!deposit) return;

    // Safeguard: block re-approval of already-credited deposits
    if ((deposit as any).wallet_credited) {
      toast.error("This deposit has already been credited. Re-approval is blocked to prevent double-crediting.");
      return;
    }

    if (!window.confirm("Approve this deposit and credit the user's wallet?")) return;

    setProcessingId(id);
    try {
      await depositApi.approve(id, adminNotes[id], !!deposit.isUnified);
      toast.success("Deposit approved and wallet credited!");
      fetchDeposits(activeTab);
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.alreadyCredited) {
        toast.error("Deposit was already credited — no double credit applied.");
        fetchDeposits(activeTab);
      } else {
        toast.error(data?.error || "Failed to approve deposit.");
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    const deposit = deposits.find(d => d.id === id);
    if (!deposit) return;

    if ((deposit as any).wallet_credited) {
      toast.error("Cannot reject an already-credited deposit.");
      return;
    }

    const reason = adminNotes[id];
    if (!reason) return toast.error("Provide a rejection reason in the notes field first.");
    if (!window.confirm("Reject this deposit?")) return;

    setProcessingId(id);
    try {
      await depositApi.reject(id, reason, !!deposit.isUnified);
      toast.success("Deposit rejected.");
      fetchDeposits(activeTab);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to reject deposit.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
            Manual Deposit Management
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Deposits within the auto-credit limit are credited instantly. High-value deposits appear here
            under <strong className="text-orange-400">Needs Review</strong> and require manual approval.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchDeposits(activeTab)}
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-500 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSettings(s => !s)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
              showSettings
                ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-500"
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Auto-Credit Limits
          </button>
        </div>
      </div>

      {/* ── Auto-Credit Settings Panel (collapsible) ── */}
      {showSettings && (
        <div className="bg-slate-900/80 border border-slate-700/60 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-slate-800">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Settings2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-black text-white text-sm">Auto-Credit Configuration</h3>
              <p className="text-xs text-slate-400">Configure when deposits are credited automatically vs requiring admin review</p>
            </div>
          </div>
          <AutoCreditSettingsPanel />
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold capitalize whitespace-nowrap transition-all flex-shrink-0 ${
              activeTab === tab.key
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Deposit List ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
          <p className="text-slate-500 font-medium">Loading deposits…</p>
        </div>
      ) : deposits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-3xl border-2 border-dashed border-emerald-100 dark:border-emerald-800/50">
          <div className="p-4 bg-emerald-100 dark:bg-emerald-900/30 rounded-full mb-6">
            <BadgeCheck className="w-12 h-12 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-300 mb-2">
            {activeTab === "pending_admin_review" ? "No deposits awaiting review" : "No deposits found"}
          </h3>
          <p className="text-emerald-700/70 dark:text-emerald-400/60 text-center max-w-sm font-medium text-sm">
            {activeTab === "pending_admin_review"
              ? "All high-value deposits have been processed. New deposits within the limit are credited automatically."
              : `No deposits match the "${activeTab}" filter.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {deposits.map(deposit => {
            const resolvedProof = resolveProofUrl(deposit.proof_url);
            const isApproved    = deposit.status === "approved";
            const isRejected    = deposit.status === "rejected";
            const isReview      = deposit.status === "pending_admin_review";
            const isPending     = deposit.status === "pending" || isReview;
            const isCredited    = !!(deposit as any).wallet_credited;
            const autoCredited  = !!(deposit as any).auto_credit_applied;
            const reviewReason  = (deposit as any).review_reason;

            return (
              <div
                key={deposit.id}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                {/* Status banner for high-value review deposits */}
                {isReview && (
                  <div className="px-6 py-3 bg-orange-500/10 border-b border-orange-500/20 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-orange-300">High-Value Deposit — Admin Review Required</p>
                      {reviewReason && <p className="text-[11px] text-orange-400/70 mt-0.5">{reviewReason}</p>}
                    </div>
                  </div>
                )}

                {/* Auto-credited banner */}
                {autoCredited && (
                  <div className="px-6 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    <p className="text-xs font-bold text-emerald-300">Auto-credited instantly — within auto-credit limit</p>
                  </div>
                )}

                <div className="p-6 md:p-8 flex flex-col lg:flex-row gap-8">
                  {/* ── Left: User & Amount Info ── */}
                  <div className="flex-1 space-y-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-xl">
                        {deposit.profile?.username?.[0]?.toUpperCase() || deposit.profile?.email?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-white">
                          {deposit.profile?.full_name || deposit.profile?.username || "User"}
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{deposit.profile?.email}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Amount</p>
                        <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                          {deposit.currency} {deposit.amount?.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-1 text-[10px] font-black rounded-md uppercase tracking-wider border ${statusStyle(deposit.status)}`}>
                            {deposit.status.replace(/_/g, " ")}
                          </span>
                          {isCredited && (
                            <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-black rounded border border-emerald-500/20">
                              WALLET CREDITED
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reference</p>
                        <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">{deposit.reference}</p>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center gap-1.5 text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        <p className="text-xs font-medium">
                          {format(new Date(deposit.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ── Middle: Proof & Notes ── */}
                  <div className="flex-1 space-y-5">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                        Payment Proof
                      </label>
                      {resolvedProof ? (
                        <a
                          href={resolvedProof}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative block w-full aspect-video rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-800 hover:border-indigo-500 transition-all shadow-inner"
                        >
                          <img
                            src={resolvedProof}
                            alt="Payment Proof"
                            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                            onError={e => { (e.target as HTMLElement).style.display = "none"; }}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white flex items-center gap-2 text-xs font-bold">
                              <ExternalLink className="w-5 h-5" /> Open Receipt
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
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                        {isPending ? "Admin Notes / Rejection Reason" : "Admin Notes"}
                      </label>
                      <div className="relative">
                        <MessageSquare className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                        <textarea
                          id={`admin-note-${deposit.id}`}
                          value={adminNotes[deposit.id] !== undefined ? adminNotes[deposit.id] : deposit.admin_notes || ""}
                          onChange={e => setAdminNotes(prev => ({ ...prev, [deposit.id]: e.target.value }))}
                          disabled={!isPending || isCredited}
                          placeholder={isPending ? "Add notes or rejection reason…" : "No notes"}
                          className="w-full h-24 pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none text-slate-700 dark:text-slate-300 resize-none font-medium disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Right: Actions ── */}
                  <div className="lg:w-52 flex flex-col gap-3 justify-center">
                    {isPending && !isCredited ? (
                      <>
                        <Button
                          variant="primary"
                          onClick={() => handleApprove(deposit.id)}
                          loading={processingId === deposit.id}
                          disabled={!!processingId}
                          className="h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-lg shadow-emerald-600/20 w-full"
                        >
                          <Check className="w-5 h-5 mr-2" /> Approve & Credit
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
                        <p className="text-[10px] text-center text-slate-400 leading-relaxed">
                          Approving will instantly credit the user's wallet via the secure ledger engine.
                        </p>
                      </>
                    ) : (
                      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center space-y-2">
                        {isCredited || isApproved ? (
                          <>
                            <ShieldCheck className="w-9 h-9 mx-auto text-emerald-400" />
                            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Credited</div>
                            <div className="text-[10px] text-emerald-400 font-semibold">Wallet updated ✓</div>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-9 h-9 mx-auto text-rose-400" />
                            <div className="text-sm font-bold text-slate-700 dark:text-slate-300 capitalize">
                              {deposit.status.replace(/_/g, " ")}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminDepositPanel;
