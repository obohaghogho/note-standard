import React from 'react';
import { Pin, Heart, MessageCircle, Clock, ChevronRight } from 'lucide-react';

interface FeaturedNoteProps {
  note: any;
  onClick: () => void;
}

export const FeaturedNote: React.FC<FeaturedNoteProps> = ({ note, onClick }) => {
  if (!note) return null;

  return (
    <div className="px-2 sm:px-6 py-4">
      <div 
        onClick={onClick}
        className="group relative flex flex-col bg-gradient-to-br from-indigo-950/40 to-gray-900/40 hover:from-indigo-900/50 hover:to-gray-800/50 border border-indigo-500/20 hover:border-indigo-500/40 rounded-2xl p-4 sm:p-5 cursor-pointer transition-all duration-300"
      >
        <div className="flex items-center gap-2 mb-3">
          <Pin size={14} className="text-indigo-400 rotate-45" />
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Featured Note</span>
        </div>
        
        <h3 className="text-lg sm:text-xl font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors line-clamp-1">
          {note.title || 'Untitled Note'}
        </h3>
        
        <p className="text-sm text-gray-400 line-clamp-2 mb-4 leading-relaxed">
          {note.content ? note.content.replace(/<[^>]*>?/gm, '') : 'No preview available'}
        </p>
        
        <div className="flex items-center justify-between text-xs font-medium text-gray-500 mt-auto pt-4 border-t border-white/5">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              {new Date(note.created_at).toLocaleDateString()}
            </span>
            {/* Note metrics - usually private notes don't have public likes, but if it did, we show them */}
            {note.likes_count !== undefined && (
              <span className="flex items-center gap-1.5">
                <Heart size={14} /> {note.likes_count}
              </span>
            )}
            {note.comments_count !== undefined && (
              <span className="flex items-center gap-1.5">
                <MessageCircle size={14} /> {note.comments_count}
              </span>
            )}
          </div>
          
          <div className="flex items-center text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-300">
            Read <ChevronRight size={16} className="ml-1" />
          </div>
        </div>
      </div>
    </div>
  );
};
