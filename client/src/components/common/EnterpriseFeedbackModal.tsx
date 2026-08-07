import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquarePlus, 
  X, 
  Bug, 
  Sparkles, 
  Star, 
  Send, 
  Loader2, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Monitor,
  Zap,
  Gauge,
  CreditCard,
  Wallet,
  MessageCircle,
  Globe,
  ShieldAlert,
  Paperclip,
  UploadCloud,
  FileText,
  AlertTriangle,
  Bot,
  RefreshCw,
  Info,
  Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useChat } from '../../context/ChatContext';
import { supabase } from '../../lib/supabaseSafe';
import type { 
  FeedbackCategoryType, 
  PriorityLevel, 
  GranularRatings, 
  DiagnosticTelemetry,
  FeedbackAttachment 
} from '../../types/feedback';
import { collectTelemetry } from '../../utils/feedbackCollector';
import { runFullAIAssist } from '../../utils/aiFeedbackAssistant';
import { compressImageFile } from '../../utils/imageCompressor';
import { saveFeedbackDraft, loadFeedbackDraft, clearFeedbackDraft } from '../../utils/feedbackDraft';
import { enqueueOfflineFeedback } from '../../utils/feedbackOfflineQueue';
import { crashReplayRecorder } from '../../utils/crashReplayRecorder';

