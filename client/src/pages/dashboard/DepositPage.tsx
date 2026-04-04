import React, { useState } from "react";
import depositApi from "../../api/depositApi";
import type { DepositInstructions } from "../../api/depositApi";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Input } from "../../components/common/Input";
import DepositHistory from "../../components/deposit/DepositHistory";
import SubmitProofModal from "../../components/deposit/SubmitProofModal";
import { toast } from "react-hot-toast";
import { Copy, Landmark, ArrowRight, ShieldCheck, HelpCircle } from "lucide-react";

const DepositPage: React.FC = () => {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState<DepositInstructions | null>(null);
  const [reference, setReference] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const currencies = [
    { label: "US Dollar (USD)", value: "USD" },
    { label: "British Pound (GBP)", value: "GBP" },
    { label: "Euro (EUR)", value: "EUR" },
  ];

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      return toast.error("Please enter a valid amount.");
    }

    setLoading(true);
    try {
      const data = await depositApi.initiate(currency);
      setInstructions(data.instructions);
      setReference(data.reference);
      toast.success("Deposit instructions generated!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to get deposit details.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
            Fund Your Wallet
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">
            Deposit via manual bank transfer using our Grey accounts.
          </p>
        </div>
        <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/50">
          <div className="p-2 bg-indigo-500 rounded-xl shadow-lg shadow-indigo-500/20">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="text-sm">
            <p className="font-bold text-indigo-900 dark:text-indigo-300">Secure Deposits</p>
            <p className="text-indigo-700/70 dark:text-indigo-400/60 font-medium tracking-tight">Manual Verification Flow</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Step 1: Initiate */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-8 border-none ring-1 ring-slate-100 dark:ring-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900 overflow-visible">
            <div className="flex items-center gap-3 mb-8">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-600 text-white font-black text-lg">1</div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">Start Deposit</h3>
            </div>
            
            <form onSubmit={handleInitiate} className="space-y-6">
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 ml-1">Choose Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full h-14 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-900 dark:text-white font-bold appearance-none focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all cursor-pointer"
                >
                  {currencies.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 ml-1">Deposit Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">{currency}</span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-14 h-14 text-lg font-bold rounded-2xl"
                    required
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                loading={loading} 
                className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg shadow-xl shadow-indigo-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Get Instructions <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </form>
          </Card>

          <Card className="p-6 bg-slate-50 dark:bg-slate-800/50 border-none ring-1 ring-slate-100 dark:ring-slate-800">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-slate-200 dark:bg-slate-700 rounded-lg">
                <HelpCircle className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-800 dark:text-white text-sm">Need Help?</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  Funds typically reflect in your wallet within 1-24 hours after verification. Ensure the reference is included in your bank transfer narration.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Step 2: Instructions */}
        <div className="lg:col-span-2 space-y-8">
          {instructions ? (
            <Card className="p-8 border-none ring-1 ring-indigo-100 dark:ring-indigo-900 shadow-2xl bg-white dark:bg-slate-900 animate-in slide-in-from-right-4 duration-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10 pb-6 border-b border-slate-50 dark:border-slate-800">
                 <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500 text-white font-black text-lg">2</div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">Transfer Details</h3>
                </div>
                <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-sm font-black flex items-center gap-2">
                  <Landmark className="w-4 h-4" /> Grey Recipient Account
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Bank Name</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">{instructions.bank_name}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Account Name</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">{instructions.account_name}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Account Number</p>
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 font-mono tracking-wider">{instructions.account_number}</p>
                    <button onClick={() => copyToClipboard(instructions.account_number, "Account number")} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-indigo-600">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Your Unique Reference</p>
                  <div className="flex items-center gap-3 group">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono tracking-wider">{reference}</p>
                    <button onClick={() => copyToClipboard(reference, "Reference")} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-emerald-600">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {instructions.swift_code && (
                   <div className="space-y-2">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">SWIFT/BIC Code</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-white">{instructions.swift_code}</p>
                  </div>
                )}
                {instructions.iban && (
                   <div className="space-y-2">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">IBAN</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-white">{instructions.iban}</p>
                  </div>
                )}
              </div>

              {instructions.instructions && (
                <div className="mt-10 p-5 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 dark:border-amber-600 rounded-r-xl">
                  <p className="text-sm text-amber-900 dark:text-amber-200 font-medium">
                    <strong className="block mb-1">Additional Instructions</strong>
                    {instructions.instructions}
                  </p>
                </div>
              )}

              <div className="mt-12 flex flex-col sm:flex-row items-center gap-4">
                <Button 
                  onClick={() => setIsModalOpen(true)}
                  className="w-full sm:w-auto h-14 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg shadow-xl shadow-emerald-500/20"
                >
                  Confirm Transfer & Submit Proof
                </Button>
                <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                  <ShieldCheck className="w-4 h-4" /> Payments are manually verified by admins
                </div>
              </div>
            </Card>
          ) : (
             <Card className="p-20 border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-900/50 rounded-3xl">
                <div className="p-6 bg-white dark:bg-slate-800 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none mb-8 rotate-3">
                  <Landmark className="w-16 h-16 text-slate-300 dark:text-slate-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-400 dark:text-slate-600 mb-2">Instructions pending</h3>
                <p className="text-slate-400 dark:text-slate-700 font-medium max-w-xs">
                  Enter an amount and click "Get Instructions" to see where to send your funds.
                </p>
             </Card>
          )}

          <div className="pt-4">
            <DepositHistory />
          </div>
        </div>
      </div>

      <SubmitProofModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        reference={reference}
        amount={parseFloat(amount)}
        currency={currency}
        onSuccess={() => {
          setInstructions(null);
          setAmount("");
          // Key for forceful re-render of DepositHistory could be added here
          window.location.reload(); 
        }}
      />
    </div>
  );
};

export default DepositPage;
