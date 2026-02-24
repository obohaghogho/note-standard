// ====================================
// TEAMS PAGE
// Complete team management + chat UI
// ====================================

import React, { useEffect, useState, useCallback } from 'react';
import { TeamChatProvider, useTeamChat } from '../../context/TeamChatContext';
import { TeamChat } from '../../components/teams/TeamChat';
import { Card } from '../../components/common/Card';
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import SecureImage from '../../components/common/SecureImage';
import { ConfirmationModal } from '../../components/common/ConfirmationModal';
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
    } catch (err) {
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
                   <label className="teams-page__avatar-edit-overlay cursor-pointer">
                     <Camera size={16} />
                     <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} disabled={isUploading} />
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
          <div className="teams-page__info-content">
            <Card className="teams-page__stats-card">
              <div className="teams-page__stat">
                <MessageSquare size={20} />
                <div>
                  <p className="teams-page__stat-value">{teamStats.total_messages.toLocaleString()}</p>
                  <p className="teams-page__stat-label">Messages Sent</p>
                </div>
              </div>
              <div className="teams-page__stat">
                <Users size={20} />
                <div>
                  <p className="teams-page__stat-value">{teamStats.total_members.toLocaleString()}</p>
                  <p className="teams-page__stat-label">Active Members</p>
                </div>
              </div>
              <div className="teams-page__stat">
                <FileText size={20} />
                <div>
                  <p className="teams-page__stat-value">{teamStats.shared_notes.toLocaleString()}</p>
                  <p className="teams-page__stat-label">Notes Shared</p>
                </div>
              </div>
              <div className="teams-page__stat">
                <Calendar size={20} />
                <div>
                  <p className="teams-page__stat-value">
                    {new Date(teamStats.created_at).toLocaleDateString(undefined, { 
                      month: 'short', day: 'numeric', year: 'numeric' 
                    })}
                  </p>
                  <p className="teams-page__stat-label">Team Since</p>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div className="p-4 text-center text-gray-500">
            {loading ? <Loader2 className="animate-spin mx-auto" /> : 'No stats available'}
          </div>
        )}

        {/* Members Preview */}
        <div className="teams-page__members-preview">
          <h4>Members ({members.length})</h4>
          <div className="teams-page__members-list">
            {members.slice(0, 10).map((member) => (
              <div key={member.id} className="teams-page__member-item">
                <div className="teams-page__member-avatar">
                  {member.profile?.avatar_url ? (
                    <SecureImage src={member.profile.avatar_url} alt="" fallbackType="profile" />
                  ) : (
                    member.profile?.full_name?.charAt(0) || 'U'
                  )}
                </div>
                <div className="teams-page__member-info">
                  <span>{member.profile?.full_name || member.profile?.email}</span>
                  <span className="teams-page__member-role">
                    {getRoleIcon(member.role)} {member.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {members.length > 10 && (
            <p className="text-xs text-center text-gray-500 mt-2">Plus {members.length - 10} more members</p>
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
  // State
  const [teams, setTeams] = useState<TeamWithUnreadCount[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
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
    } catch (err) {
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
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
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
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus size={16} />
                Create Team
              </Button>
            </div>
          ) : (
            teams.map((team) => (
              <Card
                key={team.id}
                className={`teams-page__team-card ${
                  selectedTeamId === team.id ? 'teams-page__team-card--active' : ''
                }`}
                onClick={() => { setSelectedTeamId(team.id); setMobileView('chat'); }}
              >
                <div className="teams-page__team-header">
                  <div className="teams-page__team-avatar">
                    {team.avatar_url ? (
                      <SecureImage src={team.avatar_url} alt={team.name} fallbackType="default" />
                    ) : (
                      team.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="teams-page__team-info">
                    <h3>{team.name}</h3>
                    <div className="teams-page__team-meta">
                      {getRoleIcon(team.my_role || 'member')}
                      <span>{team.member_count} members</span>
                    </div>
                  </div>
                  {team.unread_count > 0 && (
                    <div className="teams-page__unread-badge">{team.unread_count}</div>
                  )}
                </div>
                {team.last_message && (
                  <p className="teams-page__last-message">
                    {team.last_message.content ? 
                      (team.last_message.content.length > 40 ? team.last_message.content.substring(0, 40) + '...' : team.last_message.content) : 
                      'Shared an item'}
                  </p>
                )}
              </Card>
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
             onInvite={() => setShowInviteModal(true)}
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
        <div className="teams-page__modal-overlay" onClick={() => setShowCreateModal(false)}>
          <Card
            className="teams-page__modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Create New Team</h2>
            <form onSubmit={handleCreateTeam} className="teams-page__form">
              <div className="teams-page__form-group">
                <label htmlFor="new-team-name">Team name</label>
                <input
                  id="new-team-name"
                  name="teamName"
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g., Design Team"
                  required
                />
              </div>
              <div className="teams-page__form-group">
                <label htmlFor="new-team-desc">Description</label>
                <textarea
                  id="new-team-desc"
                  name="description"
                  value={newTeamDescription}
                  onChange={(e) => setNewTeamDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                />
              </div>
              <div className="teams-page__form-actions">
                <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Team</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="teams-page__modal-overlay" onClick={() => setShowInviteModal(false)}>
          <Card
            className="teams-page__modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Invite Member</h2>
            <form onSubmit={handleInviteMember} className="teams-page__form">
              <div className="teams-page__form-group">
                <label htmlFor="invite-email">Email or Username</label>
                <input
                  id="invite-email"
                  name="email"
                  type="text"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com or username"
                  required
                />
              </div>
              <div className="teams-page__form-group">
                <label htmlFor="invite-role">Role</label>
                <select
                  id="invite-role"
                  name="role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="teams-page__form-actions">
                <Button type="button" variant="ghost" onClick={() => setShowInviteModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Send Invite</Button>
              </div>
            </form>
          </Card>
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
    </div>
  );
};
