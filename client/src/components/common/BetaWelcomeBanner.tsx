import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, MessageSquarePlus, ShieldCheck } from 'lucide-react';

interface BetaWelcomeBannerProps {
  onOpenFeedback?: () => void;
}

export const BetaWelcomeBanner: React.FC<BetaWelcomeBannerProps> = ({ onOpenFeedback }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem('note_beta_banner_dismissed_v1');
    if (!isDismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('note_beta_banner_dismissed_v1', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="w-full bg-gradient-to-r from-amber-500/15 via-purple-500/10 to-amber-500/15 border-b border-amber-500/30 text-slate-200 px-4 py-2.5 backdrop-blur-md relative overflow-hidden"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30 text-[11px]">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Closed Beta v1.0.5
            </span>
            <p className="text-slate-300">
              You are testing NoteStandard Early Access. Priority testing areas: <strong className="text-white font-medium">Realtime Chat, Profile Customization & Offline Sync</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenFeedback && (
              <button
                onClick={onOpenFeedback}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-semibold transition-colors"
              >
                <MessageSquarePlus className="w-3 h-3" />
                Give Feedback
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
