import React, { useEffect, useState } from 'react';
import { 
  getTasks, createTask, updateTask, deleteTask, 
  getTaskChecklist, addTaskChecklistItem, updateTaskChecklistItem, deleteTaskChecklistItem,
  getTaskComments, addTaskComment 
} from '../../lib/collaborationApi';
import type { Task, TaskChecklistItem, TaskComment } from '../../types/collaboration';
import { 
  ArrowLeft, Plus, CheckSquare, Clock, User, Trash2, 
  ChevronRight, MessageSquare, PlusCircle, Square, CheckSquare as CheckedBox, X 
} from 'lucide-react';
import { Button } from '../common/Button';
import toast from 'react-hot-toast';

interface WorkspaceTasksProps {
  projectId: string;
  projectName: string;
  teamId: string;
  teamMembers: any[];
  onBack: () => void;
}

export const WorkspaceTasks: React.FC<WorkspaceTasksProps> = ({ 
  projectId, projectName, teamId, teamMembers, onBack 
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Task checklist and comments
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [newComment, setNewComment] = useState('');

  // Task Creation Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await getTasks(projectId);
      setTasks(data);
    } catch {
      toast.error('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [projectId]);

  // Load task sub-details
  useEffect(() => {
    if (!selectedTask) return;
    
    async function loadTaskDetails() {
      try {
        const [checklistData, commentsData] = await Promise.all([
          getTaskChecklist(selectedTask.id),
          getTaskComments(selectedTask.id)
        ]);
        setChecklist(checklistData);
        setComments(commentsData);
      } catch {
        console.error('Failed to load task details');
      }
    }

    loadTaskDetails();
  }, [selectedTask]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const toastId = toast.loading('Creating task...');
    try {
      await createTask(teamId, projectId, {
        title: title.trim(),
        description: description.trim(),
        priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
        assigned_to: assignedTo || undefined
      });
      toast.success('Task created.', { id: toastId });
      setShowCreateModal(false);
      setTitle('');
      setDescription('');
      setDueDate('');
      setAssignedTo('');
      await loadTasks();
    } catch {
      toast.error('Failed to create task.', { id: toastId });
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: Task['status']) => {
    try {
      await updateTask(teamId, taskId, { status: newStatus });
      await loadTasks();
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null);
      }
      toast.success('Task status updated.');
    } catch {
      toast.error('Failed to update task.');
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!window.confirm("Delete this task permanently?")) return;
    try {
      await deleteTask(teamId, taskId);
      setSelectedTask(null);
      await loadTasks();
      toast.success('Task deleted.');
    } catch {
      toast.error('Failed to delete task.');
    }
  };

  // Checklist Actions
  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistItem.trim() || !selectedTask) return;
    try {
      const item = await addTaskChecklistItem(selectedTask.id, newChecklistItem.trim());
      setChecklist(prev => [...prev, item]);
      setNewChecklistItem('');
    } catch {
      toast.error('Failed to add checklist item.');
    }
  };

  const handleToggleChecklist = async (item: TaskChecklistItem) => {
    try {
      const updated = await updateTaskChecklistItem(item.id, !item.completed);
      setChecklist(prev => prev.map(i => i.id === item.id ? updated : i));
    } catch {
      toast.error('Failed to toggle item.');
    }
  };

  const handleDeleteChecklist = async (itemId: string) => {
    try {
      await deleteTaskChecklistItem(itemId);
      setChecklist(prev => prev.filter(i => i.id !== itemId));
    } catch {
      toast.error('Failed to delete item.');
    }
  };

  // Comment Actions
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedTask) return;
    try {
      const comment = await addTaskComment(selectedTask.id, newComment.trim());
      setComments(prev => [...prev, comment]);
      setNewComment('');
    } catch {
      toast.error('Failed to post comment.');
    }
  };

  // Group tasks
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const reviewTasks = tasks.filter(t => t.status === 'review');
  const doneTasks = tasks.filter(t => t.status === 'done');

  return (
    <div className="space-y-6 h-full flex flex-col bg-black text-white relative">
      {/* Workspace Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl active:scale-95 transition-all text-gray-400 hover:text-white">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h3 className="text-lg font-black italic uppercase tracking-tight">{projectName}</h3>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Project Tasks Board</p>
          </div>
        </div>

        <Button size="sm" onClick={() => setShowCreateModal(true)} className="rounded-xl flex items-center gap-2">
          <Plus size={16} /> Create Task
        </Button>
      </div>

      {/* Kanban Board Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 items-start overflow-y-auto pb-8 scrollbar-hide">
        {/* Column 1: TODO */}
        <div className="p-4 rounded-[2rem] bg-white/[0.01] border border-white/5 space-y-4">
          <div className="flex justify-between items-center pl-1">
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Todo</h4>
            <span className="text-[9px] font-black bg-white/5 px-2 py-0.5 rounded-lg">{todoTasks.length}</span>
          </div>
          <div className="space-y-3">
            {todoTasks.map(t => (
              <div 
                key={t.id} 
                onClick={() => setSelectedTask(t)}
                className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-primary/20 transition-all cursor-pointer space-y-3 group"
              >
                <h5 className="font-bold text-xs text-white truncate group-hover:text-primary transition-colors">{t.title}</h5>
                <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{t.description}</p>
                <div className="flex justify-between items-center text-[9px] font-bold text-gray-600 uppercase tracking-widest pt-2 border-t border-white/5">
                  <span className="flex items-center gap-1"><Clock size={10} /> {t.due_date ? new Date(t.due_date).toLocaleDateString() : 'N/A'}</span>
                  <span className="capitalize">{t.priority}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: IN PROGRESS */}
        <div className="p-4 rounded-[2rem] bg-white/[0.01] border border-white/5 space-y-4">
          <div className="flex justify-between items-center pl-1">
            <h4 className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">In Progress</h4>
            <span className="text-[9px] font-black bg-white/5 px-2 py-0.5 rounded-lg">{inProgressTasks.length}</span>
          </div>
          <div className="space-y-3">
            {inProgressTasks.map(t => (
              <div 
                key={t.id} 
                onClick={() => setSelectedTask(t)}
                className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-yellow-500/20 transition-all cursor-pointer space-y-3 group"
              >
                <h5 className="font-bold text-xs text-white truncate group-hover:text-yellow-500 transition-colors">{t.title}</h5>
                <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{t.description}</p>
                <div className="flex justify-between items-center text-[9px] font-bold text-gray-600 uppercase tracking-widest pt-2 border-t border-white/5">
                  <span className="flex items-center gap-1"><Clock size={10} /> {t.due_date ? new Date(t.due_date).toLocaleDateString() : 'N/A'}</span>
                  <span className="capitalize">{t.priority}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 3: REVIEW */}
        <div className="p-4 rounded-[2rem] bg-white/[0.01] border border-white/5 space-y-4">
          <div className="flex justify-between items-center pl-1">
            <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Review</h4>
            <span className="text-[9px] font-black bg-white/5 px-2 py-0.5 rounded-lg">{reviewTasks.length}</span>
          </div>
          <div className="space-y-3">
            {reviewTasks.map(t => (
              <div 
                key={t.id} 
                onClick={() => setSelectedTask(t)}
                className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-purple-500/20 transition-all cursor-pointer space-y-3 group"
              >
                <h5 className="font-bold text-xs text-white truncate group-hover:text-purple-400 transition-colors">{t.title}</h5>
                <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{t.description}</p>
                <div className="flex justify-between items-center text-[9px] font-bold text-gray-600 uppercase tracking-widest pt-2 border-t border-white/5">
                  <span className="flex items-center gap-1"><Clock size={10} /> {t.due_date ? new Date(t.due_date).toLocaleDateString() : 'N/A'}</span>
                  <span className="capitalize">{t.priority}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 4: DONE */}
        <div className="p-4 rounded-[2rem] bg-white/[0.01] border border-white/5 space-y-4">
          <div className="flex justify-between items-center pl-1">
            <h4 className="text-[10px] font-black text-green-400 uppercase tracking-widest">Done</h4>
            <span className="text-[9px] font-black bg-white/5 px-2 py-0.5 rounded-lg">{doneTasks.length}</span>
          </div>
          <div className="space-y-3">
            {doneTasks.map(t => (
              <div 
                key={t.id} 
                onClick={() => setSelectedTask(t)}
                className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-green-500/20 transition-all cursor-pointer space-y-3 group opacity-60"
              >
                <h5 className="font-bold text-xs text-white line-through truncate group-hover:text-green-400 transition-colors">{t.title}</h5>
                <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{t.description}</p>
                <div className="flex justify-between items-center text-[9px] font-bold text-gray-600 uppercase tracking-widest pt-2 border-t border-white/5">
                  <span className="flex items-center gap-1"><Clock size={10} /> {t.due_date ? new Date(t.due_date).toLocaleDateString() : 'N/A'}</span>
                  <span className="capitalize">{t.priority}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task Details Drawer/Overlay */}
      {selectedTask && (
        <div className="fixed inset-0 flex items-center justify-end z-[100]">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedTask(null)} />
          <div className="bg-gray-900 border-l border-white/10 w-full max-w-lg h-full p-8 shadow-2xl relative z-10 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                    selectedTask.priority === 'critical' ? 'bg-red-500/20 text-red-400' : 'bg-primary/20 text-primary'
                  }`}>{selectedTask.priority} Priority</span>
                  <h3 className="text-xl font-black text-white italic uppercase tracking-tight">{selectedTask.title}</h3>
                </div>
                <button onClick={() => setSelectedTask(null)} className="p-2 text-gray-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-all">
                  <X size={16} />
                </button>
              </div>

              {/* Status Selector */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Task Status</label>
                <select 
                  value={selectedTask.status}
                  onChange={(e) => handleStatusChange(selectedTask.id, e.target.value as any)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                >
                  <option value="todo">Todo</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="done">Done</option>
                </select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Description</h4>
                <p className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-[11px] text-gray-300 leading-relaxed">
                  {selectedTask.description || 'No description provided.'}
                </p>
              </div>

              {/* Checklist Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <CheckSquare size={14} /> Checklist / Subtasks
                </h4>
                
                <div className="space-y-2">
                  {checklist.map(item => (
                    <div key={item.id} className="flex justify-between items-center p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04]">
                      <button 
                        onClick={() => handleToggleChecklist(item)}
                        className="flex items-center gap-3 text-left text-xs font-bold text-gray-300"
                      >
                        {item.completed ? (
                          <CheckedBox size={16} className="text-green-400" />
                        ) : (
                          <Square size={16} />
                        )}
                        <span className={item.completed ? 'line-through text-gray-500' : ''}>{item.title}</span>
                      </button>
                      <button 
                        onClick={() => handleDeleteChecklist(item.id)}
                        className="text-red-400 hover:text-red-300 p-1 rounded-lg"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddChecklistItem} className="flex gap-2">
                  <input 
                    type="text"
                    value={newChecklistItem}
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    placeholder="Add checklist item..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  />
                  <Button type="submit" size="sm">Add</Button>
                </form>
              </div>

              {/* Comments Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare size={14} /> Activity Comments
                </h4>

                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                        <span>{c.author?.full_name || 'Member'}</span>
                        <span>{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-[11px] text-gray-300 leading-relaxed">{c.content}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddComment} className="flex gap-2">
                  <input 
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Post a comment..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  />
                  <Button type="submit" size="sm">Send</Button>
                </form>
              </div>
            </div>

            <div className="pt-6 border-t border-white/5 flex gap-4">
              <Button 
                variant="danger" 
                onClick={() => handleDelete(selectedTask.id)} 
                className="w-full h-12 text-xs font-black rounded-2xl flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> Delete Task
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowCreateModal(false)} />
          <div className="bg-gray-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl relative z-10 space-y-6">
            <h3 className="text-xl font-black italic uppercase tracking-tight text-white pl-1">Create Task</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Task Title</label>
                <input 
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Design layout architecture"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Description</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Specify deliverables..."
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

              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Assign To</label>
                <select 
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.profile?.id}>{m.profile?.full_name || m.profile?.username || m.profile?.email}</option>
                  ))}
                </select>
              </div>

              <Button type="submit" fullWidth className="h-12 font-black rounded-2xl text-sm mt-4">Create Task</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default WorkspaceTasks;
