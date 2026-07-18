import React, { useEffect, useState, useMemo } from 'react';
import { 
  Users, Search, UserCheck, ShieldAlert, Award, Layers, 
  Trash2, Mail, Edit3, Settings, Plus, RefreshCw, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import { 
  getDepartments, getCustomRoles, createCustomRole, 
  updateMemberCustomRole, updateMemberDepartment 
} from '../../lib/collaborationApi';
import type { Department, WorkspaceRole } from '../../types/collaboration';
import { removeMember, inviteMember } from '../../lib/teamsApi';
import { Button } from '../common/Button';
import toast from 'react-hot-toast';

interface WorkspaceMembersProps {
  teamId: string;
  members: any[];
  myRole: string;
  onRefresh: () => void;
}

export const WorkspaceMembers: React.FC<WorkspaceMembersProps> = ({ 
  teamId, members, myRole, onRefresh 
}) => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [customRoles, setCustomRoles] = useState<WorkspaceRole[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sortField, setSortField] = useState('full_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Modals & Forms
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState<Record<string, boolean>>({
    workspace: true,
    projects: false,
    notes: true,
    files: false,
    chat: true,
    billing: false
  });

  // Bulk selection
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const loadDirectoryData = async () => {
    setLoading(true);
    try {
      const [deptsData, rolesData] = await Promise.all([
        getDepartments().catch(() => []),
        getCustomRoles(teamId).catch(() => [])
      ]);
      setDepartments(deptsData);
      setCustomRoles(rolesData);
    } catch {
      toast.error('Failed to load roles and departments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectoryData();
  }, [teamId]);

  const handleToggleSelect = (userId: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSelectAll = (filteredList: any[]) => {
    if (selectedUserIds.size === filteredList.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredList.map(m => m.user_id)));
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;

    try {
      await createCustomRole(teamId, newRoleName.trim(), rolePermissions);
      toast.success('Custom role created.');
      setNewRoleName('');
      setShowRoleModal(false);
      await loadDirectoryData();
    } catch {
      toast.error('Failed to create role.');
    }
  };

  const handleMemberRoleUpdate = async (userId: string, customRoleId: string | null) => {
    try {
      await updateMemberCustomRole(teamId, userId, { customRoleId });
      toast.success('Role updated.');
      onRefresh();
    } catch {
      toast.error('Failed to update member role.');
    }
  };

  const handleMemberDeptUpdate = async (userId: string, departmentId: string | null) => {
    try {
      await updateMemberDepartment(teamId, userId, departmentId);
      toast.success('Department updated.');
      onRefresh();
    } catch {
      toast.error('Failed to update department.');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm("Remove this member from the team?")) return;
    try {
      await removeMember(teamId, userId);
      toast.success('Member removed.');
      onRefresh();
    } catch {
      toast.error('Failed to remove member.');
    }
  };

  const handleBulkRemove = async () => {
    if (selectedUserIds.size === 0) return;
    if (!window.confirm(`Remove ${selectedUserIds.size} members from the team?`)) return;

    const toastId = toast.loading('Removing members...');
    try {
      for (const userId of Array.from(selectedUserIds)) {
        await removeMember(teamId, userId).catch(() => null);
      }
      toast.success('Bulk removal completed.', { id: toastId });
      setSelectedUserIds(new Set());
      onRefresh();
    } catch {
      toast.error('Failed to complete operation.', { id: toastId });
    }
  };

  // Filter & Sort Logic
  const filteredMembers = useMemo(() => {
    const list = Array.isArray(members) ? members : [];
    
    return list
      .filter(m => {
        const name = String(m.profile?.full_name || m.profile?.username || m.profile?.email || '').toLowerCase();
        const matchesSearch = name.includes(search.toLowerCase());
        
        const matchesRole = !roleFilter || m.role === roleFilter;
        const matchesDept = !deptFilter || m.department_id === deptFilter;

        return matchesSearch && matchesRole && matchesDept;
      })
      .sort((a, b) => {
        const valA = String(a.profile?.full_name || a.profile?.username || a.profile?.email || '');
        const valB = String(b.profile?.full_name || b.profile?.username || b.profile?.email || '');
        
        const order = sortOrder === 'asc' ? 1 : -1;
        return valA.localeCompare(valB) * order;
      });
  }, [members, search, roleFilter, deptFilter, sortField, sortOrder]);

  // Paginated List
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredMembers.slice(start, start + itemsPerPage);
  }, [filteredMembers, currentPage]);

  const totalPages = Math.ceil(filteredMembers.length / itemsPerPage) || 1;

  const isAdmin = myRole === 'owner' || myRole === 'admin';

  return (
    <div className="p-6 md:p-8 space-y-6 overflow-y-auto h-full scrollbar-hide bg-black text-white relative">
      {/* Action Header */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 border-b border-white/5 pb-4">
        <div>
          <h3 className="text-lg font-black italic uppercase tracking-tight flex items-center gap-2">
            <Users size={18} className="text-primary" /> Member Directory
          </h3>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Manage roles, assign departments, and track permissions</p>
        </div>

        <div className="flex gap-2">
          {isAdmin && (
            <Button size="sm" onClick={() => setShowRoleModal(true)} className="rounded-xl flex items-center gap-2">
              <Plus size={16} /> Custom Role
            </Button>
          )}
          {selectedUserIds.size > 0 && isAdmin && (
            <Button size="sm" variant="danger" onClick={handleBulkRemove} className="rounded-xl flex items-center gap-2">
              <Trash2 size={16} /> Remove Selected ({selectedUserIds.size})
            </Button>
          )}
          <button onClick={loadDirectoryData} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl active:scale-95 transition-all text-gray-400 hover:text-white border border-white/5">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Filters Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input 
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full bg-white/5 border border-white/5 rounded-2xl pl-11 pr-5 py-3.5 text-xs text-white focus:outline-none focus:border-white/10"
          />
        </div>

        <select 
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-white/5 border border-white/5 rounded-2xl px-5 py-3.5 text-xs text-gray-300 focus:outline-none"
        >
          <option value="">All Roles...</option>
          <option value="owner">Owner</option>
          <option value="admin">Administrator</option>
          <option value="member">Member</option>
        </select>

        <select 
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="bg-white/5 border border-white/5 rounded-2xl px-5 py-3.5 text-xs text-gray-300 focus:outline-none"
        >
          <option value="">All Departments...</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Directory Table */}
      <div className="rounded-[2rem] bg-white/[0.01] border border-white/5 overflow-hidden shadow-2xl">
        <table className="w-full text-left text-xs text-gray-400">
          <thead className="bg-white/5 text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
            <tr>
              {isAdmin && (
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    checked={selectedUserIds.size === filteredMembers.length && filteredMembers.length > 0}
                    onChange={() => handleSelectAll(filteredMembers)}
                    className="rounded border-gray-700 bg-transparent text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                </th>
              )}
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">System Role</th>
              <th className="px-6 py-4">Custom Role</th>
              <th className="px-6 py-4">Department</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {paginatedMembers.map(m => (
              <tr key={m.id} className="hover:bg-white/[0.01] transition-colors group">
                {isAdmin && (
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      checked={selectedUserIds.has(m.user_id)}
                      onChange={() => handleToggleSelect(m.user_id)}
                      className="rounded border-gray-700 bg-transparent text-primary focus:ring-0 cursor-pointer"
                    />
                  </td>
                )}
              <td className="px-6 py-4 flex items-center gap-3 min-w-[200px]">
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden border border-white/5 flex-shrink-0">
                  {m.profile?.avatar_url ? (
                    <img src={m.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-black text-gray-500">{(m.profile?.full_name || 'U').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white truncate">{m.profile?.full_name || m.profile?.username}</div>
                  <div className="text-[9px] text-gray-500 truncate mt-0.5">{m.profile?.email}</div>
                </div>
              </td>
              <td className="px-6 py-4 uppercase font-bold text-[10px]">{m.role}</td>
              <td className="px-6 py-4">
                {isAdmin && m.role !== 'owner' ? (
                  <select 
                    value={m.custom_role_id || ''}
                    onChange={(e) => handleMemberRoleUpdate(m.user_id, e.target.value || null)}
                    className="bg-transparent border-none text-xs text-gray-300 focus:outline-none cursor-pointer"
                  >
                    <option value="">None...</option>
                    {customRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                ) : (
                  <span>{customRoles.find(r => r.id === m.custom_role_id)?.name || 'Default'}</span>
                )}
              </td>
              <td className="px-6 py-4">
                {isAdmin && m.role !== 'owner' ? (
                  <select 
                    value={m.department_id || ''}
                    onChange={(e) => handleMemberDeptUpdate(m.user_id, e.target.value || null)}
                    className="bg-transparent border-none text-xs text-gray-300 focus:outline-none cursor-pointer"
                  >
                    <option value="">Unassigned...</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                ) : (
                  <span>{departments.find(d => d.id === m.department_id)?.name || 'Unassigned'}</span>
                )}
              </td>
              <td className="px-6 py-4 text-right">
                {isAdmin && m.role !== 'owner' && (
                  <button 
                    onClick={() => handleRemoveMember(m.user_id)}
                    className="p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex justify-between items-center px-4 py-3 border-t border-white/5 bg-white/5 rounded-b-[2rem]">
        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Page {currentPage} of {totalPages}</span>
        <div className="flex gap-2">
          <button 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white disabled:opacity-25"
          >
            <ChevronLeft size={14} />
          </button>
          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => prev + 1)}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white disabled:opacity-25"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Create Custom Role Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowRoleModal(false)} />
          <div className="bg-gray-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-sm shadow-2xl relative z-10 space-y-6">
            <h3 className="text-xl font-black italic uppercase tracking-tight text-white pl-1">New Custom Role</h3>
            <form onSubmit={handleCreateRole} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Role Name</label>
                <input 
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="Moderator"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Permissions</label>
                <div className="space-y-2 rounded-2xl bg-white/5 p-4">
                  {Object.keys(rolePermissions).map(key => (
                    <label key={key} className="flex items-center gap-3 text-xs font-bold text-gray-300 capitalize cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={rolePermissions[key]}
                        onChange={(e) => setRolePermissions(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="rounded border-gray-700 bg-transparent text-primary focus:ring-0"
                      />
                      <span>Can access {key}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Button type="submit" fullWidth className="h-12 font-black rounded-2xl text-sm mt-4">Save Custom Role</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default WorkspaceMembers;
