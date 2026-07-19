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
  Calendar, Megaphone, BarChart2, Settings, Menu, X, MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import SecureImage from '../../components/common/SecureImage';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { useAgoraCall } from '../../hooks/useAgoraCall';
import { useSocket } from '../../context/SocketContext';
import { TeamCallOverlay } from '../../components/teams/TeamCallOverlay';

// Collaboration Components
import { ExecutiveOverview } from '../../components/teams/ExecutiveOverview';
import { WorkspaceOverview } from '../../components/teams/WorkspaceOverview';
import { WorkspaceProjects } from '../../components/teams/WorkspaceProjects';
import { WorkspaceFiles } from '../../components/teams/WorkspaceFiles';
import { WorkspaceCalendar } from '../../components/teams/WorkspaceCalendar';
import { WorkspaceAnnouncements } from '../../components/teams/WorkspaceAnnouncements';
import { WorkspaceMeetings } from '../../components/teams/WorkspaceMeetings';
import { WorkspaceMembers } from '../../components/teams/WorkspaceMembers';
import { WorkspaceSettings } from '../../components/teams/WorkspaceSettings';
import { WorkspaceAnalytics } from '../../components/teams/WorkspaceAnalytics';

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

interface WorkspaceContentProps {
  team: TeamWithUnreadCount;
  myRole: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  teamMembers: TeamMember[];
  onRefresh: () => void;
  onDeleted: () => void;
  onJoinCall: (roomId: string) => void;
  activeCall: any;
}

const WorkspaceContent: React.FC<WorkspaceContentProps> = ({
  team,
  myRole,
  activeTab,
  setActiveTab,
  teamMembers,
  onRefresh,
  onDeleted,
  onJoinCall,
  activeCall
}) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user: _user } = useAuth();
  
  switch (activeTab) {
    case 'overview':
      return (
        <WorkspaceOverview 
          teamId={team.id} 
          teamName={team.name} 
          onSwitchTab={setActiveTab} 
        />
      );
    case 'chat':
      return (
        <TeamChat 
          teamId={team.id} 
          activeCall={activeCall} 
          onJoinCall={() => onJoinCall(`team_${team.id}`)} 
        />
      );
    case 'projects':
      return (
        <WorkspaceProjects 
          teamId={team.id} 
          teamMembers={teamMembers} 
        />
      );
    case 'files':
      return <WorkspaceFiles teamId={team.id} />;
    case 'calendar':
      return <WorkspaceCalendar teamId={team.id} />;
    case 'meetings':
      return <WorkspaceMeetings teamId={team.id} onJoinCall={onJoinCall} />;
    case 'announcements':
      return <WorkspaceAnnouncements teamId={team.id} myRole={myRole} />;
    case 'members':
      return (
        <WorkspaceMembers 
          teamId={team.id} 
          members={teamMembers} 
          myRole={myRole} 
          onRefresh={onRefresh} 
        />
      );
    case 'analytics':
      return <WorkspaceAnalytics teamId={team.id} />;
    case 'settings':
      return (
        <WorkspaceSettings 
          teamId={team.id} 
          teamName={team.name} 
          teamDesc={team.description || ''} 
          myRole={myRole} 
          onRefresh={onRefresh} 
          onDeleted={onDeleted} 
        />
      );
    default:
      return null;
  }
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

      {/* ============================================================
          COLUMN 2 + 3: Main workspace (tab nav + content)
          - Desktop: both always visible side-by-side
          - Mobile: controlled by mobilePanel state
          ============================================================ */}
      <div className="teams-main">
        {selectedTeamId && selectedTeam ? (
          <>
            {/* ─── Tab Navigation Sidebar ─── */}
            <div className={cn("teams-tab-nav", mobilePanel === 'content' && "teams-tab-nav--mobile-hidden")}>
              {/* Mobile back button */}
              <div className="teams-tab-nav__mobile-back">
                <button
                  onClick={() => { setSelectedTeamId(null); setMobilePanel('teams'); }}
                  className="teams-tab-nav__back-btn"
                >
                  <ArrowLeft size={16} />
                  <span>Teams</span>
                </button>
              </div>

              <div className="teams-tab-nav__header">
                <h2 className="text-sm font-black text-white uppercase tracking-wider truncate italic">{selectedTeam.name}</h2>
                <span className="text-[9px] font-black text-primary uppercase tracking-widest mt-1 inline-block">Business Workspace</span>
              </div>

              {/* Navigation items */}
              <div className="teams-tab-nav__list">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleSelectTab(tab.id)}
                      className={cn(
                        "teams-tab-nav__item",
                        activeTab === tab.id ? "teams-tab-nav__item--active" : ""
                      )}
                    >
                      <Icon size={16} /> {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── Content Panel ─── */}
            <div className={cn("teams-content", mobilePanel !== 'content' && "teams-content--mobile-hidden")}>
              {/* Mobile content header with back & tab switcher */}
              <div className="teams-content__mobile-header">
                <button
                  onClick={() => setMobilePanel('tabs')}
                  className="teams-content__back-btn"
                >
                  <Menu size={18} />
                </button>
                <div className="teams-content__mobile-title">
                  <span className="text-xs font-black text-white uppercase tracking-wider truncate">{selectedTeam.name}</span>
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest capitalize">{activeTab}</span>
                </div>
                <button
                  onClick={() => { setSelectedTeamId(null); setMobilePanel('teams'); }}
                  className="teams-content__close-btn"
                >
                  <X size={18} />
                </button>
              </div>

              <TeamChatProvider teamId={selectedTeamId}>
                <WorkspaceWrapper
                  team={selectedTeam}
                  myRole={myRole}
                  activeTab={activeTab}
                  setActiveTab={handleSelectTab}
                  onRefresh={loadTeams}
                  onDeleted={() => { setSelectedTeamId(null); setMobilePanel('teams'); loadTeams(); }}
                  onJoinCall={(roomId) => {
                    agoraCall.joinCall(roomId, user?.id || '0');
                    socket?.emit('team:call_started', {
                      teamId: selectedTeamId,
                      teamName: selectedTeam.name
                    });
                  }}
                  activeCall={activeCall?.teamId === selectedTeamId ? activeCall : null}
                />
              </TeamChatProvider>

              {/* Mobile bottom tab bar */}
              <div className="teams-content__bottom-tabs">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
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
          </>
        ) : (
          /* Global Executive dashboard */
          <div className="teams-executive">
            <ExecutiveOverview teams={teams} onSelectTeam={(id) => handleSelectTeam(id)} />
          </div>
        )}
      </div>

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
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Workspace Title</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Engineering Core"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-primary/40"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Description</label>
                <textarea
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
