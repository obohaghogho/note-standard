import React, { useEffect, useState } from 'react';
import { 
  Pin, MessageSquare, Calendar, Bell, Users, Plus, FileText, 
  Activity, ArrowRight, Video, Compass, ChevronRight 
} from 'lucide-react';
import { getMeetings, getAnnouncements, getWorkspaceActivities } from '../../lib/collaborationApi';
import { getSharedNotes } from '../../lib/teamsApi';
import type { Meeting, Announcement, WorkspaceActivity } from '../../types/collaboration';
import type { SharedNote } from '../../types/teams';
import { Button } from '../common/Button';
import { useNavigate } from 'react-router-dom';

interface WorkspaceOverviewProps {
  teamId: string;
  teamName: string;
  onSwitchTab: (tab: string) => void;
}

export const WorkspaceOverview: React.FC<WorkspaceOverviewProps> = ({ teamId, teamName, onSwitchTab }) => {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activities, setActivities] = useState<WorkspaceActivity[]>([]);
  const [sharedNotes, setSharedNotes] = useState<SharedNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOverview() {
      setLoading(true);
      try {
        const [meetingsData, announcementsData, activitiesData, notesData] = await Promise.all([
          getMeetings(teamId).catch(() => []),
          getAnnouncements(teamId).catch(() => []),
          getWorkspaceActivities(teamId).catch(() => []),
          getSharedNotes(teamId).catch(() => [])
        ]);

        setMeetings(meetingsData.slice(0, 3));
        setAnnouncements(announcementsData.slice(0, 3));
        setActivities(activitiesData.slice(0, 5));
        setSharedNotes(notesData.slice(0, 3));
      } catch (err) {
        console.error('[Overview] Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
  }, [teamId]);

  return (
    <div className="p-6 md:p-8 space-y-8 overflow-y-auto h-full scrollbar-hide bg-black text-white">
      {/* Header card */}
      <div className="p-8 rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-gray-900/60 via-gray-950/60 to-black/60 backdrop-blur-2xl shadow-2xl relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] rounded-full"></div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative">
          <div className="space-y-1.5">
            <span className="text-[10px] font-black text-primary bg-primary/10 px-3 py-1.5 rounded-xl uppercase tracking-widest">Active Workspace</span>
            <h2 className="text-3xl font-black italic uppercase tracking-tighter mt-3">{teamName}</h2>
            <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest">Collaborate on chat, tasks, documents, and live call conferences.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onSwitchTab('chat')} className="rounded-xl flex items-center gap-2">
              <MessageSquare size={16} /> Open Chat
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onSwitchTab('projects')} className="rounded-xl border border-white/5 flex items-center gap-2">
              Kanban <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pinned Notes & Documents */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notes Card */}
          <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest pl-1 flex items-center gap-2">
                <Pin size={14} className="text-primary rotate-45" /> Pinned Notes & Docs
              </h3>
              <button onClick={() => onSwitchTab('notes')} className="text-[10px] font-black text-primary uppercase tracking-wider flex items-center gap-1 hover:underline">
                View All <ArrowRight size={12} />
              </button>
            </div>

            {loading ? (
              <div className="h-28 flex items-center justify-center text-gray-600 text-xs uppercase tracking-widest font-black">Syncing Notes...</div>
            ) : sharedNotes.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white/[0.01] border border-dashed border-white/5 text-center text-gray-500 text-xs uppercase tracking-widest leading-loose">
                No pinned notes found.<br/>Open notes to pin key records.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sharedNotes.map((sn) => (
                  <div 
                    key={sn.id}
                    onClick={() => navigate(`/dashboard/notes?id=${sn.note_id}`)}
                    className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-primary/20 transition-all cursor-pointer flex flex-col justify-between h-36 group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-all">
                      <FileText size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs truncate">{sn.note?.title || 'Untitled Note'}</h4>
                      <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mt-1">Shared by {sn.sharer?.username || 'user'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 space-y-4">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest pl-1 flex items-center gap-2">
              <Activity size={14} /> Recent Hub Activities
            </h3>

            {loading ? (
              <div className="h-32 flex items-center justify-center text-gray-600 text-xs uppercase tracking-widest font-black">Loading Feed...</div>
            ) : activities.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white/[0.01] border border-dashed border-white/5 text-center text-gray-500 text-xs uppercase tracking-widest leading-loose">
                Quiet in the workspace.<br/>Activity logs will appear here as users interact.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {activities.map((act) => (
                  <div key={act.id} className="py-4 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden border border-white/5 text-[9px] font-black text-gray-400">
                        {act.actor?.avatar_url ? (
                          <img src={act.actor.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (act.actor?.full_name || 'U').charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="text-[11px] font-bold text-gray-300">
                        <span className="text-white font-black">{act.actor?.full_name || act.actor?.username || 'Member'}</span>{' '}
                        {act.activity_type.replace('_', ' ')}{' '}
                        <span className="text-primary">{act.entity_name}</span>
                      </div>
                    </div>
                    <span className="text-[9px] text-gray-600 font-bold uppercase tracking-wider">{new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Announcements & Scheduled Meetings */}
        <div className="space-y-6">
          {/* Announcements */}
          <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest pl-1 flex items-center gap-2">
                <Bell size={14} /> Announcements
              </h3>
              <button onClick={() => onSwitchTab('announcements')} className="text-[10px] font-black text-primary uppercase tracking-wider flex items-center gap-1 hover:underline">
                Board <ChevronRight size={12} />
              </button>
            </div>

            {loading ? (
              <div className="h-28 flex items-center justify-center text-gray-600 text-xs uppercase tracking-widest font-black">Syncing...</div>
            ) : announcements.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white/[0.01] border border-dashed border-white/5 text-center text-gray-500 text-xs uppercase tracking-widest leading-loose">
                No active announcements.
              </div>
            ) : (
              <div className="space-y-3">
                {announcements.map((ann) => (
                  <div key={ann.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                        ann.priority === 'urgent' ? 'bg-red-500/20 text-red-400' : 'bg-primary/20 text-primary'
                      }`}>{ann.priority}</span>
                      <span className="text-[9px] text-gray-600">{new Date(ann.created_at).toLocaleDateString()}</span>
                    </div>
                    <h4 className="font-black text-xs text-white truncate">{ann.title}</h4>
                    <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{ann.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Meetings */}
          <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest pl-1 flex items-center gap-2">
                <Calendar size={14} /> Upcoming Meetings
              </h3>
              <button onClick={() => onSwitchTab('meetings')} className="text-[10px] font-black text-primary uppercase tracking-wider flex items-center gap-1 hover:underline">
                Schedule <ChevronRight size={12} />
              </button>
            </div>

            {loading ? (
              <div className="h-28 flex items-center justify-center text-gray-600 text-xs uppercase tracking-widest font-black">Syncing...</div>
            ) : meetings.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white/[0.01] border border-dashed border-white/5 text-center text-gray-500 text-xs uppercase tracking-widest leading-loose">
                No scheduled calls.
              </div>
            ) : (
              <div className="space-y-3">
                {meetings.map((meet) => (
                  <div key={meet.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h4 className="font-black text-xs text-white truncate">{meet.title}</h4>
                      <p className="text-[9px] text-gray-600 font-bold uppercase tracking-wider mt-1">
                        {new Date(meet.scheduled_at).toLocaleDateString()} • {meet.duration_minutes} Mins
                      </p>
                    </div>
                    <button 
                      onClick={() => onSwitchTab('meetings')}
                      className="p-2 rounded-xl bg-green-500/10 hover:bg-green-500/20 text-green-400 flex items-center justify-center active:scale-95 transition-all flex-shrink-0"
                    >
                      <Video size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default WorkspaceOverview;
