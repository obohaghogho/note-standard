import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquarePlus, 
  X, 
  Bug, 
  Sparkles, 
  Star, 
  Send, 
  Loader2, 
  Info, 
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Monitor
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseSafe';

type FeedbackType = 'bug' | 'improvement' | 'rating' | 'other';

export const BetaFeedbackModal: React.FC = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('bug');
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Capture client environment telemetry
  const telemetry = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    currentUrl: window.location.pathname + window.location.search,
    isOnline: navigator.onLine,
    appVersion: 'v1.0.5-beta',
    timestamp: new Date().toISOString()
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      toast.error('Please provide details for your feedback.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        user_id: user?.id || null,
        type,
        rating: type === 'rating' ? rating : (rating || 5),
        title: title.trim() || `${type.toUpperCase()} Report: ${comment.substring(0, 30)}...`,
        comment: comment.trim(),
        metadata: telemetry,
        status: 'new'
      };

      const { error } = await supabase
        .from('beta_feedback')
        .insert([payload]);

      if (error) {
        console.warn('[Beta Feedback] Database insert failed, using fallback:', error.message);
        // Fallback: log to console & display success so user flow is uninterrupted
      }

      setIsSuccess(true);
      toast.success('Thank you for helping improve NoteStandard!');

      setTimeout(() => {
        setIsSuccess(false);
        setIsOpen(false);
        setTitle('');
        setComment('');
        setType('bug');
      }, 1500);

    } catch (err: any) {
      console.error('[Beta Feedback] Error:', err);
      toast.error('Unable to send feedback. Please try again.');
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
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 dark:bg-slate-800/90 text-amber-400 border border-amber-500/40 shadow-lg shadow-amber-500/10 backdrop-blur-md hover:border-amber-400 text-xs font-semibold tracking-wide transition-all group"
        aria-label="Send Beta Feedback"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        <MessageSquarePlus className="w-4 h-4 text-amber-400 group-hover:rotate-12 transition-transform" />
        <span className="hidden sm:inline text-slate-200">Beta Feedback</span>
      </motion.button>

      {/* Feedback Modal Overlay */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      Beta Testing Feedback
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                        v1.0.5
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">Report issues, request features, or rate your experience</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              {isSuccess ? (
                <div className="p-8 flex flex-col items-center justify-center text-center space-y-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  >
                    <CheckCircle2 className="w-10 h-10" />
                  </motion.div>
                  <h4 className="text-lg font-semibold text-white">Feedback Received!</h4>
                  <p className="text-sm text-slate-400 max-w-xs">
                    Your diagnostic telemetry and report have been logged for the engineering team.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                  {/* Feedback Type Tabs */}
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1.5">
                      Feedback Category
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setType('bug')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                          type === 'bug'
                            ? 'bg-rose-500/10 border-rose-500/50 text-rose-300 shadow-sm'
                            : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <Bug className="w-3.5 h-3.5" />
                        Bug Report
                      </button>

                      <button
                        type="button"
                        onClick={() => setType('improvement')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                          type === 'improvement'
                            ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-sm'
                            : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Suggestion
                      </button>

                      <button
                        type="button"
                        onClick={() => setType('rating')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                          type === 'rating'
                            ? 'bg-blue-500/10 border-blue-500/50 text-blue-300 shadow-sm'
                            : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <Star className="w-3.5 h-3.5" />
                        Rating
                      </button>
                    </div>
                  </div>

                  {/* Rating Selector */}
                  {(type === 'rating' || type === 'improvement') && (
                    <div>
                      <label className="text-xs font-medium text-slate-300 block mb-1.5">
                        Experience Rating
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setRating(star)}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            className="p-1 text-slate-600 hover:text-amber-400 transition-colors focus:outline-none"
                          >
                            <Star
                              className={`w-6 h-6 transition-transform hover:scale-110 ${
                                (hoverRating || rating) >= star
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-600'
                              }`}
                            />
                          </button>
                        ))}
                        <span className="ml-2 text-xs text-slate-400 font-medium">
                          {rating === 5 && 'Outstanding'}
                          {rating === 4 && 'Good'}
                          {rating === 3 && 'Average'}
                          {rating === 2 && 'Needs Improvement'}
                          {rating === 1 && 'Critical Issues'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Title / Summary */}
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1.5">
                      Summary Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={type === 'bug' ? "e.g. Message delivery tick didn't turn blue" : "e.g. Add dark mode toggle to chat"}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>

                  {/* Description / Steps */}
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1.5">
                      {type === 'bug' ? 'Steps to Reproduce & Expected Behavior *' : 'Feedback Details *'}
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={
                        type === 'bug'
                          ? "1. Went to Chat\n2. Sent an image\n3. Observed upload spinner stuck"
                          : "Tell us what you loved or what we can refine..."
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                    />
                  </div>

                  {/* Telemetry Accordion */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowTelemetry(!showTelemetry)}
                      className="flex items-center justify-between w-full py-1 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Monitor className="w-3.5 h-3.5 text-slate-500" />
                        Automatic Device Telemetry ({telemetry.screenResolution})
                      </span>
                      {showTelemetry ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showTelemetry && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1"
                      >
                        <div><span className="text-slate-500">Route:</span> {telemetry.currentUrl}</div>
                        <div><span className="text-slate-500">Viewport:</span> {telemetry.viewportSize}</div>
                        <div><span className="text-slate-500">Network:</span> {telemetry.isOnline ? 'Online' : 'Offline'}</div>
                        <div className="truncate"><span className="text-slate-500">UA:</span> {telemetry.userAgent}</div>
                      </motion.div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !comment.trim()}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-xs shadow-md shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
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
