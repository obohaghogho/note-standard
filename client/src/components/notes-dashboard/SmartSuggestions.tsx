import React from "react";
import { useNotesDashboard } from "../../context/NotesDashboardContext";
import { Sparkles, Archive, ArrowRight, FolderPlus } from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || '';

interface SmartSuggestionsProps {
  onSelectNote: (id: string) => void;
  onRefresh: () => void;
}

export const SmartSuggestions: React.FC<SmartSuggestionsProps> = ({ onSelectNote, onRefresh }) => {
  const { suggestions, loading } = useNotesDashboard();

  const handleAction = async (type: string, targetId: string) => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      if (type === "archive_suggestion") {
        await axios.put(`${API_URL}/api/notes/${targetId}`, { is_archived: true }, { headers });
        toast.success("Note archived successfully.");
      } else {
        toast.success("Suggestion noted.");
      }
      onRefresh();
    } catch (err) {
      console.error("[Suggestions] Action failed:", err);
      toast.error("Failed to apply action.");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-16 rounded-xl bg-white/5" />
        <div className="h-16 rounded-xl bg-white/5" />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="border border-white/10 rounded-2xl bg-neutral-900/50 p-4 text-center">
        <Sparkles className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
        <p className="text-white font-bold text-xs">All caught up!</p>
        <p className="text-neutral-500 text-[10px] mt-0.5 font-bold">Smart recommendations will appear here.</p>
      </div>
    );
  }

  return (
    <div className="border border-white/10 rounded-2xl bg-neutral-900/50 p-4 space-y-4">
      <h4 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-400" />
        AI Suggestions
      </h4>

      <div className="flex flex-col gap-3">
        {suggestions.map((sug) => (
          <div
            key={sug.id}
            className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-3 rounded-xl border border-white/5 bg-neutral-950/40 hover:border-white/10 transition-colors"
          >
            <div className="text-left max-w-md">
              <p className="text-white text-xs font-semibold">{sug.title}</p>
              <p className="text-neutral-400 text-[10px] mt-0.5 font-medium leading-relaxed">{sug.message}</p>
            </div>

            <div className="flex gap-2">
              {sug.type === "archive_suggestion" ? (
                <>
                  <button
                    onClick={() => onSelectNote(sug.targetId)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-neutral-300 font-bold cursor-pointer transition-colors"
                  >
                    Open <ArrowRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleAction(sug.type, sug.targetId)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-[10px] text-amber-300 font-bold cursor-pointer transition-colors"
                  >
                    <Archive className="w-3 h-3" /> Archive
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleAction(sug.type, sug.targetId)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-[10px] text-blue-300 font-bold cursor-pointer transition-colors"
                >
                  <FolderPlus className="w-3 h-3" /> Fix Folder
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
