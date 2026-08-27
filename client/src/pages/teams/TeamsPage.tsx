// ====================================
// TEAMS PAGE
// Modern Enterprise Collaboration Hub
// ====================================

import React, { useEffect, useState, useCallback } from 'react';
import { TeamChatProvider, useTeamChat } from '../../context/TeamChatContext';
import { TeamChat } from '../../components/teams/TeamChat';
import { Button } from '../../components/common/Button';
import {
  getMyTeams,
  createTeam,
} from '../../lib/teamsApi';
import type { TeamWithUnreadCount, TeamMember } from '../../types/teams';
import {
  Users, Plus, Loader2, ArrowLeft,
  Video, LayoutGrid, CheckSquare, HardDrive,
  Calendar, Megaphone, BarChart2, Settings, Menu, X, MessageSquare,
  Shield, UserPlus
} from 'lucide-react';
import toast from 'react-hot-toast';
import SecureImage from '../../components/common/SecureImage';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { useAgoraCall } from '../../hooks/useAgoraCall';
import { useSocket } from '../../context/SocketContext';
import { TeamCallOverlay } from '../../components/teams/TeamCallOverlay';
import { TeamEnterpriseDashboard } from '../../components/teams/TeamEnterpriseDashboard';
import ExecutiveOverview from '../../components/teams/ExecutiveOverview';
import { BarChart3 } from 'lucide-react';
import './TeamsPage.css';

