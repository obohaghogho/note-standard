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
import type { TeamWithUnreadCount, TeamMember } from '../../types/teams';
import {
  Users,
  Plus,
  MessageSquare,
  UserPlus,
  LogOut,
  Crown,
  Shield,
  Loader2,
  ArrowLeft,
  Camera,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import SecureImage from '../../components/common/SecureImage';
import { ConfirmationModal } from '../../components/common/ConfirmationModal';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../utils/cn';
import './TeamsPage.css';

// ====================================
// SUB-COMPONENTS (Defined first to prevent initialization errors)
// ====================================

const TeamHeader: React.FC<{
  team: TeamWithUnreadCount;
  myRole: string;
  onBack: () => void;
  isInfoOpen: boolean;
  onToggleInfo: () => void;
  onInvite: () => void;
}> = ({ team, myRole, onBack, isInfoOpen, onToggleInfo, onInvite }) => {
  return (
    <div className="teams-page__header flex items-center justify-between p-3 md:p-5 bg-gray-900/50 backdrop-blur-3xl border-b border-white/5 z-20">
      <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group" onClick={onToggleInfo}>
         <button 
           className="p-2 -ml-2 text-gray-400 hover:text-white md:hidden"
           onClick={(e) => { e.stopPropagation(); onBack(); }}
         >
           <ArrowLeft size={20} />
         </button>
         <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
            {team.avatar_url ? (
              <SecureImage src={team.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-black text-lg">{team.name.charAt(0).toUpperCase()}</span>
            )}
         </div>
         <div className="min-w-0">
            <h1 className="text-sm md:text-base font-black text-white truncate group-hover:text-primary transition-colors flex items-center gap-2">
              {team.name}
              {(myRole === 'owner' || myRole === 'admin') && <Shield size={12} className="text-primary hidden md:inline" />}
            </h1>
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest truncate mt-0.5">View team information</p>
         </div>
      </div>

      <div className="flex items-center gap-1 md:gap-3">
         <button 
          onClick={onToggleInfo}
          className={cn(
            "p-2.5 rounded-2xl transition-all hidden md:flex active:scale-95",
            isInfoOpen ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-gray-400 hover:bg-white/5"
          )}
         >
            <Users size={20} />
         </button>
         {(myRole === 'owner' || myRole === 'admin') && (
           <button onClick={(e) => { e.stopPropagation(); onInvite(); }} className="p-2.5 text-gray-400 hover:text-primary transition-all rounded-2xl hover:bg-primary/10 active:scale-95">
              <UserPlus size={20} />
           </button>
         )}
      </div>
    </div>
  );
};

const TeamInfoSidebar: React.FC<{
  team: TeamWithUnreadCount;
  myRole: string;
  isOpen: boolean;
  onClose: () => void;
  onLeave: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}> = ({ team, myRole, isOpen, onClose, onLeave, onDelete, onUpdate }) => {
  const { members, teamStats, loading } = useTeamChat();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !team) return;

    const toastId = toast.loading('Uploading avatar...');
    try {
      const url = await uploadTeamImage(team.id, file);
      if (url) {
        await updateTeam(team.id, { avatar_url: url });
        toast.success('Team updated!', { id: toastId });
        onUpdate();
      }
    } catch {
      toast.error('Failed to update team', { id: toastId });
    }
  };

  return (
    <div className={cn(
      "teams-page__info h-full overflow-y-auto bg-gray-900 border-l border-white/5 p-8 flex flex-col gap-10 transition-all duration-500 ease-in-out z-30 shadow-2xl",
      !isOpen && "hidden md:hidden"
    )}>
      {/* Mobile Back Button */}
      <button 
         className="flex items-center gap-3 text-primary text-xs font-black uppercase tracking-[0.2em] md:hidden mb-4 group"
         onClick={onClose}
       >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to Workspace
       </button>

      <div className="flex flex-col items-center text-center gap-6">
          <div className="w-28 h-28 rounded-[2.5rem] bg-gradient-to-br from-blue-500 to-indigo-600 p-1 shadow-2xl relative group cursor-pointer overflow-hidden transition-transform hover:scale-105 active:scale-95">
             <div className="absolute inset-x-0 bottom-0 top-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center">
                <label htmlFor="team-avatar-input" className="cursor-pointer">
                  <Camera size={24} className="text-white" />
                  <input id="team-avatar-input" type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                </label>
             </div>
             {team.avatar_url ? (
               <SecureImage src={team.avatar_url} alt="" className="w-full h-full rounded-[2.25rem] object-cover" />
             ) : (
               <div className="w-full h-full rounded-[2.25rem] flex items-center justify-center text-5xl font-black text-white">
                  {team.name.charAt(0).toUpperCase()}
               </div>
             )}
          </div>
          <div>
             <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">{team.name}</h2>
             <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mt-3">{team.description || 'Verified Team Workspace'}</p>
          </div>
       </div>

       {/* Bento Grid Stats */}
       <div className="grid grid-cols-2 gap-4">
          <div className="p-5 rounded-[2rem] bg-blue-500/5 border border-blue-500/10 flex flex-col justify-between h-32 hover:bg-blue-500/10 transition-colors group">
             <div className="w-9 h-9 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                <MessageSquare size={18} />
             </div>
             <div>
                <div className="text-2xl font-black text-white tracking-tighter italic">{teamStats?.total_messages || '0'}</div>
                <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest mt-1">Activity</div>
             </div>
          </div>
          <div className="p-5 rounded-[2rem] bg-purple-500/5 border border-purple-500/10 flex flex-col justify-between h-32 hover:bg-purple-500/10 transition-colors group">
             <div className="w-9 h-9 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                <Users size={18} />
             </div>
             <div>
                <div className="text-2xl font-black text-white tracking-tighter italic">{team.member_count}</div>
                <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest mt-1">Active Members</div>
             </div>
          </div>
       </div>

       {/* Members List */}
       <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Directory</h4>
            <span className="text-[9px] font-black text-primary bg-primary/10 px-2 py-1 rounded-lg">Online</span>
          </div>
          <div className="space-y-3">
             {loading ? (
                <div className="flex justify-center p-4"><Loader2 className="animate-spin text-primary" size={20} /></div>
             ) : (
                members.slice(0, 5).map((m: TeamMember) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-transparent hover:border-white/5 transition-all group">
                     <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden border border-white/5 group-hover:scale-110 transition-transform flex-shrink-0">
                        {m.profile?.avatar_url ? (
                          <SecureImage src={m.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-black text-gray-400">{m.profile?.full_name?.charAt(0) || 'U'}</span>
                        )}
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-white truncate">{m.profile?.full_name || m.profile?.email}</div>
                        <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest flex items-center gap-1">
                          {m.role === 'owner' && <Crown size={8} className="text-yellow-500" />} {m.role}
                        </div>
                     </div>
                  </div>
                ))
             )}
          </div>
       </div>

       {/* Danger Zone */}
       <div className="mt-auto pt-6 space-y-4">
          <h4 className="text-[10px] font-black text-red-500/50 uppercase tracking-[0.3em]">Security</h4>
          <div className="space-y-3">
             {myRole !== 'owner' ? (
                <button 
                 onClick={onLeave}
                 className="flex items-center justify-center gap-3 w-full p-4 rounded-2xl bg-red-500/5 hover:bg-red-500/10 text-red-400 text-[11px] font-black tracking-widest uppercase transition-all border border-red-500/10 group active:scale-95"
                >
                  <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" /> Exit Workspace
                </button>
             ) : (
                <button 
                 onClick={onDelete}
                 className="flex items-center justify-center gap-3 w-full p-4 rounded-2xl bg-red-500/5 hover:bg-red-500/10 text-red-400 text-[11px] font-black tracking-widest uppercase transition-all border border-red-500/10 group active:scale-95"
                >
                  <Trash2 size={16} className="group-hover:rotate-12 transition-transform" /> Delete Hub
                </button>
             )}
          </div>
       </div>
    </div>
  );
};

