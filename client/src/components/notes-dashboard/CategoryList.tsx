import React, { useState } from "react";
import { useNotesDashboard } from "../../context/NotesDashboardContext";
import { Folder, FolderOpen, Settings2, Calendar } from "lucide-react";
import { FolderModal } from "../dashboard/FolderModal";

interface CategoryListProps {
  onSelectCategory: (id: string | null) => void;
  selectedCategoryId: string | null;
}

export const CategoryList: React.FC<CategoryListProps> = ({ onSelectCategory, selectedCategoryId }) => {
  const { categories, loading } = useNotesDashboard();
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 rounded-xl border border-white/5 bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* "All Notes" virtual category */}
      <button
        onClick={() => onSelectCategory(null)}
        className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer ${
          selectedCategoryId === null
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-semibold"
            : "border-white/10 bg-neutral-900/50 hover:bg-neutral-900 text-neutral-300 hover:text-white"
        }`}
      >
        <div className="flex items-center gap-3">
          {selectedCategoryId === null ? (
            <FolderOpen className="w-5 h-5 text-emerald-400" />
          ) : (
            <Folder className="w-5 h-5 text-neutral-400" />
          )}
          <span className="text-sm font-medium">All Notes</span>
        </div>
      </button>

      {/* Actual categories */}
      {categories.map((cat) => {
        const isSelected = selectedCategoryId === cat.id;
        const lastUpdatedText = cat.last_updated 
          ? new Date(cat.last_updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : "Never";

        return (
          <div
            key={cat.id}
            className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer ${
              isSelected
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-semibold"
                : "border-white/10 bg-neutral-900/50 hover:bg-neutral-900 text-neutral-300 hover:text-white"
            }`}
            onClick={() => onSelectCategory(cat.id)}
          >
            <div className="flex items-center gap-3">
              <Folder className="w-5 h-5" style={{ color: cat.color }} />
              <div className="text-left">
                <p className="text-sm font-medium leading-none">{cat.name}</p>
                <p className="text-[10px] text-neutral-500 font-bold mt-1 flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" />
                  Edited {lastUpdatedText}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                isSelected ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-neutral-400"
              }`}>
                {cat.note_count}
              </span>
            </div>
          </div>
        );
      })}

      {/* Manage Folders Trigger Button */}
      <button
        onClick={() => setIsFolderModalOpen(true)}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-white/10 bg-neutral-900/10 hover:bg-neutral-900/30 text-xs font-semibold text-neutral-400 hover:text-white transition-all cursor-pointer mt-2"
      >
        <Settings2 className="w-4 h-4" />
        Configure Folders
      </button>

      {/* Render folders settings modal */}
      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
      />
    </div>
  );
};
