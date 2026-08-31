import React, { useState, useEffect } from "react";
import { Landmark, Copy, Check, ShieldCheck, Loader2 } from "lucide-react";
import { anchorApi, type AnchorAccount } from "../../services/anchorApi";
import toast from "react-hot-toast";

export const AnchorAccountCard: React.FC = () => {
  const [account, setAccount] = useState<AnchorAccount | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const fetchAnchorAccount = async () => {
      try {
        setLoading(true);
        const accounts = await anchorApi.getAccounts();
        if (isMounted && accounts.length > 0) {
          setAccount(accounts[0]);
        }
      } catch (err) {
        console.warn("[AnchorAccountCard] Failed loading Anchor accounts:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAnchorAccount();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreateVirtualAccount = async () => {
    try {
      setCreating(true);
      const newAcc = await anchorApi.createVirtualAccount({});
      setAccount(newAcc);
      toast.success("Anchor Virtual NUBAN Account generated successfully!");
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to generate Anchor Virtual Account");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Account number copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="bg-gray-800/40 backdrop-blur border border-gray-700/60 rounded-2xl p-5 flex items-center justify-center min-h-[140px]">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-emerald-950/40 via-gray-900/60 to-gray-900/80 backdrop-blur border border-emerald-500/20 rounded-2xl p-5 shadow-xl relative overflow-hidden">
      {/* Top Header Badge */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Anchor Virtual Account</h4>
            <p className="text-xs text-gray-400">Dedicated NGN NUBAN</p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <ShieldCheck className="w-3.5 h-3.5" />
          Active
        </span>
      </div>

      {/* Main Content */}
      {account ? (
        <div className="space-y-3 bg-gray-950/40 border border-gray-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Bank Name</span>
            <span className="text-xs font-semibold text-gray-200">{account.bank_name || account.bankName || "9 Payment Service Bank (9PSB)"}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Account Name</span>
            <span className="text-xs font-semibold text-gray-200">{account.account_name || account.accountName || "Account Holder"}</span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-gray-800/60">
            <span className="text-xs text-gray-400 font-medium">NUBAN Number</span>
            <div className="flex items-center gap-2">
              <span className="text-base font-mono font-bold tracking-wider text-emerald-400">
                {account.account_number || account.accountNumber}
              </span>
              <button
                onClick={() => handleCopy(account.account_number || account.accountNumber || "")}
                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all active:scale-95"
                title="Copy Account Number"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-4 space-y-3">
          <p className="text-xs text-gray-400">No dedicated Anchor NUBAN account generated yet.</p>
          <button
            onClick={handleCreateVirtualAccount}
            disabled={creating}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating NUBAN...
              </>
            ) : (
              <>
                <Landmark className="w-4 h-4" />
                Generate Anchor NUBAN Account
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