// ====================================
// MAIN PAGE COMPONENT
// ====================================

export function TeamsPage() {
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
  const [isInfoOpen, setIsInfoOpen] = useState(false);

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
    try {
      const data = await getMyTeams();
      setTeams(data);
      
      // Auto-select first team if none selected on desktop
      if (!selectedTeamId && data.length > 0 && window.innerWidth > 768) {
        setSelectedTeamId(data[0].id);
      }
    } catch {
      toast.error('Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

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
        toast.error('Failed to create team', { id: toastId });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create team', { id: toastId });
    }
  };

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
      const isEmail = inviteEmail.includes('@');
      const payload: { role: 'member' | 'admin'; email?: string; username?: string } = {
        role: inviteRole,
      };
      if (isEmail) {
        payload.email = inviteEmail.trim();
      } else {
        payload.username = inviteEmail.trim();
      }

      const member = await inviteMember(selectedTeamId, payload);

      if (member) {
        toast.success('Member invited successfully!', { id: toastId });
        setShowInviteModal(false);
        setInviteEmail('');
        await loadTeams();
      } else {
        toast.error('Failed to send invitation', { id: toastId });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to invite member', { id: toastId });
    }
  };

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

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const myRole = selectedTeam?.my_role || 'member';

  if (loading && teams.length === 0) {
    return (
      <div className="teams-page__loading h-screen-safe bg-gray-950 flex flex-col items-center justify-center gap-4 text-white">
        <Loader2 size={48} className="animate-spin text-primary" />
        <p className="font-medium text-gray-400 uppercase tracking-widest text-[10px]">Syncing Workspace...</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "teams-page h-screen-safe bg-black relative",
      mobileView === 'chat' ? 'teams-page--mobile-chat' : 'teams-page--mobile-list',
      isInfoOpen ? 'teams-page--info-open' : 'teams-page--info-closed'
    )}>
      {/* Sidebar - Teams List */}
      <div className="teams-page__sidebar bg-gray-950/50 backdrop-blur-xl border-r border-white/5">
        <div className="teams-page__sidebar-header px-6 py-8 flex items-center justify-between">
          <h2 className="text-xl font-black bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent uppercase tracking-tight">Teams</h2>
          <button 
            onClick={handleNewTeamClick}
            className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 hover:scale-110 active:scale-95 transition-all"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="teams-page__teams-list p-3 space-y-2 overflow-y-auto scrollbar-hide">
          {teams.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center gap-4 opacity-50">
              <Users size={48} className="text-gray-600" />
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest leading-loose">No active teams found.<br/>Start collaborating today.</p>
              <Button size="sm" onClick={handleNewTeamClick} className="rounded-xl">Create New</Button>
            </div>
          ) : (
            teams.map((team) => (
              <div
                key={team.id}
                className={cn(
                  "p-3 rounded-2xl cursor-pointer transition-all duration-300 border border-transparent group",
                  selectedTeamId === team.id 
                    ? "bg-primary/10 border-primary/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]" 
                    : "hover:bg-white/5"
                )}
                onClick={() => { setSelectedTeamId(team.id); setMobileView('chat'); setIsInfoOpen(false); }}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform",
                    selectedTeamId === team.id && "ring-2 ring-primary ring-offset-2 ring-offset-black"
                  )}>
                    {team.avatar_url ? (
                      <SecureImage src={team.avatar_url} alt="" className="w-full h-full object-cover rounded-xl" fallbackType="default" />
                    ) : (
                      <span className="text-white font-black text-lg">{team.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">{team.name}</h3>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-wider">{team.member_count} Members</p>
                  </div>
                  {team.unread_count > 0 && (
                    <div className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center animate-pulse shadow-lg shadow-red-500/20">
                      {team.unread_count}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedTeamId && selectedTeam ? (
        <TeamChatProvider teamId={selectedTeamId}>
          <div className="teams-page__main flex flex-col h-full bg-gray-950 overflow-hidden relative">
             <TeamHeader 
               team={selectedTeam} 
               myRole={myRole}
               onBack={() => setMobileView('list')}
               isInfoOpen={isInfoOpen}
               onToggleInfo={() => setIsInfoOpen(!isInfoOpen)}
               onInvite={handleInviteClick}
             />

             <div className="flex-1 overflow-hidden">
                <TeamChat teamId={selectedTeamId} />
             </div>
          </div>

          <TeamInfoSidebar 
            team={selectedTeam}
            myRole={myRole}
            isOpen={isInfoOpen}
            onClose={() => setIsInfoOpen(false)}
            onLeave={() => setConfirmModal({ isOpen: true, type: 'leave' })}
            onDelete={() => setConfirmModal({ isOpen: true, type: 'delete' })}
            onUpdate={loadTeams}
          />
        </TeamChatProvider>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 bg-gray-950 p-8 text-center text-white relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]"></div>
          <div className="w-24 h-24 bg-primary/10 rounded-[2.5rem] flex items-center justify-center text-primary shadow-2xl shadow-primary/20 relative animate-pulse">
            <Users size={48} />
          </div>
          <div className="relative">
            <h2 className="text-3xl font-black mb-4 tracking-tight uppercase">Select a Team</h2>
            <p className="text-gray-500 max-w-sm text-sm font-bold uppercase tracking-widest leading-loose">Choose a workspace from the sidebar to continue collaborating with your team.</p>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="teams-page__modal-overlay backdrop-blur-md bg-black/60 flex items-center justify-center z-[100] p-4" onClick={() => setShowCreateModal(false)}>
          <div 
            className="bg-gray-900 border border-white/10 p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-black text-white mb-8 uppercase tracking-tighter italic">Create New Team</h2>
            <form onSubmit={handleCreateTeam} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] pl-1">Team Name</label>
                <input
                  id="new-team-name"
                  name="teamName"
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Engineering Core"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold placeholder:opacity-20"
                  required
                />
              </div>
              <Button type="submit" fullWidth className="h-16 font-black rounded-2xl text-lg shadow-xl shadow-primary/20">Init Workspace</Button>
            </form>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="teams-page__modal-overlay backdrop-blur-md bg-black/60 flex items-center justify-center z-[100] p-4" onClick={() => setShowInviteModal(false)}>
          <div 
            className="bg-gray-900 border border-white/10 p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-black text-white mb-8 uppercase tracking-tighter italic">Invite Member</h2>
            <form onSubmit={handleInviteMember} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] pl-1">Email or Username</label>
                <input
                  id="invite-email"
                  name="email"
                  type="text"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@notes.com"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold placeholder:opacity-20"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] pl-1">Access Level</label>
                <select
                  id="invite-role"
                  name="role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none font-bold"
                >
                  <option value="member">Member</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <Button type="submit" fullWidth className="h-16 font-black rounded-2xl text-lg shadow-xl shadow-primary/20">Send Invite</Button>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.type === 'leave' ? handleLeaveTeam : handleDeleteTeam}
        isLoading={isDeleting}
        title={confirmModal.type === 'leave' ? 'Leave Team' : 'Delete Team'}
        message={
          confirmModal.type === 'leave'
            ? `Are you sure you want to leave ${selectedTeam?.name}?`
            : `Warning: This will PERMANENTLY delete the entire team and history for all members.`
        }
        confirmText={confirmModal.type === 'leave' ? 'Leave' : 'Delete Now'}
        variant="danger"
      />

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="teams-page__modal-overlay backdrop-blur-md bg-black/60 flex items-center justify-center z-[100] p-4" onClick={() => setShowUpgradeModal(false)}>
           <div className="bg-gray-900 border border-blue-500/30 p-10 rounded-[3rem] w-full max-w-md shadow-2xl text-center space-y-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[80px]"></div>
              <div className="w-20 h-20 bg-blue-500/20 rounded-3xl flex items-center justify-center mx-auto text-blue-400 group-hover:scale-110 transition-transform">
                  <Shield size={40} />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Business Required</h2>
                <p className="text-gray-500 text-sm font-bold uppercase tracking-widest leading-loose">
                  Advanced team collaboration tools are exclusive to our <span className="text-white">Business Tier</span>.
                </p>
              </div>
              <Button 
                fullWidth 
                className="bg-blue-600 hover:bg-blue-500 h-16 text-lg font-black rounded-2xl shadow-xl shadow-blue-500/20"
                onClick={() => navigate('/dashboard/billing')}
              >
                  Upgrade Hub
              </Button>
           </div>
        </div>
      )}
    </div>
  );
}

export default TeamsPage;
