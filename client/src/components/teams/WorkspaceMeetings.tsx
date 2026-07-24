import React, { useEffect, useState } from 'react';
import { Video, Calendar, Plus, Clock, Play, User, RefreshCw, X } from 'lucide-react';
import { getMeetings, createMeeting, updateMeetingStatus } from '../../lib/collaborationApi';
import type { Meeting } from '../../types/collaboration';
import { Button } from '../common/Button';
import toast from 'react-hot-toast';

interface WorkspaceMeetingsProps {
  teamId: string;
  onJoinCall: (roomId: string) => void;
}

export const WorkspaceMeetings: React.FC<WorkspaceMeetingsProps> = ({ teamId, onJoinCall }) => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agenda, setAgenda] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState('30');

  const loadMeetings = async () => {
    setLoading(true);
    try {
      const data = await getMeetings(teamId);
      setMeetings(data);
    } catch {
      toast.error('Failed to load meetings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeetings();
  }, [teamId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !scheduledAt) return;

    const toastId = toast.loading('Scheduling meeting...');
    try {
      await createMeeting(teamId, {
        title: title.trim(),
        description: description.trim(),
        agenda: agenda.trim(),
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: parseInt(duration) || 30
      });
      toast.success('Meeting scheduled successfully!', { id: toastId });
      setShowCreateModal(false);
      setTitle('');
      setDescription('');
      setAgenda('');
      setScheduledAt('');
      await loadMeetings();
    } catch {
      toast.error('Failed to schedule meeting.', { id: toastId });
    }
  };

  const handleStartCall = async (meet: Meeting) => {
    try {
      await updateMeetingStatus(teamId, meet.id, 'live');
      onJoinCall(meet.room_id);
      await loadMeetings();
    } catch {
      toast.error('Failed to start conference call.');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 overflow-y-auto h-full scrollbar-hide bg-black text-white relative">
      {/* Header bar */}
      <div className="flex justify-between items-center border-b border-white/5 pb-4">
        <div>
          <h3 className="text-lg font-black italic uppercase tracking-tight flex items-center gap-2">
            <Video size={18} className="text-primary" /> Meeting Rooms
          </h3>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Schedule audio/video conference rooms for team syncs</p>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowCreateModal(true)} className="rounded-xl flex items-center gap-2">
            <Plus size={16} /> Schedule Call
          </Button>
          <button onClick={loadMeetings} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl active:scale-95 transition-all text-gray-400 hover:text-white border border-white/5">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-gray-500 uppercase tracking-widest text-xs font-black">
          Syncing Scheduled Rooms...
        </div>
      ) : meetings.length === 0 ? (
        <div className="p-16 rounded-[2.5rem] bg-white/[0.01] border border-dashed border-white/5 text-center max-w-sm mx-auto mt-12 space-y-4">
          <Video size={36} className="text-gray-600 mx-auto" />
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest leading-loose">No active conference schedules found.</p>
        </div>
      ) : (
        /* Meetings Directory list */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {meetings.map(meet => (
            <div key={meet.id} className="p-6 rounded-[2.5rem] bg-white/[0.02] border border-white/5 hover:border-white/10 flex flex-col justify-between h-44 group">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                    meet.status === 'live' ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-primary/20 text-primary'
                  }`}>{meet.status}</span>
                  <h4 className="font-black text-sm text-white truncate mt-2">{meet.title}</h4>
                  <p className="text-[10px] text-gray-500 line-clamp-2 mt-1">{meet.description || 'No description provided.'}</p>
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-white/5">
                <div className="text-[9px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1">
                  <Clock size={10} /> {new Date(meet.scheduled_at).toLocaleDateString()} • {meet.duration_minutes} Mins
                </div>

                <Button 
                  size="sm" 
                  onClick={() => handleStartCall(meet)}
                  className={`h-8 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                    meet.status === 'live' ? 'bg-red-600 hover:bg-red-500' : ''
                  }`}
                >
                  <Play size={10} /> {meet.status === 'live' ? 'Join Call' : 'Start Room'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Schedule Meeting Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowCreateModal(false)} />
          <div className="bg-gray-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl relative z-10 space-y-6">
            <h3 className="text-xl font-black italic uppercase tracking-tight text-white pl-1">Schedule Sync Call</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Meeting Title</label>
                <input 
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Design Alignment Sync"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Agenda / Description</label>
                <textarea 
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  placeholder="Discuss sprints progress and code layouts..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Date & Time</label>
                  <input 
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Duration (Min)</label>
                  <select 
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  >
                    <option value="15">15 Mins</option>
                    <option value="30">30 Mins</option>
                    <option value="45">45 Mins</option>
                    <option value="60">60 Mins</option>
                  </select>
                </div>
              </div>

              <Button type="submit" fullWidth className="h-12 font-black rounded-2xl text-sm mt-4">Confirm Schedule</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default WorkspaceMeetings;