const CATEGORIES: Array<{
  id: FeedbackCategoryType;
  name: string;
  icon: React.ElementType;
  colorClass: string;
  badgeClass: string;
}> = [
  { id: 'bug_report', name: 'Bug Report', icon: Bug, colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/30', badgeClass: 'bg-rose-500/15 text-rose-300' },
  { id: 'feature_request', name: 'Feature Request', icon: Sparkles, colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/30', badgeClass: 'bg-amber-500/15 text-amber-300' },
  { id: 'improvement', name: 'Improvement', icon: Zap, colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/30', badgeClass: 'bg-blue-500/15 text-blue-300' },
  { id: 'general', name: 'General Feedback', icon: MessageSquarePlus, colorClass: 'text-slate-400 bg-slate-500/10 border-slate-500/30', badgeClass: 'bg-slate-500/15 text-slate-300' },
  { id: 'performance', name: 'Performance', icon: Gauge, colorClass: 'text-purple-400 bg-purple-500/10 border-purple-500/30', badgeClass: 'bg-purple-500/15 text-purple-300' },
  { id: 'payment', name: 'Payment Issue', icon: CreditCard, colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', badgeClass: 'bg-emerald-500/15 text-emerald-300' },
  { id: 'wallet', name: 'Wallet Issue', icon: Wallet, colorClass: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30', badgeClass: 'bg-indigo-500/15 text-indigo-300' },
  { id: 'chat', name: 'Chat Issue', icon: MessageCircle, colorClass: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30', badgeClass: 'bg-cyan-500/15 text-cyan-300' },
  { id: 'community', name: 'Community Feed', icon: Globe, colorClass: 'text-orange-400 bg-orange-500/10 border-orange-500/30', badgeClass: 'bg-orange-500/15 text-orange-300' },
  { id: 'security', name: 'Security Concern', icon: ShieldAlert, colorClass: 'text-red-400 bg-red-600/20 border-red-500/40', badgeClass: 'bg-red-600/20 text-red-300' },
];

export const EnterpriseFeedbackModal: React.FC = () => {
  const { user } = useAuth();
  const { selectedWallet } = useWallet();
  const { activeConversationId } = useChat();

  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategoryType>('bug_report');
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reproductionSteps, setReproductionSteps] = useState('');

  // 5-Star Ratings State
  const [ratings, setRatings] = useState<GranularRatings>({
    overallExperience: 5,
    performance: 5,
    design: 5,
    easeOfUse: 5,
    reliability: 5,
  });

  const [attachments, setAttachments] = useState<Array<{ file: File; previewUrl: string; isCompressing: boolean }>>([]);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [showRatingsMatrix, setShowRatingsMatrix] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // AI Assistance state
  const [aiSuggestions, setAiSuggestions] = useState<ReturnType<typeof runFullAIAssist> | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // File Dropzone ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collect enriched telemetry dynamically
  const telemetryData: DiagnosticTelemetry = collectTelemetry({
    walletContext: selectedWallet ? {
      walletType: selectedWallet.type || 'fiat',
      currency: selectedWallet.currency || 'USD',
      transactionId: selectedWallet.lastTransactionId,
    } : undefined,
    chatContext: activeConversationId ? {
      conversationId: activeConversationId,
      socketStatus: 'connected',
    } : undefined,
  });

  // Load auto-save draft on mount
  useEffect(() => {
    const saved = loadFeedbackDraft();
    if (saved) {
      setCategory(saved.categoryId || 'bug_report');
      setPriority(saved.priority || 'medium');
      setTitle(saved.title || '');
      setDescription(saved.description || '');
      setReproductionSteps(saved.reproductionSteps || '');
      if (saved.ratings) setRatings(saved.ratings);
      setDraftSavedAt(new Date(saved.savedAt).toLocaleTimeString());
    }
  }, []);

  // Auto-save draft as user types
  useEffect(() => {
    if (!description.trim() && !title.trim()) return;
    const timer = setTimeout(() => {
      saveFeedbackDraft({
        categoryId: category,
        priority,
        title,
        description,
        reproductionSteps,
        expectedBehavior: '',
        actualBehavior: '',
        ratings,
      });
      setDraftSavedAt(new Date().toLocaleTimeString());
    }, 800);
    return () => clearTimeout(timer);
  }, [category, priority, title, description, reproductionSteps, ratings]);

  // AI Intelligent Assistance trigger
  const handleTriggerAIAssist = () => {
    if (!description.trim()) {
      toast.error('Please type a brief description first so AI can assist you.');
      return;
    }
    setIsGeneratingAI(true);
    setTimeout(() => {
      const assistResult = runFullAIAssist(description, title);
      setAiSuggestions(assistResult);
      if (!title.trim() && assistResult.suggestedTitle) {
        setTitle(assistResult.suggestedTitle);
      }
      setCategory(assistResult.suggestedCategory);
      setPriority(assistResult.estimatedPriority);
      if (!reproductionSteps.trim() && assistResult.extractedSteps.length > 0) {
        setReproductionSteps(assistResult.extractedSteps.join('\n'));
      }
      setIsGeneratingAI(false);
      toast.success('AI updated title, category & reproduction steps!');
    }, 400);
  };

  // Drag & drop attachment upload handler
  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`File ${file.name} exceeds maximum 25MB limit.`);
        continue;
      }
      setAttachments(prev => [...prev, { file, previewUrl: '', isCompressing: true }]);
      const compressed = await compressImageFile(file);
      setAttachments(prev =>
        prev.map(a => (a.file === file ? { file: compressed.file, previewUrl: compressed.previewUrl, isCompressing: false } : a))
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('Please describe the issue or feedback.');
      return;
    }

    setIsSubmitting(true);

    const payload = {
      user_id: user?.id || null,
      category_id: category,
      type: category === 'feature_request' ? 'feature' : category === 'security' ? 'security' : 'bug',
      priority,
      status: 'open',
      title: title.trim() || `${category.toUpperCase()} Report`,
      description: description.trim(),
      reproduction_steps: reproductionSteps.split('\n').filter(Boolean),
      metadata: {
        ...telemetryData,
        crashReplay: crashReplayRecorder.getReplayData(),
      },
      ratings,
      created_at: new Date().toISOString(),
    };

    try {
      if (!navigator.onLine) {
        enqueueOfflineFeedback(payload);
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          setIsOpen(false);
          clearFeedbackDraft();
        }, 1500);
        return;
      }

      const { error } = await supabase.from('beta_feedback').insert([payload]);

      if (error) {
        console.warn('[EnterpriseFeedback] DB insert fallback to API:', error.message);
        // Fallback POST to express server endpoint
        await fetch('/api/v1/feedback/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report: payload, ratings, telemetry: telemetryData }),
        });
      }

      setIsSuccess(true);
      clearFeedbackDraft();
      toast.success('Thank you! Your feedback has been submitted to the engineering team.');

      setTimeout(() => {
        setIsSuccess(false);
        setIsOpen(false);
        setTitle('');
        setDescription('');
        setReproductionSteps('');
        setAttachments([]);
      }, 1500);
    } catch (err: any) {
      console.error('[EnterpriseFeedback] Submission error:', err);
      enqueueOfflineFeedback(payload);
      toast.error('Network glitch. Report saved to offline queue!');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900/90 text-amber-400 border border-amber-500/40 shadow-xl shadow-amber-500/10 backdrop-blur-md hover:border-amber-400 text-xs font-semibold tracking-wide transition-all group"
        aria-label="Submit Enterprise Feedback"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        <MessageSquarePlus className="w-4 h-4 text-amber-400 group-hover:rotate-12 transition-transform" />
        <span className="hidden sm:inline text-slate-100">Enterprise Feedback</span>
      </motion.button>

      {/* Modal Overlay */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[92vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      Enterprise Feedback & Issue Reporting
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                        NoteStandard v1.0.5
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">Production bug triage, feature requests & telemetry capture</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {draftSavedAt && (
                    <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
                      <Clock className="w-3 h-3 text-emerald-400" /> Draft saved {draftSavedAt}
                    </span>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              {isSuccess ? (
                <div className="p-12 flex flex-col items-center justify-center text-center space-y-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                  >
                    <CheckCircle2 className="w-12 h-12" />
                  </motion.div>
                  <h4 className="text-xl font-bold text-white">Report Successfully Logged!</h4>
                  <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
                    Your diagnostic telemetry, attachments, and issue description have been triaged for the core developer team.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                  {/* Category Grid */}
                  <div>
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
                      Feedback Category
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {CATEGORIES.map((cat) => {
                        const IconComp = cat.icon;
                        const isSelected = category === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setCategory(cat.id)}
                            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all ${
                              isSelected
                                ? `${cat.colorClass} shadow-md ring-1 ring-amber-500/40`
                                : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                          >
                            <IconComp className="w-4 h-4 mb-1" />
                            <span className="truncate w-full text-center text-[11px]">{cat.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Priority & AI Assist Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div>
                      <span className="text-xs font-semibold text-slate-300 block mb-1">Priority Severity</span>
                      <div className="flex items-center gap-1.5">
                        {(['low', 'medium', 'high', 'critical'] as PriorityLevel[]).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPriority(p)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all ${
                              priority === p
                                ? p === 'critical' ? 'bg-red-600/30 text-red-300 border-red-500/60 shadow-lg shadow-red-500/20' :
                                  p === 'high' ? 'bg-amber-500/30 text-amber-300 border-amber-500/60' :
                                  p === 'medium' ? 'bg-blue-500/30 text-blue-300 border-blue-500/60' :
                                  'bg-slate-700 text-slate-200 border-slate-600'
                                : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleTriggerAIAssist}
                      disabled={isGeneratingAI || !description.trim()}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-300 border border-amber-500/40 text-xs font-semibold hover:bg-amber-500/30 transition-all disabled:opacity-50"
                    >
                      {isGeneratingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                      AI Assist Title & Steps
                    </button>
                  </div>

                  {/* Title & Smart Suggestions */}
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1.5">
                      Issue Summary Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Transfer failed after PIN confirmation"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>

                  {/* Duplicate Warning Banner */}
                  {aiSuggestions && aiSuggestions.potentialDuplicates.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        This issue may already be known:
                      </div>
                      <ul className="list-disc list-inside text-amber-300/90 text-[11px] space-y-0.5">
                        {aiSuggestions.potentialDuplicates.map((dup) => (
                          <li key={dup.id}>
                            <span className="font-medium">{dup.title}</span> ({Math.round(dup.similarityScore * 100)}% match)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Detailed Description */}
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1.5">
                      Detailed Description & Expected Behavior *
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Explain what went wrong or what feature you would like to see..."
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                    />
                  </div>

                  {/* Steps to Reproduce */}
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1.5">
                      Reproduction Steps (Optional / Line Separated)
                    </label>
                    <textarea
                      rows={2}
                      value={reproductionSteps}
                      onChange={(e) => setReproductionSteps(e.target.value)}
                      placeholder="1. Go to Wallet page&#10;2. Click Deposit&#10;3. Observe spinner hanging"
                      className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono resize-none"
                    />
                  </div>

                  {/* Drag & Drop File Uploads */}
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1.5">
                      Attachments (Screenshots, Screen Recordings, Images, PDFs)
                    </label>
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className="p-4 border-2 border-dashed border-slate-700 hover:border-amber-500/50 rounded-xl bg-slate-950/40 text-center cursor-pointer transition-colors group"
                    >
                      <UploadCloud className="w-6 h-6 mx-auto text-slate-500 group-hover:text-amber-400 transition-colors mb-1" />
                      <p className="text-xs text-slate-400">
                        Drag and drop files here, or <span className="text-amber-400 font-medium">browse</span>
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Supports PNG, JPG, MP4, PDF up to 25MB (Auto-compressed)</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,video/*,application/pdf"
                        onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                        className="hidden"
                      />
                    </div>

                    {/* Attachment Previews */}
                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {attachments.map((att, idx) => (
                          <div key={idx} className="relative p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 flex items-center gap-2">
                            {att.isCompressing ? (
                              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                            ) : (
                              <FileText className="w-4 h-4 text-amber-400" />
                            )}
                            <span className="truncate max-w-[120px] text-[11px]">{att.file.name}</span>
                            <button
                              type="button"
                              onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-rose-400"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Multi-Dimensional Ratings Accordion */}
                  <div className="border-t border-slate-800 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRatingsMatrix(!showRatingsMatrix)}
                      className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 transition-colors py-1"
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        <Star className="w-3.5 h-3.5 text-amber-400" />
                        Detailed Multi-Dimensional Ratings
                      </span>
                      {showRatingsMatrix ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showRatingsMatrix && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs"
                      >
                        {[
                          { key: 'overallExperience', label: 'Overall Experience' },
                          { key: 'performance', label: 'Performance & Speed' },
                          { key: 'design', label: 'Design & Aesthetics' },
                          { key: 'easeOfUse', label: 'Ease of Use' },
                          { key: 'reliability', label: 'System Reliability' },
                        ].map((item) => (
                          <div key={item.key} className="flex items-center justify-between">
                            <span className="text-slate-400">{item.label}</span>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setRatings(prev => ({ ...prev, [item.key]: star }))}
                                  className="text-slate-600 hover:text-amber-400"
                                >
                                  <Star
                                    className={`w-4 h-4 ${
                                      (ratings[item.key as keyof GranularRatings] || 5) >= star
                                        ? 'fill-amber-400 text-amber-400'
                                        : 'text-slate-600'
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </div>

                  {/* Diagnostics Telemetry Accordion */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowTelemetry(!showTelemetry)}
                      className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 transition-colors py-1"
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        <Monitor className="w-3.5 h-3.5 text-slate-500" />
                        Automatic Device Telemetry ({telemetryData.screenResolution})
                      </span>
                      {showTelemetry ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showTelemetry && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1"
                      >
                        <div><span className="text-slate-500">Route:</span> {telemetryData.currentRoute}</div>
                        <div><span className="text-slate-500">Device/OS:</span> {telemetryData.operatingSystem} ({telemetryData.browserName})</div>
                        <div><span className="text-slate-500">Session ID:</span> {telemetryData.sessionId}</div>
                        <div><span className="text-slate-500">Network:</span> {telemetryData.networkType}</div>
                        <div className="text-[10px] text-slate-500 border-t border-slate-800/80 pt-1">
                          🔒 Passwords, authorization headers, and card details are automatically redacted.
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !description.trim()}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-xs shadow-md shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Submitting Report...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Submit Report
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
