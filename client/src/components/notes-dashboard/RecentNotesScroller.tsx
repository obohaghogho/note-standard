import React from "react";
import { useNotesDashboard } from "../../context/NotesDashboardContext";
import { FileText, Clock, AlignLeft } from "lucide-react";

interface RecentNotesScrollerProps {
  onSelectNote: (id: string) => void;
}

export const RecentNotesScroller: React.FC<RecentNotesScrollerProps> = ({ onSelectNote }) => {
  const { recentNotes, loading } = useNotesDashboard();

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {[1, 2, 3].map(i => (
          <div key={i} className="min-w-[240px] w-[240px] h-[140px] rounded-2xl border border-white/10 bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (recentNotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 rounded-2xl border border-dashed border-white/10 bg-white/5 text-center">
        <FileText className="w-8 h-8 text-neutral-500 mb-2" />
        <p className="text-neutral-400 text-sm font-medium">No recently opened notes.</p>
        <p className="text-neutral-500 text-xs mt-0.5">Click New Note to start writing.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin scroll-smooth">
      {recentNotes.map((note) => (
        <button
          key={note.id}
          onClick={() => onSelectNote(note.id)}
          className="min-w-[260px] w-[260px] h-[150px] flex flex-col text-left rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900 to-neutral-950 p-4 hover:border-white/20 hover:scale-[1.02] cursor-pointer transition-all duration-300 relative group overflow-hidden shadow-lg"
          style={note.color ? { borderLeft: `4px solid ${note.color}` } : undefined}
        >
          {note.cover_image && (
            <div className="absolute inset-0 h-10 w-full bg-gradient-to-r opacity-20 pointer-events-none"
                 style={{ backgroundImage: note.cover_image.includes("url") ? note.cover_image : `linear-gradient(${note.cover_image})` }} />
          )}

          <div className="flex items-start justify-between gap-2 mb-2 relative z-10">
            <h3 className="text-white font-bold text-sm line-clamp-1 group-hover:text-blue-400 transition-colors">
              {note.title || "Untitled Note"}
            </h3>
            {note.is_pinned && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded">Pinned</span>
            )}
          </div>
          
          <p className="text-neutral-400 text-xs line-clamp-3 mb-auto relative z-10 flex-grow font-medium leading-relaxed">
            {note.content || "No content."}
          </p>

          <div className="flex items-center justify-between text-[10px] text-neutral-500 font-bold pt-2 border-t border-white/5 relative z-10">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-neutral-600" />
              {note.reading_time > 60 ? `${Math.round(note.reading_time / 60)}m read` : `${note.reading_time}s read`}
            </span>
            <span className="flex items-center gap-1">
              <AlignLeft className="w-3 h-3 text-neutral-600" />
              {note.word_count} words
            </span>
          </div>
        </button>
      ))}
    </div>
  );
};
