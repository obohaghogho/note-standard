import React, { useEffect, useState } from 'react';
import { Bell, Megaphone, Plus, Trash2, Clock, ShieldAlert, MessageSquare } from 'lucide-react';
import { getAnnouncements, createAnnouncement } from '../../lib/collaborationApi';
import type { Announcement } from '../../types/collaboration';
import { Button } from '../common/Button';
import toast from 'react-hot-toast';

interface WorkspaceAnnouncementsProps {
  teamId: string;
  myRole: string;
}

export const WorkspaceAnnouncements: React.FC<WorkspaceAnnouncementsProps> = ({ teamId, myRole }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [audience, setAudience] = useState<'all' | 'business' | 'team'>('team');

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const data = await getAnnouncements(teamId);
      setAnnouncements(data);
    } catch {
      toast.error('Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, [teamId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    const toastId = toast.loading('Broadcasting announcement...');
    try {
      await createAnnouncement(teamId, {
        title: title.trim(),
        content: content.trim(),
        priority,
        audience
      });
      toast.success('Announcement published successfully!', { id: toastId });
      setShowCreateModal(false);
      setTitle('');
      setContent('');
      await loadAnnouncements();
    } catch {
      toast.error('Failed to publish announcement.', { id: toastId });
    }
  };

  const isAdmin = myRole === 'owner' || myRole === 'admin';

  return (
    <div className="p-6 md:p-8 space-y-6 overflow-y-auto h-full scrollbar-hide bg-black text-white relative">
      {/* Header bar */}
      <div className="flex justify-between items-center border-b border-white/5 pb-4">
        <div>
          <h3 className="text-lg font-black italic uppercase tracking-tight flex items-center gap-2">
            <Megaphone size={18} className="text-primary" /> Workspace Bulletins
          </h3>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Publish critical updates and broadcasts to all workspace members</p>
        </div>

        {isAdmin && (
          <Button size="sm" onClick={() => setShowCreateModal(true)} className="rounded-xl flex items-center gap-2">
            <Plus size={16} /> Post Bulletin
          </Button>
        )}
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-gray-500 uppercase tracking-widest text-xs font-black">
          Syncing Bulletin Board...
        </div>
      ) : announcements.length === 0 ? (
        <div className="p-16 rounded-[2.5rem] bg-white/[0.01] border border-dashed border-white/5 text-center max-w-sm mx-auto mt-12 space-y-4">
          <Bell size={36} className="text-gray-600 mx-auto" />
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest leading-loose">No active bulletins posted yet.</p>
        </div>
      ) : (
        /* Bulletins List */
        <div className="space-y-4 max-w-3xl mx-auto">
          {announcements.map(ann => (
            <div key={ann.id} className="p-6 rounded-[2.5rem] bg-white/[0.02] border border-white/5 space-y-4 hover:border-white/10 transition-colors">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className={`text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                      ann.priority === 'urgent' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-primary/10 text-primary border border-primary/20'
                    }`}>{ann.priority}</span>
                    <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest flex items-center gap-1.5"><Clock size={10} /> {new Date(ann.created_at).toLocaleDateString()}</span>
                  </div>
                  <h4 className="font-black text-sm text-white mt-1.5">{ann.title}</h4>
                </div>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed white-space-pre-wrap">{ann.content}</p>

              <div className="flex justify-between items-center text-[9px] font-bold text-gray-600 uppercase tracking-widest pt-3 border-t border-white/5">
                <span>{ann.audience === 'all' ? 'All Members' : ann.audience === 'business' ? 'Admins Only' : 'Team Only'}</span>
                <span>{new Date(ann.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Announcement Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowCreateModal(false)} />
          <div className="bg-gray-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl relative z-10 space-y-6">
            <h3 className="text-xl font-black italic uppercase tracking-tight text-white pl-1">New Bulletin</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Bulletin Title</label>
                <input 
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="System Maintenance Window"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Message Content</label>
                <textarea 
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Draft your organization announcement here..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none min-h-[120px]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Priority Level</label>
                  <select 
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  >
                    <option value="low">Low Priority</option>
                    <option value="normal">Normal</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent Warning</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Target Audience</label>
                  <select 
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as any)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  >
                    <option value="all">All Members</option>
                    <option value="business">Business Admins</option>
                    <option value="team">Team Only</option>
                  </select>
                </div>
              </div>

              <Button type="submit" fullWidth className="h-12 font-black rounded-2xl text-sm mt-4">Publish Broadcast</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default WorkspaceAnnouncements;
