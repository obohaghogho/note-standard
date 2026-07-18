import React, { useEffect, useState } from 'react';
import { 
  getProjects, createProject, updateProject, deleteProject 
} from '../../lib/collaborationApi';
import type { Project } from '../../types/collaboration';
import { 
  FolderPlus, Kanban, List, Table, Calendar, Clock, 
  Trash2, Edit, CheckSquare, Plus, AlertCircle, RefreshCw 
} from 'lucide-react';
import { Button } from '../common/Button';
import toast from 'react-hot-toast';
import { WorkspaceTasks } from './WorkspaceTasks';

interface WorkspaceProjectsProps {
  teamId: string;
  teamMembers: any[];
}

export const WorkspaceProjects: React.FC<WorkspaceProjectsProps> = ({ teamId, teamMembers }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'table' | 'calendar'>('kanban');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [budget, setBudget] = useState('0');
  const [ownerId, setOwnerId] = useState('');

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await getProjects(teamId);
      setProjects(data);
    } catch (err) {
      console.error('[Projects] Load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [teamId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const toastId = toast.loading('Initializing project...');
    try {
      await createProject(teamId, {
        name: name.trim(),
        description: description.trim(),
        priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
        budget: parseFloat(budget) || 0.00,
        owner_id: ownerId || undefined
      });
      toast.success('Project created successfully!', { id: toastId });
      setShowCreateModal(false);
      setName('');
      setDescription('');
      setDueDate('');
      setBudget('0');
      setOwnerId('');
      await loadProjects();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create project', { id: toastId });
    }
  };

  const handleStatusChange = async (projectId: string, newStatus: Project['status']) => {
    try {
      await updateProject(teamId, projectId, { status: newStatus });
      toast.success('Project updated.');
      await loadProjects();
    } catch {
      toast.error('Failed to update project status.');
    }
  };

  const handleDelete = async (projectId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this project?")) return;
    try {
      await deleteProject(teamId, projectId);
      toast.success('Project deleted.');
      await loadProjects();
    } catch {
      toast.error('Failed to delete project.');
    }
  };

  // Group projects by status for Kanban Board
  const projectsByStatus = {
    planning: projects.filter(p => p.status === 'planning'),
    active: projects.filter(p => p.status === 'active'),
    paused: projects.filter(p => p.status === 'paused'),
    completed: projects.filter(p => p.status === 'completed'),
  };

  if (selectedProjectId) {
    const project = projects.find(p => p.id === selectedProjectId);
    return (
      <WorkspaceTasks 
        projectId={selectedProjectId}
        projectName={project?.name || 'Project Tasks'}
        teamId={teamId}
        teamMembers={teamMembers}
        onBack={() => { setSelectedProjectId(null); loadProjects(); }}
      />
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 overflow-y-auto h-full scrollbar-hide bg-black text-white relative">
      {/* Tab Switcher & Action Bar */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 border-b border-white/5 pb-4">
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 self-start">
          <button 
            onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              viewMode === 'kanban' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Kanban size={14} /> Kanban
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              viewMode === 'list' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'
            }`}
          >
            <List size={14} /> List
          </button>
          <button 
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              viewMode === 'table' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Table size={14} /> Table
          </button>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowCreateModal(true)} className="rounded-xl flex items-center gap-2">
            <Plus size={16} /> New Project
          </Button>
          <button onClick={loadProjects} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl active:scale-95 transition-all text-gray-400 hover:text-white border border-white/5">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-500 uppercase tracking-widest text-xs font-black">
          <Clock className="animate-spin" size={24} /> Syncing Projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="p-16 rounded-[2.5rem] bg-white/[0.01] border border-dashed border-white/5 text-center space-y-6 max-w-md mx-auto mt-12">
          <div className="w-16 h-16 rounded-[1.5rem] bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <FolderPlus size={32} />
          </div>
          <div className="space-y-2">
            <h3 className="font-black text-white uppercase tracking-tight text-lg">No Projects Found</h3>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest leading-loose">Create a project workspace to track milestones, Kanban tasks boards, budgets, and team allocations.</p>
          </div>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>Get Started</Button>
        </div>
      ) : viewMode === 'kanban' ? (
        /* Kanban Board View */
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[calc(100%-80px)] items-start">
          {Object.entries(projectsByStatus).map(([status, list]) => (
            <div key={status} className="p-4 rounded-[2rem] bg-white/[0.01] border border-white/5 flex flex-col gap-4 min-h-[300px]">
              <div className="flex items-center justify-between pl-1">
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">{status}</h4>
                <span className="text-[9px] font-black bg-white/5 px-2 py-0.5 rounded-lg text-gray-400">{list.length}</span>
              </div>

              <div className="space-y-3">
                {list.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-primary/20 transition-all cursor-pointer space-y-4 group"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <h5 className="font-bold text-xs text-white group-hover:text-primary transition-colors truncate">{p.name}</h5>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                        p.priority === 'critical' || p.priority === 'high' ? 'bg-red-500/10 text-red-400' : 'bg-primary/10 text-primary'
                      }`}>{p.priority}</span>
                    </div>

                    <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{p.description || 'No description provided.'}</p>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                        <span>Progress</span>
                        <span>{p.progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${p.progress}%` }} />
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[8px] font-bold text-gray-600 uppercase tracking-widest pt-2 border-t border-white/5">
                      <span>Due: {p.due_date ? new Date(p.due_date).toLocaleDateString() : 'N/A'}</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : viewMode === 'list' ? (
        /* List View */
        <div className="space-y-3">
          {projects.map(p => (
            <div 
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-primary/20 transition-all cursor-pointer flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-3">
                  <h4 className="font-bold text-sm text-white group-hover:text-primary transition-colors">{p.name}</h4>
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                    p.priority === 'critical' ? 'bg-red-500/10 text-red-400' : 'bg-primary/10 text-primary'
                  }`}>{p.priority}</span>
                </div>
                <p className="text-[10px] text-gray-500 max-w-xl truncate">{p.description}</p>
              </div>

              <div className="flex items-center gap-6 flex-shrink-0">
                <div className="text-right">
                  <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Budget</div>
                  <div className="text-xs font-black text-emerald-400 mt-0.5">${p.budget.toLocaleString()}</div>
                </div>

                <div className="w-28 space-y-1">
                  <div className="flex justify-between text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                    <span>Progress</span>
                    <span>{p.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                  className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:text-red-300 rounded-xl hover:bg-red-500/10 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-[2rem] bg-white/[0.01] border border-white/5 overflow-hidden">
          <table className="w-full text-left text-xs text-gray-400">
            <thead className="bg-white/5 text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
              <tr>
                <th className="px-6 py-4">Project Name</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Priority</th>
                <th className="px-6 py-4">Budget</th>
                <th className="px-6 py-4">Due Date</th>
                <th className="px-6 py-4">Progress</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {projects.map(p => (
                <tr 
                  key={p.id}
                  onClick={() => setSelectedProjectId(p.id)}
                  className="hover:bg-white/[0.02] cursor-pointer transition-colors group"
                >
                  <td className="px-6 py-4 font-bold text-white group-hover:text-primary transition-colors">{p.name}</td>
                  <td className="px-6 py-4">
                    <select 
                      value={p.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleStatusChange(p.id, e.target.value as Project['status'])}
                      className="bg-transparent border-none text-xs text-gray-300 focus:outline-none cursor-pointer"
                    >
                      <option value="planning">Planning</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 uppercase font-bold text-[10px]">{p.priority}</td>
                  <td className="px-6 py-4 font-bold text-emerald-400">${p.budget.toLocaleString()}</td>
                  <td className="px-6 py-4">{p.due_date ? new Date(p.due_date).toLocaleDateString() : 'N/A'}</td>
                  <td className="px-6 py-4">{p.progress}%</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                      className="p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowCreateModal(false)} />
          <div className="bg-gray-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl relative z-10 space-y-6">
            <h3 className="text-xl font-black italic uppercase tracking-tight text-white pl-1">New Project Hub</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Project Name</label>
                <input 
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Website Overhaul V2"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Description</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Outline key milestones and tracking views..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Priority</label>
                  <select 
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Due Date</label>
                  <input 
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Budget ($)</label>
                  <input 
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Owner / Lead</label>
                  <select 
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  >
                    <option value="">Select Lead...</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.profile?.id}>{m.profile?.full_name || m.profile?.username || m.profile?.email}</option>
                    ))}
                  </select>
                </div>
              </div>

              <Button type="submit" fullWidth className="h-12 font-black rounded-2xl text-sm mt-4">Init Project</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default WorkspaceProjects;
