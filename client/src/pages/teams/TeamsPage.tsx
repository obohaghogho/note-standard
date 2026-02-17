// ====================================
// TEAMS PAGE - Full Example
// Complete team management + chat UI
// ====================================

import React, { useEffect, useState } from 'react';
import { TeamChatProvider } from '../../context/TeamChatContext';
import { TeamChat } from '../../components/teams/TeamChat';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import {
  getMyTeams,
  createTeam,
  inviteMember,
  getTeamMembers,
  leaveTeam,
  getTeamStats,
} from '../../lib/teamsApi';
import type { TeamWithUnreadCount, TeamMember, TeamStats } from '../../types/teams';
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import SecureImage from '../../components/common/SecureImage';
import './TeamsPage.css';

export const TeamsPage: React.FC = () => {
  // State
  const [teams, setTeams] = useState<TeamWithUnreadCount[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);

  // Form state
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');

  // ====================================
  // LOAD TEAMS
  // ====================================

  const loadTeams = async () => {
    setLoading(true);
    const data = await getMyTeams();
    setTeams(data);
    
    // Auto-select first team if none selected
    if (!selectedTeamId && data.length > 0) {
      setSelectedTeamId(data[0].id);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    loadTeams();
  }, []);

  // ====================================
  // LOAD TEAM DETAILS
  // ====================================

  useEffect(() => {
    if (selectedTeamId) {
      loadTeamDetails();
    }
  }, [selectedTeamId]);

  const loadTeamDetails = async () => {
    if (!selectedTeamId) return;

    const [members, stats] = await Promise.all([
      getTeamMembers(selectedTeamId),
      getTeamStats(selectedTeamId),
    ]);

    setTeamMembers(members);
    setTeamStats(stats);
  };

  // ====================================
  // CREATE TEAM
  // ====================================

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();

    const team = await createTeam({
      name: newTeamName,
      description: newTeamDescription,
    });

    if (team) {
      toast.success('Team created successfully!');
      setShowCreateModal(false);
      setNewTeamName('');
      setNewTeamDescription('');
      await loadTeams();
      setSelectedTeamId(team.id);
    }
  };

  // ====================================
  // INVITE MEMBER
  // ====================================

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) return;

    const member = await inviteMember(selectedTeamId, {
      email: inviteEmail,
      role: inviteRole,
    });

    if (member) {
      toast.success('Member invited successfully!');
      setShowInviteModal(false);
      setInviteEmail('');
      await loadTeamDetails();
    }
  };

  // ====================================
  // LEAVE TEAM
  // ====================================

  const handleLeaveTeam = async () => {
    if (!selectedTeamId) return;
    
    const confirmed = window.confirm('Are you sure you want to leave this team?');
    if (!confirmed) return;

    const success = await leaveTeam(selectedTeamId);
    if (success) {
      toast.success('Left team successfully');
      setSelectedTeamId(null);
      await loadTeams();
    }
  };

  // ====================================
  // GET USER ROLE
  // ====================================

  const getMyRole = (teamId: string): string => {
    const team = teams.find((t) => t.id === teamId);
    return team?.my_role || 'member';
  };

  const getRoleIcon = (role: string) => {
    if (role === 'owner') return <Crown size={14} className="text-yellow-400" />;
    if (role === 'admin') return <Shield size={14} className="text-blue-400" />;
    return <User size={14} className="text-gray-400" />;
  };

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const myRole = selectedTeamId ? getMyRole(selectedTeamId) : 'member';

  // ====================================
  // RENDER
  // ====================================

  if (loading) {
    return (
      <div className="teams-page__loading">
        <Loader2 size={48} className="animate-spin" />
        <p>Loading teams...</p>
      </div>
    );
  }

  return (
    <div className="teams-page">
      {/* Sidebar - Teams List */}
      <div className="teams-page__sidebar">
        <div className="teams-page__sidebar-header">
          <h2>My Teams</h2>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            New Team
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
                onClick={() => setSelectedTeamId(team.id)}
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
                    {team.last_message.content?.substring(0, 50)}...
                  </p>
                )}
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Main Content - Chat */}
      <div className="teams-page__main">
        {selectedTeamId && selectedTeam ? (
          <>
            {/* Team Header */}
            <div className="teams-page__header">
              <div className="teams-page__header-left">
                <h1>{selectedTeam.name}</h1>
                <p>{selectedTeam.description || 'No description'}</p>
              </div>
              <div className="teams-page__header-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowMembersModal(true)}
                >
                  <Users size={16} />
                  Members
                </Button>
                {(myRole === 'owner' || myRole === 'admin') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowInviteModal(true)}
                  >
                    <UserPlus size={16} />
                    Invite
                  </Button>
                )}
                {myRole !== 'owner' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleLeaveTeam}
                    className="text-red-400"
                  >
                    <LogOut size={16} />
                    Leave
                  </Button>
                )}
              </div>
            </div>

            {/* Team Chat */}
            <div className="teams-page__chat">
              <TeamChatProvider teamId={selectedTeamId}>
                <TeamChat teamId={selectedTeamId} />
              </TeamChatProvider>
            </div>
          </>
        ) : (
          <div className="teams-page__no-selection">
            <MessageSquare size={64} />
            <h2>Select a team to start chatting</h2>
            <p>Choose a team from the sidebar or create a new one</p>
          </div>
        )}
      </div>

      {/* Right Sidebar - Team Info */}
      {selectedTeamId && selectedTeam && (
        <div className="teams-page__info">
          <h3>Team Info</h3>

          {/* Stats */}
          {teamStats && (
            <Card className="teams-page__stats-card">
              <div className="teams-page__stat">
                <MessageSquare size={20} />
                <div>
                  <p className="teams-page__stat-value">{teamStats.total_messages}</p>
                  <p className="teams-page__stat-label">Messages</p>
                </div>
              </div>
              <div className="teams-page__stat">
                <Users size={20} />
                <div>
                  <p className="teams-page__stat-value">{teamStats.total_members}</p>
                  <p className="teams-page__stat-label">Members</p>
                </div>
              </div>
              <div className="teams-page__stat">
                <FileText size={20} />
                <div>
                  <p className="teams-page__stat-value">{teamStats.shared_notes}</p>
                  <p className="teams-page__stat-label">Shared Notes</p>
                </div>
              </div>
              <div className="teams-page__stat">
                <Calendar size={20} />
                <div>
                  <p className="teams-page__stat-value">
                    {new Date(teamStats.created_at).toLocaleDateString()}
                  </p>
                  <p className="teams-page__stat-label">Created</p>
                </div>
              </div>
            </Card>
          )}

          {/* Members Preview */}
          <div className="teams-page__members-preview">
            <h4>Members ({teamMembers.length})</h4>
            <div className="teams-page__members-list">
              {teamMembers.slice(0, 5).map((member) => (
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
            {teamMembers.length > 5 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowMembersModal(true)}
                className="w-full mt-2"
              >
                View all {teamMembers.length} members
              </Button>
            )}
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
                <label>Team name</label>
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
                <label>Description</label>
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
                <label>Email address</label>
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="teams-page__form-group">
                <label>Role</label>
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

      {/* Members Modal */}
      {showMembersModal && (
        <div className="teams-page__modal-overlay" onClick={() => setShowMembersModal(false)}>
          <Card
            className="teams-page__modal teams-page__modal--large"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Team Members</h2>
            <div className="teams-page__members-grid">
              {teamMembers.map((member) => (
                <div key={member.id} className="teams-page__member-card">
                  <div className="teams-page__member-avatar-large">
                    {member.profile?.avatar_url ? (
                      <SecureImage src={member.profile.avatar_url} alt="" fallbackType="profile" />
                    ) : (
                      member.profile?.full_name?.charAt(0) || 'U'
                    )}
                  </div>
                  <h4>{member.profile?.full_name || 'Unknown'}</h4>
                  <p>{member.profile?.email}</p>
                  <div className="teams-page__member-badge">
                    {getRoleIcon(member.role)} {member.role}
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              onClick={() => setShowMembersModal(false)}
              className="w-full mt-4"
            >
              Close
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
};
