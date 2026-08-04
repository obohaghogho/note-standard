import React from 'react';
import { Pin, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface FeaturedNoteProps {
  note: any;
  onClick: () => void;
}

export const FeaturedNote: React.FC<FeaturedNoteProps> = ({ note, onClick }) => {
  if (!note) return null;

  return (
    <div className="px-4 sm:px-6 py-4">
      <motion.div 
        whileHover={{ y: -2 }}
        onClick={onClick}
        className="group relative flex flex-col bg-gradient-to-r from-indigo-950/60 to-purple-900/30 hover:from-indigo-900/60 hover:to-purple-800/40 border border-indigo-500/30 hover:border-indigo-400/50 rounded-2xl p-5 sm:p-6 cursor-pointer transition-all duration-300 shadow-lg shadow-indigo-900/10 overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
        
        <div className="flex items-center gap-2 mb-2 relative z-10">
          <Pin size={16} className="text-indigo-400 rotate-45" />
          <span className="text-[11px] sm:text-xs font-bold text-indigo-400 uppercase tracking-widest">Featured Note</span>
        </div>
        
        <h3 className="text-lg sm:text-2xl font-bold text-white mb-3 group-hover:text-indigo-300 transition-colors line-clamp-1 relative z-10 tracking-tight">
          {note.title || 'Untitled Note'}
        </h3>
        
        <div className="flex items-center text-indigo-400 font-bold text-sm group-hover:text-indigo-300 transition-colors relative z-10">
          Read <ArrowRight size={16} className="ml-1.5 transition-transform group-hover:translate-x-1" />
        </div>
      </motion.div>
    </div>
  );
};
