import React, { useState } from "react";
import axiosInstance from "../../api/axiosInstance";
import depositApi from "../../api/depositApi";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { toast } from "react-hot-toast";
import { X, Upload, CheckCircle } from "lucide-react";

interface SubmitProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  reference: string;
  amount: number;
  currency: string;
  onSuccess: () => void;
}

const SubmitProofModal: React.FC<SubmitProofModalProps> = ({
  isOpen,
  onClose,
  reference,
  amount,
  currency,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [proofUrl, setProofUrl] = useState("");

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const uploadFile = async () => {
    if (!file) return null;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axiosInstance.post("/upload/image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProofUrl(res.data.url);
      return res.data.url;
    } catch {
      toast.error("Failed to upload proof. Please try again.");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let finalProofUrl = proofUrl;
      if (file && !proofUrl) {
        finalProofUrl = await uploadFile() || "";
      }

      await depositApi.submit({
        amount,
        currency,
        reference,
        proofUrl: finalProofUrl,
      });

      toast.success("Deposit submitted successfully!");
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const errorResponse = (err as Record<string, unknown>)?.response as Record<string, unknown>;
      const data = errorResponse?.data as Record<string, unknown>;
      toast.error(typeof data?.error === 'string' ? data.error : "Failed to submit deposit.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Submit Payment Proof</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Please upload a screenshot or receipt of your transfer for <strong>{currency} {amount}</strong> with reference <strong>{reference}</strong>.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Payment Reference
            </label>
            <Input value={reference} readOnly className="bg-slate-50 dark:bg-slate-800 border-dashed" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Upload Proof (Optional)
            </label>
            <div className="relative group">
              <input
                type="file"
                id="proof-upload"
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
              <label
                htmlFor="proof-upload"
                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  file ? "border-green-500 bg-green-50 dark:bg-green-900/10" : "border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10"
                }`}
              >
                {file ? (
                  <div className="flex flex-col items-center">
                    <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">{file.name}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-500 mb-2" />
                    <span className="text-sm text-slate-500 group-hover:text-blue-500">Click to upload image</span>
                  </div>
                )}
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={onClose} className="flex-1" type="button">
              Cancel
            </Button>
            <Button 
                type="submit" 
                loading={uploading || submitting} 
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Submit Deposit
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubmitProofModal;
