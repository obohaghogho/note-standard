import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Search, Loader2, FileText, CornerDownLeft, Sparkles } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || '';

interface SearchResult {
  id: string;
  title: string;
  content: string;
  note_type: string;
}

interface GlobalSearchProps {
  onSelectNote: (id: string) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ onSelectNote }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Simple inline debounce logic
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const token = localStorage.getItem("token");
        const { data } = await axios.get(
          `${API_URL}/api/notes/search?q=${encodeURIComponent(query)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setResults(data);
      } catch (err) {
        console.error("[Search] Failed to fetch search results:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  // Click outside dismiss
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelect(results[selectedIndex].id);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleSelect = (noteId: string) => {
    onSelectNote(noteId);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div className="relative w-full max-w-lg" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search notes by title, content, or tags... (Ctrl + K)"
          className="w-full pl-11 pr-4 py-3 bg-neutral-900 border border-white/10 rounded-xl text-white text-sm font-medium focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 placeholder-neutral-500 transition-all shadow-inner"
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 animate-spin" />
        )}
      </div>

      {isOpen && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-950 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-[350px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">
              <p className="text-sm font-medium">No results found for "{query}"</p>
              <p className="text-xs mt-0.5">Try searching for keywords instead.</p>
            </div>
          ) : (
            <div className="p-2 flex flex-col gap-1">
              <div className="text-[10px] text-neutral-500 font-bold px-3 py-1.5 uppercase tracking-wider border-b border-white/5 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Matched Results
              </div>
              
              {results.map((note, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={note.id}
                    onClick={() => handleSelect(note.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors cursor-pointer ${
                      isSelected ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <div>
                        <p className="text-white text-xs font-semibold">{note.title || "Untitled"}</p>
                        <p className="text-neutral-400 text-[10px] line-clamp-1 mt-0.5">{note.content || "No content."}</p>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="flex items-center gap-0.5 text-[8px] bg-white/10 text-neutral-400 px-1 py-0.5 rounded font-bold">
                        <CornerDownLeft className="w-2.5 h-2.5" />
                        Enter
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
