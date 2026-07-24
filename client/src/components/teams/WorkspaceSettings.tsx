import React, { useState } from 'react';
import { 
  Settings, Palette, Mail, ShieldAlert, Key, Clipboard, 
  Trash2, ArrowRight, Save, KeyRound 
} from 'lucide-react';
import { updateTeam, inviteMember, deleteTeam } from '../../lib/teamsApi';
import { getWorkspaceWebhookSecret } from '../../lib/collaborationApi';
import { Button } from '../common/Button';
import toast from 'react-hot-toast';

interface WorkspaceSettingsProps {
  teamId: string;
  teamName: string;
  teamDesc: string;
  myRole: string;
  onRefresh: () => void;
  onDeleted: () => void;
}

export const WorkspaceSettings: React.FC<WorkspaceSettingsProps> = ({ 
  teamId, teamName, teamDesc, myRole, onRefresh, onDeleted 
}) => {
  const [name, setName] = useState(teamName);
  const [description, setDescription] = useState(teamDesc);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);

  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    const toastId = toast.loading('Saving workspace details...');
    try {
      await updateTeam(teamId, { name: name.trim(), description: description.trim() });
      toast.success('Workspace details saved successfully!', { id: toastId });
      onRefresh();
    } catch {
      toast.error('Failed to save settings.', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    const toastId = toast.loading('Sending invitation...');
    try {
      await inviteMember(teamId, inviteEmail.trim(), inviteRole);
      toast.success(`Invitation successfully sent to ${inviteEmail}`, { id: toastId });
      setInviteEmail('');
    } catch (err: any) {
      toast.error(err?.message || 'Invitation failed.', { id: toastId });
    } finally {
      setInviting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("CRITICAL WARNING: This will permanently delete the entire workspace, projects, files, tasks, and chat history. There is no undo. Type OK to confirm deletion.")) return;
    const toastId = toast.loading('Deleting workspace...');
    try {
      await deleteTeam(teamId);
      toast.success('Workspace deleted.', { id: toastId });
      onDeleted();
    } catch {
      toast.error('Deletion failed.', { id: toastId });
    }
  };

  const copyWebhookSecret = async () => {
    setLoadingSecret(true);
    try {
      const secret = webhookSecret || await getWorkspaceWebhookSecret(teamId);
      setWebhookSecret(secret);
      await navigator.clipboard.writeText(secret);
      toast.success('Webhook Secret copied to clipboard!');
    } catch {
      toast.error('Failed to retrieve webhook secret.');
    } finally {
      setLoadingSecret(false);
    }
  };

  const isAdmin = myRole === 'owner' || myRole === 'admin';

  return (
    <div className="p-6 md:p-8 space-y-8 overflow-y-auto h-full scrollbar-hide bg-black text-white max-w-4xl mx-auto">
      {/* Workspace Branding & Info */}
      <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 space-y-6">
        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest pl-1 flex items-center gap-2">
          <Palette size={14} /> Workspace Branding & Details
        </h3>

        <form onSubmit={handleSaveInfo} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Workspace Title</label>
              <input 
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-3.5 text-xs text-white focus:outline-none"
                disabled={!isAdmin}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Brand Theme Color</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded-xl bg-transparent border-none cursor-pointer focus:outline-none"
                  disabled={!isAdmin}
                />
                <span className="text-xs font-bold text-gray-400 font-mono">{primaryColor.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Workspace Description</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-3.5 text-xs text-white focus:outline-none min-h-[80px]"
              disabled={!isAdmin}
            />
          </div>

          {isAdmin && (
            <Button type="submit" disabled={saving} className="rounded-xl flex items-center gap-2 ml-auto">
              <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          )}
        </form>
      </div>

      {/* Invite Members */}
      {isAdmin && (
        <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 space-y-6">
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest pl-1 flex items-center gap-2">
            <Mail size={14} /> Invite New Members
          </h3>

          <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 space-y-1 w-full">
              <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Member Email</label>
              <input 
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@domain.com"
                className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-3.5 text-xs text-white focus:outline-none"
                required
              />
            </div>

            <div className="w-full md:w-44 space-y-1">
              <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">System Role</label>
              <select 
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-3.5 text-xs text-gray-300 focus:outline-none"
              >
                <option value="member">Member</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            <Button type="submit" disabled={inviting} className="rounded-xl h-[46px] flex items-center gap-2 w-full md:w-auto">
              Send Invite <ArrowRight size={16} />
            </Button>
          </form>
        </div>
      )}

      {/* Developer API Keys */}
      <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 space-y-6">
        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest pl-1 flex items-center gap-2">
          <KeyRound size={14} /> Integration Webhook Secrets
        </h3>
        
        <p className="text-[11px] text-gray-500 leading-relaxed font-bold uppercase tracking-widest">
          Configure external endpoints to subscribe to real-time project status and tasks progression updates.
        </p>

        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex justify-between items-center gap-4">
          <div className="min-w-0">
            <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Signing Secret key</div>
            <div className="text-xs text-gray-300 font-mono truncate mt-1">
              {webhookSecret ? webhookSecret : `whsec_${'•'.repeat(32)}`}
            </div>
          </div>
          <button
            onClick={copyWebhookSecret}
            disabled={loadingSecret}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 hover:text-white text-gray-400 active:scale-95 transition-all flex-shrink-0 disabled:opacity-50"
          >
            <Clipboard size={16} />
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      {myRole === 'owner' && (
        <div className="p-6 rounded-[2.5rem] border border-red-500/20 bg-red-500/[0.02] space-y-6">
          <h3 className="text-xs font-black text-red-400 uppercase tracking-widest pl-1 flex items-center gap-2">
            <ShieldAlert size={14} /> Danger Zone
          </h3>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h4 className="font-bold text-sm text-white">Delete Workspace</h4>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Permanently delete this collaboration hub and all related files.</p>
            </div>

            <Button variant="danger" onClick={handleDelete} className="rounded-xl flex items-center gap-2">
              <Trash2 size={16} /> Delete Hub
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
export default WorkspaceSettings;