// Tab Configuration
const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'projects', label: 'Projects', icon: CheckSquare },
  { id: 'files', label: 'Files', icon: HardDrive },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'meetings', label: 'Meetings', icon: Video },
  { id: 'announcements', label: 'Bulletins', icon: Megaphone },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface TeamHeaderProps {
  team: TeamWithUnreadCount;
  myRole: string;
  onBack: () => void;
  isInfoOpen: boolean;
  onToggleInfo: () => void;
  onInvite: () => void;
  onJoinCall?: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

const TeamHeader: React.FC<TeamHeaderProps> = ({ team, myRole, onBack, isInfoOpen, onToggleInfo, onInvite, onJoinCall, activeTab, onSelectTab }) => {

  return (
    <div className="teams-page__header flex items-center justify-between p-2.5 md:p-5 bg-gray-900/50 backdrop-blur-3xl border-b border-white/5 z-20 gap-2 min-w-0">
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1 cursor-pointer group" onClick={onToggleInfo}>
         <button 
           className="p-1.5 -ml-1 text-gray-400 hover:text-white md:hidden shrink-0"
           onClick={(e) => { e.stopPropagation(); onBack(); }}
         >
           <ArrowLeft size={18} />
         </button>
         <div className="w-9 h-9 md:w-11 md:h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
            {team.avatar_url ? (
              <SecureImage src={team.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-black text-base md:text-lg">{(team.name || 'T').charAt(0).toUpperCase()}</span>
            )}
         </div>
         <div className="min-w-0 flex-1">
            <h1 className="text-xs md:text-base font-black text-white truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
              <span className="truncate">{team?.name || 'Unnamed Team'}</span>
              {(myRole === 'owner' || myRole === 'admin') && <Shield size={12} className="text-primary hidden md:inline shrink-0" />}
            </h1>
            <p className="text-[9px] md:text-[10px] text-gray-500 font-black uppercase tracking-widest truncate mt-0.5">View team info</p>
         </div>
      </div>

      <div className="flex items-center gap-1 md:gap-3 shrink-0">
         {/* Toggle Chat vs Enterprise Workspace */}
         <div className="flex items-center bg-gray-800/80 p-0.5 md:p-1 rounded-2xl border border-white/10 shrink-0">
            <button
              onClick={() => onSelectTab('chat')}
              className={cn(
                "px-2 md:px-3 py-1 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center gap-1",
                activeTab === 'chat' ? "bg-blue-600 text-white shadow-md" : "text-gray-400 hover:text-white"
              )}
            >
              <MessageSquare size={13} />
              <span className="hidden sm:inline">Chat</span>
            </button>
            <button
              onClick={() => onSelectTab(activeTab === 'chat' ? 'overview' : activeTab)}
              className={cn(
                "px-2 md:px-3 py-1 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center gap-1",
                activeTab !== 'chat' ? "bg-blue-600 text-white shadow-md" : "text-gray-400 hover:text-white"
              )}
            >
              <BarChart3 size={13} />
              <span className="hidden xs:inline">Workspace</span>
            </button>
         </div>

         <button 
          onClick={(e) => { e.stopPropagation(); onJoinCall(); }}
          className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-400/10 transition-all rounded-2xl active:scale-95 shrink-0"
          title="Join Conference Call"
         >
            <Video size={18} />
         </button>
         <button 
          onClick={onToggleInfo}
          className={cn(
            "p-2 rounded-2xl transition-all hidden md:flex active:scale-95 shrink-0",
            isInfoOpen ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-gray-400 hover:bg-white/5"
          )}
         >
            <Users size={18} />
         </button>
         {(myRole === 'owner' || myRole === 'admin') && (
           <button onClick={(e) => { e.stopPropagation(); onInvite(); }} className="p-2 text-gray-400 hover:text-primary transition-all rounded-2xl hover:bg-primary/10 active:scale-95 shrink-0">
              <UserPlus size={18} />
           </button>
         )}
      </div>
    </div>
  );
};

const WorkspaceWrapper: React.FC<{
  team: TeamWithUnreadCount;
  myRole: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onRefresh: () => void;
  onDeleted: () => void;
  onJoinCall: (roomId: string) => void;
  activeCall: any;
}> = ({ team, myRole, activeTab, setActiveTab, onRefresh, onDeleted, onJoinCall, activeCall }) => {
  const { members } = useTeamChat();
  return (
    <WorkspaceContent
      team={team}
      myRole={myRole}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      teamMembers={members}
      onRefresh={onRefresh}
      onDeleted={onDeleted}
      onJoinCall={onJoinCall}
      activeCall={activeCall}
    />
  );
};

export function TeamsPage() {
  const { user, isBusiness } = useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const agoraCall = useAgoraCall();

  // Call status
  const [activeCall, setActiveCall] = useState<{ teamId: string; teamName: string; callerName: string } | null>(null);

  // Layout & State
  const [teams, setTeams] = useState<TeamWithUnreadCount[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  // Mobile navigation state
  // 'teams' = show team icon sidebar (mobile home)
  // 'tabs'  = show tab list for selected team (mobile intermediate)
  // 'content' = show content panel (mobile deepest)
  const [mobilePanel, setMobilePanel] = useState<'teams' | 'tabs' | 'content'>('teams');

  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');

  const loadTeams = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyTeams();
      setTeams(data);
    } catch {
      toast.error('Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  // Listen for socket call states
  useEffect(() => {
    if (!socket) return;
    const onNotification = (n: { type: string; title: string; message?: string; sender?: { username: string }; link?: string }) => {
      if (n.type === 'team_call') {
        const match = n.link?.match(/teamId=([^&]+)/);
        const teamId = match?.[1] || '';
        setActiveCall({ teamId, teamName: n.title.replace('Conference Call: ', ''), callerName: n.sender?.username || 'A member' });
      }
      if (n.type === 'team_call_ended') {
        setActiveCall(null);
      }
    };
    socket.on('notification', onNotification);
    return () => { socket.off('notification', onNotification); };
  }, [socket]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    const toastId = toast.loading('Initializing workspace...');
    try {
      const team = await createTeam({
        name: newTeamName.trim(),
        description: newTeamDescription.trim(),
      });

      if (team) {
        toast.success('Workspace initialized successfully!', { id: toastId });
        setShowCreateModal(false);
        setNewTeamName('');
        setNewTeamDescription('');
        await loadTeams();
        setSelectedTeamId(team.id);
        setActiveTab('overview');
        setMobilePanel('content');
      } else {
        toast.error('Failed to initialize workspace', { id: toastId });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to initialize workspace', { id: toastId });
    }
  };

  const handleSelectTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    setActiveTab('overview');
    setMobilePanel('content');
  };

  const handleSelectTab = (tab: string) => {
    setActiveTab(tab);
    setMobilePanel('content');
  };

  const handleInviteClick = () => {
    if (!isBusiness) {
      setShowUpgradeModal(true);
    } else {
      setIsInfoOpen(true);
    }
  };

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const myRole = selectedTeam?.my_role || 'member';

  if (loading && teams.length === 0) {
    return (
      <div className="teams-page__loading h-screen-safe bg-black flex flex-col items-center justify-center gap-4 text-white">
        <Loader2 size={48} className="animate-spin text-primary" />
        <p className="font-medium text-gray-400 uppercase tracking-widest text-[10px]">Syncing Collaboration Workspace...</p>
      </div>
    );
  }

  return (
    <div className="teams-page" data-mobile-panel={mobilePanel}>

      {/* ============================================================
          COLUMN 1: Narrow Icon Sidebar (Team Switcher)
          - Desktop: always visible as 64/80px left rail
          - Mobile: visible only when mobilePanel === 'teams'
          ============================================================ */}
      <div className="teams-icon-rail">
        {/* Mobile header bar (only visible on mobile) */}
        <div className="teams-icon-rail__mobile-header">
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Workspaces</span>
          <button
            onClick={() => isBusiness ? setShowCreateModal(true) : setShowUpgradeModal(true)}
            className="w-7 h-7 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 active:scale-95 transition-all"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Global Overview Icon */}
        <button 
          onClick={() => { setSelectedTeamId(null); setActiveTab('overview'); setMobilePanel('teams'); }}
          className={cn(
            "teams-icon-rail__btn",
            !selectedTeamId ? "teams-icon-rail__btn--active" : ""
          )}
          title="Organization Overview"
        >
          <LayoutGrid size={20} />
        </button>

        <div className="teams-icon-rail__divider" />

        {/* Dynamic Teams Avatar List */}
        <div className="teams-icon-rail__scroll">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => handleSelectTeam(team.id)}
              className={cn(
                "teams-icon-rail__btn teams-icon-rail__btn--avatar",
                selectedTeamId === team.id ? "teams-icon-rail__btn--selected" : ""
              )}
              title={team.name}
            >
              {team.avatar_url ? (
                <SecureImage src={team.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="teams-icon-rail__avatar-letter">
                  {(team.name || 'T').charAt(0).toUpperCase()}
                </div>
              )}
              {team.unread_count > 0 && (
                <span className="teams-icon-rail__unread-dot" />
              )}
            </button>
          ))}
        </div>

        <div className="teams-icon-rail__divider" />

        {/* Create Workspace Button (desktop only — mobile has it in header) */}
        <button 
          onClick={() => isBusiness ? setShowCreateModal(true) : setShowUpgradeModal(true)}
          className="teams-icon-rail__btn teams-icon-rail__btn--create"
          title="Create workspace"
        >
          <Plus size={20} />
        </button>
      </div>

      {selectedTeamId && selectedTeam ? (
        <TeamChatProvider teamId={selectedTeamId}>
          <div className="teams-content flex flex-col h-full bg-gray-950 overflow-hidden relative">
              <TeamHeader 
                team={selectedTeam} 
                myRole={myRole}
                onBack={() => setMobilePanel('teams')}
                isInfoOpen={isInfoOpen}
                onToggleInfo={() => setIsInfoOpen(!isInfoOpen)}
                onInvite={handleInviteClick}
                onJoinCall={() => {
                  agoraCall.joinCall(`team_${selectedTeamId}`, user?.id || '0');
                  socket?.emit('team:call_started', {
                    teamId: selectedTeamId,
                    teamName: selectedTeam.name
                  });
                }}
                activeTab={activeTab}
                onSelectTab={setActiveTab}
              />

              <div className="flex-1 overflow-hidden relative">
                 {activeTab === 'chat' ? (
                   <TeamChat
                     teamId={selectedTeamId}
                     activeCall={activeCall?.teamId === selectedTeamId ? activeCall : null}
                     onJoinCall={() => agoraCall.joinCall(`team_${selectedTeamId}`, user?.id || '0')}
                   />
                 ) : (
                   <TeamEnterpriseDashboard
                     team={selectedTeam}
                     myRole={myRole}
                     activeTab={activeTab as any}
                     onTabChange={(tab) => setActiveTab(tab)}
                     onOpenChat={() => setActiveTab('chat')}
                     onDeleted={() => {
                       setSelectedTeamId(null);
                       setActiveTab('overview');
                       loadTeams();
                     }}
                   />
                 )}
              </div>

              {/* Mobile bottom tab bar */}
              <div className="teams-content__bottom-tabs">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleSelectTab(tab.id)}
                      className={cn(
                        "teams-content__bottom-tab",
                        activeTab === tab.id ? "teams-content__bottom-tab--active" : ""
                      )}
                    >
                      <Icon size={18} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
          </div>
        </TeamChatProvider>
      ) : (



          /* Global Executive dashboard */
          <div className="teams-executive">
            <ExecutiveOverview 
              teams={teams} 
              onSelectTeam={(id) => handleSelectTeam(id)}
              onCreateWorkspace={() => isBusiness ? setShowCreateModal(true) : setShowUpgradeModal(true)}
            />
          </div>
        )}

      {/* ============================================================

          MODALS
          ============================================================ */}

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="teams-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="teams-modal" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-black text-white uppercase tracking-tight italic pl-1">New Workspace</h2>
            <form onSubmit={handleCreateTeam} className="space-y-4 mt-6">
              <div className="space-y-1">
                <label htmlFor="workspace-title-input" className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Workspace Title</label>
                <input
                  id="workspace-title-input"
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Engineering Core"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-primary/40"
                  required
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="workspace-desc-input" className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Description</label>
                <textarea
                  id="workspace-desc-input"
                  value={newTeamDescription}
                  onChange={(e) => setNewTeamDescription(e.target.value)}
                  placeholder="Outline key hub goals..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-primary/40 min-h-[80px]"
                />
              </div>
              <Button type="submit" fullWidth className="h-12 font-black rounded-2xl text-sm mt-4">Initialize Workspace</Button>
            </form>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="teams-modal-overlay" onClick={() => setShowUpgradeModal(false)}>
          <div className="teams-modal teams-modal--upgrade" onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[80px] pointer-events-none" />
            <div className="w-16 h-16 bg-blue-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto text-blue-400 mb-6">
              <LayoutGrid size={32} />
            </div>
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">Business Tier Required</h2>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest leading-loose">
                Advanced organization workspace controls are exclusive to our <span className="text-white">Business Hub plan</span>.
              </p>
            </div>
            <Button 
              fullWidth 
              className="h-12 text-xs font-black rounded-2xl shadow-xl shadow-blue-500/10 mt-6"
              onClick={() => navigate('/dashboard/billing')}
            >
              Upgrade Hub
            </Button>
          </div>
        </div>
      )}

      {/* Agora Call Overlay */}
      {selectedTeam && (
        <TeamCallOverlay
          joinState={agoraCall.joinState}
          localVideoTrack={agoraCall.localVideoTrack}
          remoteUsers={agoraCall.remoteUsers}
          isMuted={agoraCall.isMuted}
          isVideoOff={agoraCall.isVideoOff}
          onLeave={() => {
            agoraCall.leaveCall();
            socket?.emit('team:call_ended', {
              teamId: selectedTeamId,
              teamName: selectedTeam.name
            });
          }}
          onToggleMute={agoraCall.toggleMute}
          onToggleVideo={agoraCall.toggleVideo}
          teamName={selectedTeam.name}
        />
      )}
    </div>
  );
}

export default TeamsPage;
