import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import {
    Search,
    UserCheck,
    UserX,
    ChevronLeft,
    ChevronRight,
    FileText,
    Filter,
    Loader2,
    Zap,
    X,
    Users as UsersIcon
} from 'lucide-react';
import { API_URL } from '../../lib/api';
import SecureImage from '../../components/common/SecureImage';
import ResponsiveTableWrapper from '../../components/common/ResponsiveTableWrapper';
import BottomSheet from '../../components/common/BottomSheet';
import TruncatedId from '../../components/common/TruncatedId';
import './UserManagement.css';

interface User {
    id: string;
    username: string;
    email: string;
    full_name: string;
    avatar_url: string;
    role: string;
    status: string;
    is_online: boolean;
    last_seen: string;
    created_at: string;
    notesCount: number;
    daily_deposit_limit: number | null;
    plan_tier: string;
    last_ip: string | null;
    country_code: string | null;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export const UserManagement = () => {
    const { session } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [pagination, setPagination] = useState<Pagination>({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
    });
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
    const [newLimit, setNewLimit] = useState<string>('');

    const fetchUsers = useCallback(async () => {
        if (!session?.access_token) return;
        setLoading(true);

        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
                ...(search && { search }),
                ...(statusFilter && { status: statusFilter })
            });

            const res = await fetch(`${API_URL}/api/admin/users?${params}`, {
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`,
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) throw new Error('Failed to fetch users');

            const data = await res.json() || {};
            setUsers(data.users || []);
            setPagination(data.pagination || {
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 0
            });
        } catch (err) {
            console.error('Failed to fetch users:', err);
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [session?.access_token, pagination.page, pagination.limit, search, statusFilter]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        const debounce = setTimeout(() => {
            if (pagination.page !== 1 && search) {
                setPagination(prev => ({ ...prev, page: 1 }));
            }
        }, 300);
        return () => clearTimeout(debounce);
    }, [search, pagination.page]);

    const updateUserStatus = async (userId: string, newStatus: 'active' | 'suspended') => {
        if (!session?.access_token) return;
        setActionLoading(userId);

        try {
            const res = await fetch(`${API_URL}/api/admin/users/${userId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to update user');
            }

            // Update local state
            setUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, status: newStatus } : u
            ));
            toast.success(`User status updated to ${newStatus}`);
        } catch (err) {
            console.error('Failed to update user:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to update user');
        } finally {
            setActionLoading(null);
        }
    };

    const handleUpdateLimit = async () => {
        if (!selectedUser || !session?.access_token) return;
        setActionLoading(selectedUser.id);

        try {
            const res = await fetch(`${API_URL}/api/admin/users/${selectedUser.id}/limit`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ limit: newLimit ? parseFloat(newLimit) : null })
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to update limit');
            }

            toast.success('User deposit limit updated!');
            setIsLimitModalOpen(false);
            fetchUsers();
        } catch (err) {
            console.error('Failed to update limit:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to update limit');
        } finally {
            setActionLoading(null);
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString();
    };

    const headers = [
        { key: 'user', label: 'User' },
        { key: 'email', label: 'Email' },
        { key: 'ip', label: 'IP Address' },
        { key: 'country', label: 'Country' },
        { key: 'role', label: 'Role' },
        { key: 'status', label: 'Status' },
        { key: 'notes', label: 'Notes' },
        { key: 'joined', label: 'Joined' },
        { key: 'actions', label: 'Actions' }
    ];

    return (
        <div className="user-management px-2 sm:px-4 py-3">
            <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                    <UsersIcon className="text-indigo-400 shrink-0" size={28} />
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">User Management</h2>
                        <p className="text-xs sm:text-sm text-gray-400">View and manage customer permissions and limits</p>
                    </div>
                </div>
                <span className="total-count text-xs sm:text-sm bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg font-semibold self-start sm:self-auto">
                    {pagination.total} Total Users
                </span>
            </div>

            {/* Sticky Filters */}
            <div className="filters-bar sticky top-14 z-30 bg-[#0F1220]/95 backdrop-blur-md p-3 rounded-xl border border-gray-800/80 mb-4 flex flex-col sm:flex-row gap-3">
                <div className="search-box flex-1 flex items-center gap-2 bg-gray-900/80 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300">
                    <Search size={18} className="text-gray-400 shrink-0" />
                    <input
                        id="user-search"
                        name="search"
                        type="text"
                        placeholder="Search username, email, or name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-transparent border-none outline-none text-gray-200 text-sm w-full"
                        aria-label="Search users"
                    />
                </div>
                <div className="filter-group flex items-center gap-2 bg-gray-900/80 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300">
                    <Filter size={18} className="text-gray-400 shrink-0" />
                    <select
                        id="user-status-filter"
                        name="status"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-transparent border-none outline-none text-gray-200 text-sm cursor-pointer"
                        aria-label="Filter by status"
                    >
                        <option value="" className="bg-gray-900">All Status</option>
                        <option value="active" className="bg-gray-900">Active</option>
                        <option value="suspended" className="bg-gray-900">Suspended</option>
                    </select>
                </div>
            </div>

            <ResponsiveTableWrapper
                headers={headers}
                data={users}
                loading={loading}
                emptyTitle="No Users Found"
                emptyDescription="No customer accounts match your search or filter parameters."
                keyExtractor={(u) => u.id}
                renderRow={(user) => {
                    const isProxy = user.last_ip?.includes('(Proxy)');
                    const cleanIp = user.last_ip?.replace('(Proxy)', '').trim();
                    return (
                        <tr key={user.id} className="hover:bg-white/5 transition-colors">
                            <td className="user-cell px-4 py-3">
                                <div className="user-info flex items-center gap-3">
                                    {user.avatar_url ? (
                                        <SecureImage src={user.avatar_url} alt={user.username} fallbackType="profile" className="w-8 h-8 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-xs text-white">
                                            {user.username?.[0]?.toUpperCase() || '?'}
                                        </div>
                                    )}
                                    <div className="user-details min-w-0">
                                        <span className="username font-bold text-sm text-white flex items-center gap-1.5">
                                            {user.username}
                                            {user.is_online && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                                        </span>
                                        <span className="fullname block truncate text-xs text-gray-400">{user.full_name}</span>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-300 truncate max-w-[180px]">{user.email}</td>
                            <td className="px-4 py-3 text-xs">
                                <span className="font-mono text-gray-300">{cleanIp || 'Unknown'}</span>
                                {isProxy && <span className="ml-1 text-[10px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded font-bold">PROXY</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">{user.country_code || 'N/A'}</td>
                            <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${user.role === 'admin' ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-800 text-gray-300'}`}>{user.role}</span>
                            </td>
                            <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${user.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>{user.status}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">{user.notesCount}</td>
                            <td className="px-4 py-3 text-xs text-gray-400">{formatDate(user.created_at)}</td>
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                    <button
                                        className="p-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                                        onClick={() => {
                                            setSelectedUser(user);
                                            setNewLimit(user.daily_deposit_limit?.toString() || '');
                                            setIsLimitModalOpen(true);
                                        }}
                                        title="Manage Limits"
                                    >
                                        <Zap size={16} />
                                    </button>
                                    {user.role !== 'admin' && (
                                        user.status === 'active' ? (
                                            <button
                                                className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center disabled:opacity-40"
                                                onClick={() => updateUserStatus(user.id, 'suspended')}
                                                disabled={actionLoading === user.id}
                                                title="Suspend user"
                                            >
                                                {actionLoading === user.id ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
                                            </button>
                                        ) : (
                                            <button
                                                className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center disabled:opacity-40"
                                                onClick={() => updateUserStatus(user.id, 'active')}
                                                disabled={actionLoading === user.id}
                                                title="Reactivate user"
                                            >
                                                {actionLoading === user.id ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                                            </button>
                                        )
                                    )}
                                </div>
                            </td>
                        </tr>
                    );
                }}
                renderCard={(user) => (
                    <div className="p-4 rounded-xl bg-gray-900/90 border border-gray-800 space-y-3 shadow-lg">
                        <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
                            <div className="flex items-center gap-2.5">
                                {user.avatar_url ? (
                                    <SecureImage src={user.avatar_url} alt={user.username} fallbackType="profile" className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-xs text-white">
                                        {user.username?.[0]?.toUpperCase() || '?'}
                                    </div>
                                )}
                                <div>
                                    <span className="font-bold text-white text-sm block">{user.username}</span>
                                    <span className="text-xs text-gray-400 block">{user.full_name}</span>
                                </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${user.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>{user.status}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="col-span-2">
                                <span className="text-gray-500 block">Email:</span>
                                <span className="text-gray-200 font-medium truncate block">{user.email}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block">Role:</span>
                                <span className="text-gray-300 font-semibold uppercase">{user.role}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block">Country:</span>
                                <span className="text-gray-300">{user.country_code || 'N/A'}</span>
                            </div>
                            <div className="col-span-2">
                                <span className="text-gray-500 block">User ID:</span>
                                <TruncatedId id={user.id} startChars={6} endChars={6} />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-gray-800">
                            <button
                                className="flex-1 py-2 px-3 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors border border-indigo-500/40 min-h-[44px]"
                                onClick={() => {
                                    setSelectedUser(user);
                                    setNewLimit(user.daily_deposit_limit?.toString() || '');
                                    setIsLimitModalOpen(true);
                                }}
                            >
                                <Zap size={16} /> Edit Limit
                            </button>
                            {user.role !== 'admin' && (
                                user.status === 'active' ? (
                                    <button
                                        className="flex-1 py-2 px-3 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors border border-red-500/30 min-h-[44px] disabled:opacity-40"
                                        onClick={() => updateUserStatus(user.id, 'suspended')}
                                        disabled={actionLoading === user.id}
                                    >
                                        {actionLoading === user.id ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />} Suspend
                                    </button>
                                ) : (
                                    <button
                                        className="flex-1 py-2 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors border border-emerald-500/30 min-h-[44px] disabled:opacity-40"
                                        onClick={() => updateUserStatus(user.id, 'active')}
                                        disabled={actionLoading === user.id}
                                    >
                                        {actionLoading === user.id ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />} Reactivate
                                    </button>
                                )
                            )}
                        </div>
                    </div>
                )}
            />

            {pagination.totalPages > 1 && (
                <div className="pagination flex items-center justify-between mt-6 pt-4 border-t border-gray-800">
                    <button
                        className="px-3.5 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 min-h-[44px]"
                        onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                        disabled={pagination.page <= 1}
                    >
                        <ChevronLeft size={18} /> Previous
                    </button>
                    <span className="text-xs sm:text-sm text-gray-400">Page {pagination.page} of {pagination.totalPages}</span>
                    <button
                        className="px-3.5 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 min-h-[44px]"
                        onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                        disabled={pagination.page >= pagination.totalPages}
                    >
                        Next <ChevronRight size={18} />
                    </button>
                </div>
            )}

            <BottomSheet
                isOpen={isLimitModalOpen && !!selectedUser}
                onClose={() => setIsLimitModalOpen(false)}
                title={`Manage Limits: ${selectedUser?.username}`}
                footer={
                    <div className="flex gap-2">
                        <button
                            className="flex-1 py-2.5 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-xs sm:text-sm transition-colors border border-gray-700 min-h-[44px]"
                            onClick={() => setIsLimitModalOpen(false)}
                        >
                            Cancel
                        </button>
                        <button
                            className="flex-1 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50 min-h-[44px]"
                            onClick={handleUpdateLimit}
                            disabled={actionLoading === selectedUser?.id}
                        >
                            {actionLoading === selectedUser?.id ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Save Changes'}
                        </button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="current-info text-xs sm:text-sm text-gray-400 space-y-1 bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                        <p>Current Plan: <span className="capitalize text-white font-semibold">{selectedUser?.plan_tier}</span></p>
                        <p>Current Limit: <span className="text-white font-semibold">${selectedUser?.daily_deposit_limit?.toLocaleString() || 'Default Plan Limit'}</span></p>
                    </div>

                    <div className="form-group space-y-1.5">
                        <label htmlFor="daily-limit-input" className="block text-xs font-semibold text-gray-300">Daily Deposit Limit (USD)</label>
                        <div className="relative">
                            <input
                                id="daily-limit-input"
                                name="dailyLimit"
                                type="number"
                                value={newLimit}
                                onChange={e => setNewLimit(e.target.value)}
                                placeholder="e.g. 5000"
                                className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-white text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                            <span className="absolute right-3 top-3 text-gray-400">$</span>
                        </div>
                        <p className="text-[11px] text-gray-400 italic">Custom limits override default plan limits for this user.</p>
                    </div>
                </div>
            </BottomSheet>
        </div>
    );
};

export default UserManagement;
