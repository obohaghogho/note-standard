import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { X, Users, Search, Trash2, UserPlus, Shield, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

const API_URL = import.meta.env.VITE_API_URL || '';

interface ShareNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteId: string | null;
}

interface SharedUser {
  id: string;
  role: 'owner' | 'editor' | 'commenter' | 'viewer';
  email: string;
  username: string;
}

export const ShareNoteModal: React.FC<ShareNoteModalProps> = ({ isOpen, onClose, noteId }) => {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<'editor' | 'commenter' | 'viewer'>("viewer");
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchSharedUsers = useCallback(async () => {
    if (!noteId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.get(`${API_URL}/api/notes/${noteId}/permissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSharedUsers(data);
    } catch (err) {
      console.error("[ShareNoteModal] Fetch permissions failed:", err);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    if (isOpen && noteId) {
      fetchSharedUsers();
    } else {
      setSharedUsers([]);
      setEmail("");
      setRole("viewer");
    }
  }, [isOpen, noteId, fetchSharedUsers]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteId || !email.trim()) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_URL}/api/notes/${noteId}/permissions`,
        { email, role },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Note shared with ${email} as ${role}!`);
      setEmail("");
      fetchSharedUsers();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to share note.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!noteId) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API_URL}/api/notes/${noteId}/permissions/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Access revoked successfully.");
      setSharedUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      console.error(err);
      toast.error("Failed to revoke access.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-neutral-950/40">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-emerald-400" />
            <h3 className="text-white font-bold text-lg">Share Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/5 text-neutral-400 hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-grow overflow-y-auto space-y-6">
          {/* Add People Form */}
          <form onSubmit={handleShare} className="space-y-3">
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider">
              Add collaborators
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter collaborator's email..."
                className="flex-grow px-4 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-emerald-500/50"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="px-3 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-xs font-semibold text-neutral-300 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="viewer">Viewer</option>
                <option value="commenter">Commenter</option>
                <option value="editor">Editor</option>
              </select>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Share
              </button>
            </div>
          </form>

          {/* People list */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">People with access</p>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            ) : sharedUsers.length === 0 ? (
              <p className="text-xs text-neutral-500 italic py-2">This note is private. Only you can access it.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sharedUsers.map((userShare) => (
                  <div
                    key={userShare.id}
                    className="flex items-center justify-between p-3 bg-neutral-950/40 border border-white/5 rounded-xl"
                  >
                    <div className="text-left">
                      <p className="text-white text-xs font-semibold">{userShare.username || "Collaborator"}</p>
                      <p className="text-neutral-500 text-[10px] font-medium mt-0.5">{userShare.email}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[10px] bg-white/5 border border-white/10 px-2 py-1 rounded-lg text-neutral-300 font-bold uppercase tracking-wider">
                        <Shield className="w-3 h-3 text-emerald-400" />
                        {userShare.role}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRevoke(userShare.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-neutral-500 hover:text-red-400 transition-colors cursor-pointer"
                        title="Revoke access"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
