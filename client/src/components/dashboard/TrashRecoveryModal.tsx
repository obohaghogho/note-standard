import React, { useState, useEffect } from "react";
import axios from "axios";
import { X, Trash2, RotateCcw, AlertTriangle, Loader2, FolderOpen } from "lucide-react";
import { toast } from "react-hot-toast";

const API_URL = import.meta.env.VITE_API_URL || '';

interface TrashNote {
  id: string;
  title: string;
  note_type: string;
  deleted_at: string;
  color?: string;
}

interface TrashRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreCompleted: () => void;
}

export const TrashRecoveryModal: React.FC<TrashRecoveryModalProps> = ({ isOpen, onClose, onRestoreCompleted }) => {
  const [trashNotes, setTrashNotes] = useState<TrashNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchTrash = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.get(`${API_URL}/api/notes/trash`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTrashNotes(data);
    } catch (err) {
      console.error("[TrashRecoveryModal] Fetch failed:", err);
      toast.error("Failed to load trash contents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTrash();
    }
  }, [isOpen]);

  const handleRestore = async (id: string) => {
    setActionId(id);
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API_URL}/api/notes/${id}/restore`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Note restored successfully!");
      setTrashNotes(prev => prev.filter(n => n.id !== id));
      onRestoreCompleted();
    } catch (err) {
      console.error(err);
      toast.error("Failed to restore note.");
    } finally {
      setActionId(null);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this note? This action cannot be undone.")) return;
    
    setActionId(id);
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API_URL}/api/notes/${id}/permanent`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Note permanently purged.");
      setTrashNotes(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete note permanently.");
    } finally {
      setActionId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-neutral-950/40">
          <div className="flex items-center gap-2.5">
            <Trash2 className="w-5 h-5 text-red-400" />
            <h3 className="text-white font-bold text-lg">Trash Directory</h3>
            <span className="text-[10px] bg-red-500/20 text-red-400 font-extrabold px-2 py-0.5 rounded-full">
              Soft Deleted
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/5 text-neutral-400 hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-grow overflow-y-auto max-h-[500px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-red-400" />
              <p className="text-sm font-semibold">Scanning Trash...</p>
            </div>
          ) : trashNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-neutral-500 border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
              <FolderOpen className="w-10 h-10 text-neutral-600 mb-2" />
              <p className="text-sm font-semibold">Your trash is empty.</p>
              <p className="text-xs mt-0.5 font-bold">Notes you delete will appear here for recovery.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl text-xs font-semibold mb-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Items placed in the Trash are kept for safety. You can restore them anytime or purge them permanently.
              </div>

              {trashNotes.map((note) => (
                <div
                  key={note.id}
                  className="flex items-center justify-between p-3.5 bg-neutral-950/40 border border-white/5 rounded-xl hover:border-white/10 transition-colors"
                  style={note.color ? { borderLeft: `3px solid ${note.color}` } : undefined}
                >
                  <div className="text-left">
                    <p className="text-white text-xs font-semibold">{note.title || "Untitled Note"}</p>
                    <p className="text-neutral-500 text-[10px] mt-0.5 font-bold">
                      Deleted on {new Date(note.deleted_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      disabled={actionId !== null}
                      onClick={() => handleRestore(note.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold cursor-pointer transition-colors"
                      title="Restore Note"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restore
                    </button>
                    <button
                      disabled={actionId !== null}
                      onClick={() => handlePermanentDelete(note.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold cursor-pointer transition-colors"
                      title="Delete Permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Purge
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-neutral-950/20 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-neutral-400 hover:text-white bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
