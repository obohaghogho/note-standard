import React, { useState, useEffect } from "react";
import { X, Folder, Plus, Edit2, Trash2, Save, Sparkles, FolderOpen, Heart, BookOpen, Briefcase, DollarSign, Lightbulb } from "lucide-react";
import { supabase } from "../../lib/supabaseSafe";
import { useAuth } from "../../context/AuthContext";
import { useNotesDashboard } from "../../context/NotesDashboardContext";
import { Card } from "../common/Card";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import toast from "react-hot-toast";

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#EF4444", // Red
  "#06B6D4", // Cyan
  "#F97316", // Orange
];

const PRESET_ICONS = [
  { name: "folder", component: <FolderOpen className="w-4 h-4" /> },
  { name: "briefcase", component: <Briefcase className="w-4 h-4" /> },
  { name: "user", component: <Heart className="w-4 h-4" /> },
  { name: "dollar-sign", component: <DollarSign className="w-4 h-4" /> },
  { name: "book-open", component: <BookOpen className="w-4 h-4" /> },
  { name: "lightbulb", component: <Lightbulb className="w-4 h-4" /> }
];

export const FolderModal: React.FC<FolderModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { categories, refreshDashboard } = useNotesDashboard();

  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState("folder");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setSelectedColor(PRESET_COLORS[0]);
      setSelectedIcon("folder");
      setEditingId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;

    setLoading(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("note_categories")
          .update({
            name: name.trim(),
            color: selectedColor,
            icon: selectedIcon
          })
          .eq("id", editingId)
          .eq("user_id", user.id);

        if (error) throw error;
        toast.success("Folder updated!");
      } else {
        const { error } = await supabase
          .from("note_categories")
          .insert({
            user_id: user.id,
            name: name.trim(),
            color: selectedColor,
            icon: selectedIcon
          });

        if (error) throw error;
        toast.success("Folder created!");
      }

      setName("");
      setSelectedColor(PRESET_COLORS[0]);
      setSelectedIcon("folder");
      setEditingId(null);
      refreshDashboard();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save folder");
    } finally {
      setLoading(false);
    }
  };

  const handleEditInit = (cat: { id: string; name: string; color: string; icon: string }) => {
    setEditingId(cat.id);
    setName(cat.name);
    setSelectedColor(cat.color);
    setSelectedIcon(cat.icon);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure? Notes inside this folder will not be deleted, but they will be moved out of this folder.")) return;
    if (!user) return;

    try {
      const { error } = await supabase
        .from("note_categories")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
      toast.success("Folder deleted!");
      refreshDashboard();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete folder");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-lg overflow-hidden flex flex-col" variant="glass">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-emerald-400" />
            Manage Folders & Folders Directory
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] scrollbar-thin">
          {/* Create/Edit Form */}
          <form onSubmit={handleSave} className="space-y-4 p-4 rounded-2xl border border-white/5 bg-neutral-950/20">
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
              {editingId ? "Edit Folder" : "Create Folder"}
            </h4>
            <div className="flex gap-3">
              <Input
                id="folderName"
                name="folderName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Folder name (e.g. Work, Travel)"
                className="bg-white/5 border-white/10 focus:border-emerald-500 flex-grow"
                required
                autoComplete="off"
              />
              <Button type="submit" loading={loading} className="shrink-0">
                <Save className="w-4 h-4 mr-1" />
                {editingId ? "Save" : "Create"}
              </Button>
            </div>

            {/* Colors picker */}
            <div className="space-y-2">
              <span className="text-[10px] text-neutral-500 font-bold uppercase">Folder Color</span>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className="w-6 h-6 rounded-full cursor-pointer hover:scale-110 transition-transform relative flex items-center justify-center border border-black/20"
                    style={{ backgroundColor: c }}
                  >
                    {selectedColor === c && <div className="w-2.5 h-2.5 rounded-full bg-white shadow" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Icons picker */}
            <div className="space-y-2">
              <span className="text-[10px] text-neutral-500 font-bold uppercase">Folder Icon</span>
              <div className="flex gap-2">
                {PRESET_ICONS.map((ico) => (
                  <button
                    key={ico.name}
                    type="button"
                    onClick={() => setSelectedIcon(ico.name)}
                    className={`p-2 rounded-xl cursor-pointer hover:scale-105 transition-all border ${
                      selectedIcon === ico.name
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                        : "border-white/10 bg-neutral-900 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {ico.component}
                  </button>
                ))}
              </div>
            </div>
          </form>

          {/* Existing folders list */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Existing Folders</h4>
            {categories.length === 0 ? (
              <p className="text-neutral-500 text-xs py-4 text-center">No categories created yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-neutral-950/10 hover:bg-neutral-950/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Folder className="w-4 h-4" style={{ color: cat.color }} />
                      <span className="text-sm font-semibold text-white">{cat.name}</span>
                      <span className="text-[10px] text-neutral-500">({cat.note_count} notes)</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleEditInit(cat)}
                        className="p-1.5 rounded hover:bg-white/5 text-neutral-400 hover:text-white cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(cat.id)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-red-400 hover:text-red-300 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
