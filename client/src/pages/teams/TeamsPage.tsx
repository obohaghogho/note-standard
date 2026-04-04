// ====================================
// TEAMS PAGE
// Complete team management + chat UI
// ====================================

import React, { useEffect, useState, useCallback } from 'react';
import { TeamChatProvider, useTeamChat } from '../../context/TeamChatContext';
import { TeamChat } from '../../components/teams/TeamChat';
import { Button } from '../../components/common/Button';
import {
  getMyTeams,
  createTeam,
  inviteMember,
  leaveTeam,
  deleteTeam,
  uploadTeamImage,
  updateTeam,
} from '../../lib/teamsApi';
import type { TeamWithUnreadCount } from '../../types/teams';
import {
  Users,
  Plus,
  MessageSquare,
  UserPlus,
  LogOut,
  Crown,
  Shield,
  User,
  FileText,
  Calendar,
  Loader2,
  ArrowLeft,
  Camera,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import SecureImage from '../../components/common/SecureImage';
import { ConfirmationModal } from '../../components/common/ConfirmationModal';
import { useAuth } from '../../context/AuthContext';

import { useNavigate } from 'react-router-dom';
import './TeamsPage.css';

// ====================================
// INNER CONTENT COMPONENT
// Accesses TeamChatContext
// ====================================

const TeamContent: React.FC<{
  selectedTeam: TeamWithUnreadCount;
  myRole: string;
  onLeave: () => void;
  onInvite: () => void;
  onBack: () => void;
  onTeamUpdate: () => void;
  onDelete: () => void;
}> = ({ selectedTeam, myRole, onLeave, onInvite, onBack, onTeamUpdate, onDelete }) => {
  const { members, teamStats, loading } = useTeamChat();
  const [isUploading, setIsUploading] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTeam) return;

    setIsUploading(true);
    const toastId = toast.loading('Uploading team avatar...');
    try {
      const url = await uploadTeamImage(selectedTeam.id, file);
      if (url) {
        await updateTeam(selectedTeam.id, { avatar_url: url });
        toast.success('Team avatar updated!', { id: toastId });
        onTeamUpdate();
      }
    } catch {
      toast.error('Failed to update avatar', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    if (role === 'owner') return <Crown size={14} className="text-yellow-400" />;
    if (role === 'admin') return <Shield size={14} className="text-blue-400" />;
    return <User size={14} className="text-gray-400" />;
  };

  return (
    <>
      {/* Main Content - Chat */}
      <div className="teams-page__main">
        {/* Team Header */}
        <div className="teams-page__header">
          <div className="teams-page__header-left">
            <button
              className="teams-page__back-button"
              onClick={onBack}
              aria-label="Back to teams list"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="relative group">
              <div className="teams-page__header-avatar">
                 {selectedTeam.avatar_url ? (
                   <SecureImage src={selectedTeam.avatar_url} alt="" fallbackType="default" />
                 ) : (
                   selectedTeam.name.charAt(0).toUpperCase()
                 )}
                 {(myRole === 'owner' || myRole === 'admin') && (
                   <label htmlFor="team-avatar-upload" className="teams-page__avatar-edit-overlay cursor-pointer">
                     <Camera size={16} />
                                           <input 
                        id="team-avatar-upload"
                        name="team-avatar-upload"
                        type="file" 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleAvatarChange} 
                        disabled={isUploading} 
                      />

                   </label>
                 )}
              </div>
            </div>
            <div>
              <h1>{selectedTeam.name}</h1>
              <p>{selectedTeam.description || 'No description'}</p>
            </div>
          </div>
          <div className="teams-page__header-actions">
            {(myRole === 'owner' || myRole === 'admin') && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onInvite}
              >
                <UserPlus size={16} />
                Invite
              </Button>
            )}
            {myRole !== 'owner' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onLeave}
                className="text-red-400"
              >
                <LogOut size={16} />
                Leave
              </Button>
            )}
            {myRole === 'owner' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                className="text-red-400"
              >
                <Trash2 size={16} />
                Delete Team
              </Button>
            )}
          </div>
        </div>

        {/* Team Chat */}
        <div className="teams-page__chat">
          <TeamChat teamId={selectedTeam.id} />
        </div>
      </div>

      {/* Right Sidebar - Team Info */}
      <div className="teams-page__info">
        <h3>Team Info</h3>

        {/* Stats */}
        {teamStats ? (
          <div className="teams-page__info-content animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="grid grid-cols-1 gap-4">
              <div className="teams-page__stat bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-2xl hover:bg-white/10 transition-all transition-transform hover:scale-[1.02] group">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <p className="teams-page__stat-value text-xl font-bold">{teamStats.total_messages.toLocaleString()}</p>
                  <p className="teams-page__stat-label text-[10px] uppercase tracking-wider text-gray-500 font-bold">Messages</p>
                </div>
              </div>
              <div className="teams-page__stat bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-2xl hover:bg-white/10 transition-all transition-transform hover:scale-[1.02] group">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 group-hover:scale-110 transition-transform">
                  <Users size={20} />
                </div>
                <div>
                  <p className="teams-page__stat-value text-xl font-bold">{teamStats.total_members.toLocaleString()}</p>
                  <p className="teams-page__stat-label text-[10px] uppercase tracking-wider text-gray-500 font-bold">Members</p>
                </div>
              </div>
              <div className="teams-page__stat bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-2xl hover:bg-white/10 transition-all transition-transform hover:scale-[1.02] group">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                  <FileText size={20} />
                </div>
                <div>
                  <p className="teams-page__stat-value text-xl font-bold">{teamStats.shared_notes.toLocaleString()}</p>
                  <p className="teams-page__stat-label text-[10px] uppercase tracking-wider text-gray-500 font-bold">Notes</p>
                </div>
              </div>
              <div className="teams-page__stat bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-2xl hover:bg-white/10 transition-all transition-transform hover:scale-[1.02] group">
                <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 group-hover:scale-110 transition-transform">
                  <Calendar size={20} />
                </div>
                <div>
                  <p className="teams-page__stat-value text-sm font-bold">
                    {new Date(teamStats.created_at).toLocaleDateString(undefined, { 
                      month: 'short', day: 'numeric', year: 'numeric' 
                    })}
                  </p>
                  <p className="teams-page__stat-label text-[10px] uppercase tracking-wider text-gray-500 font-bold">Since</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-10 text-center text-gray-500 bg-white/5 rounded-2xl border border-dashed border-white/10">
            {loading ? <Loader2 className="animate-spin mx-auto text-blue-500" /> : 'No stats available'}
          </div>
        )}

        {/* Members Preview */}
        <div className="teams-page__members-preview mt-8">
          <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 px-1">Members ({members.length})</h4>
          <div className="teams-page__members-list space-y-2">
            {members.slice(0, 10).map((member) => (
              <div key={member.id} className="teams-page__member-item flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-all group">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center overflow-hidden border border-white/10 group-hover:scale-110 transition-transform">
                  {member.profile?.avatar_url ? (
                    <SecureImage src={member.profile.avatar_url} alt="" fallbackType="profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-gray-300">{member.profile?.full_name?.charAt(0) || 'U'}</span>
                  )}
                </div>
                <div className="teams-page__member-info flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-gray-200 truncate">{member.profile?.full_name || member.profile?.email}</span>
                  <span className="teams-page__member-role flex items-center gap-1 text-[10px] text-gray-500 font-bold">
                    {getRoleIcon(member.role)} {member.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {members.length > 10 && (
            <p className="text-[10px] text-center text-gray-600 font-bold mt-4 uppercase tracking-tighter">+{members.length - 10} others</p>
          )}
        </div>
      </div>
    </>
  );
};

// ====================================
// MAIN PAGE COMPONENT
// ====================================

export const TeamsPage: React.FC = () => {
  const { isBusiness } = useAuth();
  const navigate = useNavigate();
  // State
  const [teams, setTeams] = useState<TeamWithUnreadCount[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Form state
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'leave' | 'delete';
  }>({
    isOpen: false,
    type: 'leave'
  });

  // ====================================
  // LOAD TEAMS
  // ====================================

  const loadTeams = useCallback(async () => {
    setLoading(true);
    const data = await getMyTeams();
    setTeams(data);
    
    // Auto-select first team if none selected
    if (!selectedTeamId && data.length > 0) {
      setSelectedTeamId(data[0].id);
    }
    
    setLoading(false);
  }, [selectedTeamId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  // ====================================
  // CREATE TEAM
  // ====================================
  
  const handleNewTeamClick = () => {
    if (!isBusiness) {
      setShowUpgradeModal(true);
    } else {
      setShowCreateModal(true);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    const toastId = toast.loading('Creating team...');

    try {
      const team = await createTeam({
        name: newTeamName,
        description: newTeamDescription,
      });

      if (team) {
        toast.success('Team created successfully!', { id: toastId });
        setShowCreateModal(false);
        setNewTeamName('');
        setNewTeamDescription('');
        await loadTeams();
        setSelectedTeamId(team.id);
        setMobileView('chat');
      } else {
        toast.error('Failed to create team. Please try again.', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create team', { id: toastId });
    }
  };

  // ====================================
  // INVITE MEMBER
  // ====================================

  const handleInviteClick = () => {
    if (!isBusiness) {
      setShowUpgradeModal(true);
    } else {
      setShowInviteModal(true);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) return;

    const toastId = toast.loading('Sending invitation...');

    try {
      const member = await inviteMember(selectedTeamId, {
        email: inviteEmail,
        role: inviteRole,
      });

      if (member) {
        toast.success('Member invited successfully!', { id: toastId });
        setShowInviteModal(false);
        setInviteEmail('');
        // Real-time will handle the update if we are in the Provider, 
        // but for the sidebar we might need a refresh
        await loadTeams();
      } else {
        toast.error('Failed to send invitation. Check the email and try again.', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to invite member', { id: toastId });
    }
  };

  // ====================================
  // LEAVE TEAM
  // ====================================

  const handleLeaveTeam = async () => {
    if (!selectedTeamId) return;
    setConfirmModal({ isOpen: false, type: 'leave' });

    const toastId = toast.loading('Leaving team...');
    const success = await leaveTeam(selectedTeamId);
    if (success) {
      toast.success('Left team successfully', { id: toastId });
      setSelectedTeamId(null);
      setMobileView('list');
      await loadTeams();
    } else {
      toast.error('Failed to leave team', { id: toastId });
    }
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeamId) return;
    setConfirmModal({ isOpen: false, type: 'delete' });
    setIsDeleting(true);

    const toastId = toast.loading('Deleting team...');
    try {
      const success = await deleteTeam(selectedTeamId);
      if (success) {
        toast.success('Team deleted successfully', { id: toastId });
        setSelectedTeamId(null);
        setMobileView('list');
        await loadTeams();
      } else {
        toast.error('Failed to delete team', { id: toastId });
      }
    } catch {
      toast.error('Error deleting team', { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleIcon = (role: string) => {
    if (role === 'owner') return <Crown size={14} className="text-yellow-400" />;
    if (role === 'admin') return <Shield size={14} className="text-blue-400" />;
    return <User size={14} className="text-gray-400" />;
  };

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const myRole = selectedTeam?.my_role || 'member';

  // ====================================
  // RENDER
  // ====================================

  if (loading && teams.length === 0) {
    return (
      <div className="teams-page__loading">
        <Loader2 size={48} className="animate-spin" />
        <p>Loading your teams...</p>
      </div>
    );
  }

  return (
    <div className={`teams-page ${mobileView === 'chat' ? 'teams-page--mobile-chat' : 'teams-page--mobile-list'}`}>
      {/* Sidebar - Teams List */}
      <div className="teams-page__sidebar">
        <div className="teams-page__sidebar-header">
          <h2>My Teams</h2>
          <Button size="sm" onClick={handleNewTeamClick}>
            <Plus size={16} />
            New
          </Button>
        </div>

        <div className="teams-page__teams-list">
          {teams.length === 0 ? (
            <div className="teams-page__empty">
              <Users size={48} />
              <h3>No teams yet</h3>
              <p>Create a team to start collaborating</p>
              <Button onClick={handleNewTeamClick}>
                <Plus size={16} />
                Create Team
              </Button>
            </div>
          ) : (
            teams.map((team) => (
              <div
                key={team.id}
                className={`flex flex-col gap-3 p-4 cursor-pointer rounded-2xl transition-all duration-300 border border-white/5 relative group ${
                  selectedTeamId === team.id 
                  ? 'bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-blue-500/50 shadow-lg shadow-blue-900/20' 
                  : 'hover:bg-white/5 hover:border-white/10'
                }`}
                onClick={() => { setSelectedTeamId(team.id); setMobileView('chat'); }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center overflow-hidden shadow-lg group-hover:scale-105 transition-transform ${selectedTeamId === team.id ? 'ring-2 ring-white/20 ring-offset-2 ring-offset-black/50' : ''}`}>
                    {team.avatar_url ? (
                      <SecureImage src={team.avatar_url} alt={team.name} fallbackType="default" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold text-xl">{team.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold truncate text-white mb-1">{team.name}</h3>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                      <span className="flex items-center gap-1">{getRoleIcon(team.my_role || 'member')} {team.my_role}</span>
                      <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                      <span>{team.member_count} members</span>
                    </div>
                  </div>
                  {team.unread_count > 0 && (
                    <div className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg animate-pulse">{team.unread_count}</div>
                  )}
                </div>
                {team.last_message && (
                  <p className="text-[11px] text-gray-500 line-clamp-1 italic px-1 opacity-70 group-hover:opacity-100 transition-opacity">
                    {team.last_message.content ? 
                      (team.last_message.content.length > 40 ? team.last_message.content.substring(0, 40) + '...' : team.last_message.content) : 
                      '📎 Shared an item'}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {selectedTeamId && selectedTeam ? (
        <TeamChatProvider teamId={selectedTeamId}>
           <TeamContent 
             selectedTeam={selectedTeam} 
             myRole={myRole}
             onLeave={() => setConfirmModal({ isOpen: true, type: 'leave' })}
             onInvite={handleInviteClick}
             onBack={() => setMobileView('list')}
             onTeamUpdate={() => loadTeams()}
             onDelete={() => setConfirmModal({ isOpen: true, type: 'delete' })}
           />
        </TeamChatProvider>
      ) : (
        <div className="teams-page__main">
          <div className="teams-page__no-selection">
            <MessageSquare size={64} />
            <h2>Select a team to start chatting</h2>
            <p>Choose a team from the sidebar or create a new one</p>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="teams-page__modal-overlay backdrop-blur-md bg-black/60 flex items-center justify-center z-50 animate-in fade-in duration-300" onClick={() => setShowCreateModal(false)}>
          <div 
            className="bg-[#0f172a]/90 backdrop-blur-xl border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
                <Plus size={24} />
              </div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Create New Team</h2>
            </div>
            <form onSubmit={handleCreateTeam} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="new-team-name" className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Team Name</label>
                <input
                  id="new-team-name"
                  name="teamName"
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g., Creative Engineering"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="new-team-desc" className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Description</label>
                <textarea
                  id="new-team-desc"
                  name="description"
                  value={newTeamDescription}
                  onChange={(e) => setNewTeamDescription(e.target.value)}
                  placeholder="What's this team about?"
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="ghost" fullWidth onClick={() => setShowCreateModal(false)} className="h-12 rounded-xl">
                  Cancel
                </Button>
                <Button type="submit" fullWidth className="h-12 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-900/20">
                  Create Team
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="teams-page__modal-overlay backdrop-blur-md bg-black/60 flex items-center justify-center z-50 animate-in fade-in duration-300" onClick={() => setShowInviteModal(false)}>
          <div 
            className="bg-[#0f172a]/90 backdrop-blur-xl border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400">
                <UserPlus size={24} />
              </div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Invite Member</h2>
            </div>
            <form onSubmit={handleInviteMember} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="invite-email" className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Email or Username</label>
                <input
                  id="invite-email"
                  name="email"
                  type="text"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="collaborator@example.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-medium"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="invite-role" className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Role</label>
                <select
                  id="invite-role"
                  name="role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-medium appearance-none cursor-pointer"
                >
                  <option value="member">Member (Read & Write)</option>
                  <option value="admin">Admin (Full Control)</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="ghost" fullWidth onClick={() => setShowInviteModal(false)} className="h-12 rounded-xl">
                  Cancel
                </Button>
                <Button type="submit" fullWidth className="h-12 rounded-xl bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-900/20">
                  Send Invite
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete/Leave Team Confirmation */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.type === 'leave' ? handleLeaveTeam : handleDeleteTeam}
        isLoading={isDeleting}
        title={confirmModal.type === 'leave' ? 'Leave Team' : 'Delete Team'}
        message={
          confirmModal.type === 'leave'
            ? `Are you sure you want to leave ${selectedTeam?.name}? You will lose access to all messages and shared notes.`
            : `Are you sure you want to PERMANENTLY delete ${selectedTeam?.name}? This will remove the team and all its history for everyone. This cannot be undone.`
        }
        confirmText={confirmModal.type === 'leave' ? 'Leave Team' : 'Delete Everything'}
        variant="danger"
      />

      {/* Upgrade to Business Modal */}
      {showUpgradeModal && (
        <div className="teams-page__modal-overlay backdrop-blur-md bg-black/60 flex items-center justify-center z-50 animate-in fade-in duration-300" onClick={() => setShowUpgradeModal(false)}>
           <div 
             className="bg-[#0f172a]/95 backdrop-blur-2xl border border-blue-500/20 p-10 rounded-[2rem] w-full max-w-md shadow-2xl shadow-blue-900/40 text-center space-y-8 animate-in zoom-in-95 duration-300 relative overflow-hidden"
             onClick={(e) => e.stopPropagation()}
           >
              {/* Decorative Background Elements */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full"></div>
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-500/10 blur-3xl rounded-full"></div>
              
              <div className="relative">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-xl rotate-12 group-hover:rotate-0 transition-transform duration-500">
                    <Shield size={48} className="text-white -rotate-12" />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-black font-black text-[10px] px-2 py-1 rounded-lg shadow-lg rotate-12">
                  PREMIUM
                </div>
              </div>

              <div className="space-y-3">
                  <h2 className="text-3xl font-black tracking-tight text-white">Business Tier</h2>
                  <p className="text-gray-400 text-sm leading-relaxed px-4">
                    Unlock <span className="text-white font-bold">Team Management</span> and collaborate seamlessly with your organization. 
                    Upgrade now to access advanced shared features.
                  </p>
              </div>

              <div className="space-y-4 pt-4">
                  <Button 
                    fullWidth 
                    className="bg-blue-600 hover:bg-blue-500 h-14 text-lg font-bold rounded-2xl shadow-xl shadow-blue-900/30 transition-all active:scale-95 flex items-center justify-center gap-2 group"
                    onClick={() => navigate('/dashboard/billing')}
                  >
                      Upgrade My Workspace
                      <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </Button>
                  <button 
                    className="w-full text-xs font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest py-2"
                    onClick={() => setShowUpgradeModal(false)}
                  >
                      Stay on Free Tier
                  </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default TeamsPage;
