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
  inviteMember,
  updateTeam,
} from '../../lib/teamsApi';
import type { TeamWithUnreadCount, TeamMember } from '../../types/teams';
import {
  Users, Plus, MessageSquare, UserPlus, Loader2, ArrowLeft,
  Camera, Trash2, Video, LayoutGrid, CheckSquare, HardDrive,
  Calendar, Megaphone, BarChart2, Settings, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import SecureImage from '../../components/common/SecureImage';
import { ConfirmationModal } from '../../components/common/ConfirmationModal';
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
  { id: 'chat', label: 'Chat Room', icon: MessageSquare },
  { id: 'projects', label: 'Projects & Tasks', icon: CheckSquare },
  { id: 'files', label: 'Files Cabinet', icon: HardDrive },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'meetings', label: 'Video Syncs', icon: Video },
  { id: 'announcements', label: 'Bulletins', icon: Megaphone },
  { id: 'members', label: 'Directory', icon: Users },
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
  const { user } = useAuth();
  
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
      } else {
        toast.error('Failed to initialize workspace', { id: toastId });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to initialize workspace', { id: toastId });
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
    <div className="teams-page flex h-screen-safe bg-black text-white overflow-hidden">
      {/* 1. Narrow Workspaces List sidebar */}
      <div className="w-16 md:w-20 bg-gray-950/80 border-r border-white/5 flex flex-col items-center py-6 gap-6 flex-shrink-0 z-20">
        {/* Global Overview Icon */}
        <button 
          onClick={() => { setSelectedTeamId(null); setActiveTab('overview'); }}
          className={cn(
            "w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-all",
            !selectedTeamId ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-white/5 text-gray-400 hover:text-white"
          )}
        >
          <LayoutGrid size={20} />
        </button>

        <div className="w-8 h-px bg-white/5" />

        {/* Dynamic Teams Avatar List */}
        <div className="flex-1 w-full space-y-4 overflow-y-auto scrollbar-hide px-3">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => { setSelectedTeamId(team.id); setActiveTab('overview'); }}
              className={cn(
                "w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all relative overflow-hidden group hover:scale-105 active:scale-95",
                selectedTeamId === team.id ? "ring-2 ring-primary ring-offset-2 ring-offset-black scale-105" : "opacity-70 hover:opacity-100"
              )}
            >
              {team.avatar_url ? (
                <SecureImage src={team.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-base">
                  {(team.name || 'T').charAt(0).toUpperCase()}
                </div>
              )}
              {team.unread_count > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border border-black animate-pulse" />
              )}
            </button>
          ))}
        </div>

        <div className="w-8 h-px bg-white/5" />

        {/* Create Workspace Button */}
        <button 
          onClick={() => isBusiness ? setShowCreateModal(true) : setShowUpgradeModal(true)}
          className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-white/5 hover:bg-primary/20 hover:text-primary transition-all flex items-center justify-center text-gray-400 active:scale-95"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {selectedTeamId && selectedTeam ? (
          <>
            {/* Tab Navigation Sidebar */}
            <div className="w-56 md:w-60 bg-gray-950/30 border-r border-white/5 flex flex-col flex-shrink-0 z-10">
              <div className="px-6 py-6 border-b border-white/5">
                <h2 className="text-sm font-black text-white uppercase tracking-wider truncate italic">{selectedTeam.name}</h2>
                <span className="text-[9px] font-black text-primary uppercase tracking-widest mt-1 inline-block">Business Workspace</span>
              </div>

              {/* Navigation items */}
              <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-hide">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-xs font-bold uppercase tracking-wider rounded-xl transition-all",
                        activeTab === tab.id 
                          ? "bg-primary text-white shadow-lg shadow-primary/20 font-black" 
                          : "text-gray-400 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon size={16} /> {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content panel */}
            <div className="flex-1 overflow-hidden relative">
              <TeamChatProvider teamId={selectedTeamId}>
                <WorkspaceWrapper
                  team={selectedTeam}
                  myRole={myRole}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  onRefresh={loadTeams}
                  onDeleted={() => { setSelectedTeamId(null); loadTeams(); }}
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
            </div>
          </>
        ) : (
          /* Global Executive dashboard */
          <div className="flex-1 overflow-hidden">
            <ExecutiveOverview teams={teams} onSelectTeam={(id) => { setSelectedTeamId(id); setActiveTab('overview'); }} />
          </div>
        )}
      </div>

      {/* 3. Create Team Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowCreateModal(false)} />
          <div className="bg-gray-900 border border-white/10 p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl relative z-10 space-y-6">
            <h2 className="text-xl font-black text-white uppercase tracking-tight italic pl-1">New Workspace</h2>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Workspace Title</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Engineering Core"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-xs text-white focus:outline-none"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Description</label>
                <textarea
                  value={newTeamDescription}
                  onChange={(e) => setNewTeamDescription(e.target.value)}
                  placeholder="Outline key hub goals..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-xs text-white focus:outline-none min-h-[80px]"
                />
              </div>
              <Button type="submit" fullWidth className="h-12 font-black rounded-2xl text-sm mt-4">Initialize Workspace</Button>
            </form>
          </div>
        </div>
      )}

      {/* 4. Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowUpgradeModal(false)} />
          <div className="bg-gray-900 border border-blue-500/20 p-10 rounded-[3rem] w-full max-w-sm shadow-2xl text-center space-y-6 relative overflow-hidden z-10">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[80px]"></div>
            <div className="w-16 h-16 bg-blue-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto text-blue-400">
              <LayoutGrid size={32} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">Business Tier Required</h2>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest leading-loose">
                Advanced organization workspace controls are exclusive to our <span className="text-white">Business Hub plan</span>.
              </p>
            </div>
            <Button 
              fullWidth 
              className="h-12 text-xs font-black rounded-2xl shadow-xl shadow-blue-500/10"
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
