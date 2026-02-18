import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import {
    Search,
    UserCheck,
    UserX,
    ChevronLeft,
    ChevronRight,
    FileText,
    Filter
} from 'lucide-react';
import { API_URL } from '../../lib/api';
import SecureImage from '../../components/common/SecureImage';
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

    useEffect(() => {
        fetchUsers();
    }, [session, pagination.page, statusFilter]);

    useEffect(() => {
        const debounce = setTimeout(() => {
            if (pagination.page === 1) {
                fetchUsers();
            } else {
                setPagination(prev => ({ ...prev, page: 1 }));
            }
        }, 300);
        return () => clearTimeout(debounce);
    }, [search]);

    const fetchUsers = async () => {
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
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch users');

            const data = await res.json();
            setUsers(data.users);
            setPagination(data.pagination);
        } catch (err) {
            console.error('Failed to fetch users:', err);
        } finally {
            setLoading(false);
        }
    };

    const updateUserStatus = async (userId: string, newStatus: 'active' | 'suspended') => {
        if (!session?.access_token) return;
        setActionLoading(userId);

        try {
            const res = await fetch(`${API_URL}/api/admin/users/${userId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
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
        } catch (err) {
            console.error('Failed to update user:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to update user');
        } finally {
            setActionLoading(null);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    return (
        <div className="user-management">
            <div className="page-header">
                <h2>User Management</h2>
                <span className="total-count">{pagination.total} users</span>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="search-box">
                    <Search size={18} />
                    <input
                        id="user-search"
                        name="search"
                        type="text"
                        placeholder="Search by username, email, or name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search users by username, email, or name"
                    />
                </div>
                <div className="filter-group">
                    <Filter size={18} />
                    <select
                        id="user-status-filter"
                        name="status"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        aria-label="Filter by status"
                    >
                        <option value="">All Status</option>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                    </select>
                </div>
            </div>

            {/* Users Table */}
            <div className="users-table-container">
                <table className="users-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Notes</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="loading-row">
                                    <div className="loader-small" />
                                    Loading users...
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="empty-row">
                                    No users found
                                </td>
                            </tr>
                        ) : (
                            users.map(user => (
                                <tr key={user.id}>
                                    <td className="user-cell">
                                        <div className="user-info">
                                            {user.avatar_url ? (
                                                <SecureImage src={user.avatar_url} alt={user.username} fallbackType="profile" />
                                            ) : (
                                                <div className="avatar-placeholder">
                                                    {user.username?.[0]?.toUpperCase() || '?'}
                                                </div>
                                            )}
                                            <div className="user-details min-w-0">
                                                <span className="username truncate">
                                                    {user.username}
                                                    {user.is_online && <span className="online-dot flex-shrink-0" />}
                                                </span>
                                                <span className="fullname truncate text-xs text-gray-500">{user.full_name}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="max-w-[150px] md:max-w-[200px]">
                                        <div className="truncate" title={user.email}>{user.email}</div>
                                    </td>
                                    <td>
                                        <span className={`role-badge ${user.role}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${user.status}`}>
                                            {user.status}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="notes-count">
                                            <FileText size={14} />
                                            {user.notesCount}
                                        </span>
                                    </td>
                                    <td className="date-cell">{formatDate(user.created_at)}</td>
                                    <td className="actions-cell">
                                        {user.role !== 'admin' && (
                                            <>
                                                {user.status === 'active' ? (
                                                    <button
                                                        className="action-btn suspend"
                                                        onClick={() => updateUserStatus(user.id, 'suspended')}
                                                        disabled={actionLoading === user.id}
                                                        title="Suspend user"
                                                    >
                                                        <UserX size={16} />
                                                    </button>
                                                ) : (
                                                    <button
                                                        className="action-btn activate"
                                                        onClick={() => updateUserStatus(user.id, 'active')}
                                                        disabled={actionLoading === user.id}
                                                        title="Reactivate user"
                                                    >
                                                        <UserCheck size={16} />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="pagination">
                    <button
                        className="page-btn"
                        onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                        disabled={pagination.page <= 1}
                    >
                        <ChevronLeft size={18} />
                        Previous
                    </button>
                    <span className="page-info">
                        Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                        className="page-btn"
                        onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                        disabled={pagination.page >= pagination.totalPages}
                    >
                        Next
                        <ChevronRight size={18} />
                    </button>
                </div>
            )}
        </div>
    );
};
