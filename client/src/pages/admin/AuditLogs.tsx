import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    History as HistoryIcon,
    Filter,
    Activity,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { API_URL } from '../../lib/api';
import SecureImage from '../../components/common/SecureImage';
import './AuditLogs.css';

interface AuditLog {
    id: string;
    admin_id: string;
    action: string;
    target_type: string;
    target_id: string;
    details: any;
    ip_address: string;
    created_at: string;
    admin: {
        username: string;
        full_name: string;
        avatar_url: string;
    };
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export const AuditLogs = () => {
    const { session } = useAuth();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [pagination, setPagination] = useState<Pagination>({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
    });
    const [loading, setLoading] = useState(true);
    const [actionFilter, setActionFilter] = useState('');
    const [targetFilter, setTargetFilter] = useState('');

    useEffect(() => {
        fetchLogs();
    }, [session, pagination.page, actionFilter, targetFilter]);

    const fetchLogs = async () => {
        if (!session?.access_token) return;
        setLoading(true);

        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
                ...(actionFilter && { action: actionFilter }),
                ...(targetFilter && { target_type: targetFilter })
            });

            const res = await fetch(`${API_URL}/api/admin/audit-logs?${params}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch audit logs');

            const data = await res.json();
            setLogs(data.logs);
            setPagination(data.pagination);
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return {
            date: date.toLocaleDateString(),
            time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
    };

    const getActionBadgeClass = (action: string) => {
        if (action.includes('suspend')) return 'danger';
        if (action.includes('update')) return 'warning';
        if (action.includes('broadcast')) return 'info';
        if (action.includes('join') || action.includes('resolve')) return 'success';
        return 'default';
    };

    const formatActionName = (action: string) => {
        return action.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    return (
        <div className="audit-logs">
            <div className="page-header">
                <div className="header-title">
                    <HistoryIcon className="header-icon" />
                    <div>
                        <h2>Admin Audit Logs</h2>
                        <p>Track all administrative actions and security events</p>
                    </div>
                </div>
                <div className="stats-mini">
                    <div className="stat-item">
                        <span className="label">Total Events</span>
                        <span className="value">{pagination.total}</span>
                    </div>
                </div>
            </div>

            <div className="filters-bar">
                <div className="filter-group">
                    <Activity size={18} />
                    <select
                        id="audit-action-filter"
                        name="actionFilter"
                        value={actionFilter}
                        onChange={(e) => {
                            setActionFilter(e.target.value);
                            setPagination(prev => ({ ...prev, page: 1 }));
                        }}
                    >
                        <option value="">All Actions</option>
                        <option value="update_user_status">User Status Updates</option>
                        <option value="update_support_status">Support Status Updates</option>
                        <option value="join_support_chat">Admin Joins</option>
                        <option value="broadcast">Broadcast Messages</option>
                    </select>
                </div>

                <div className="filter-group">
                    <Filter size={18} />
                    <select
                        id="audit-target-filter"
                        name="targetFilter"
                        value={targetFilter}
                        onChange={(e) => {
                            setTargetFilter(e.target.value);
                            setPagination(prev => ({ ...prev, page: 1 }));
                        }}
                    >
                        <option value="">All Targets</option>
                        <option value="user">Users</option>
                        <option value="conversation">Conversations</option>
                        <option value="broadcast">Broadcasts</option>
                    </select>
                </div>
            </div>

            <div className="logs-table-container">
                <table className="logs-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Admin</th>
                            <th>Action</th>
                            <th>Target</th>
                            <th>IP Address</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="skeleton-row">
                                    <td colSpan={6}><div className="skeleton-line" /></td>
                                </tr>
                            ))
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="empty-row">No audit logs found</td>
                            </tr>
                        ) : (
                            logs.map(log => {
                                const { date, time } = formatDate(log.created_at);
                                return (
                                    <tr key={log.id}>
                                        <td className="time-cell">
                                            <div className="date">{date}</div>
                                            <div className="time">{time}</div>
                                        </td>
                                        <td className="admin-cell">
                                            <div className="admin-info">
                                                {log.admin.avatar_url ? (
                                                    <SecureImage src={log.admin.avatar_url} alt="" fallbackType="profile" />
                                                ) : (
                                                    <div className="avatar-placeholder">
                                                        {log.admin.username[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <span>{log.admin.username}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`action-badge ${getActionBadgeClass(log.action)}`}>
                                                {formatActionName(log.action)}
                                            </span>
                                        </td>
                                        <td className="target-cell">
                                            <span className="target-type">{log.target_type}</span>
                                            <span className="target-id">{log.target_id.slice(0, 8)}...</span>
                                        </td>
                                        <td className="ip-cell">{log.ip_address || 'Internal'}</td>
                                        <td className="details-cell">
                                            <pre>{JSON.stringify(log.details, null, 2)}</pre>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {pagination.totalPages > 1 && (
                <div className="pagination">
                    <button
                        disabled={pagination.page === 1}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    >
                        <ChevronLeft size={18} /> Previous
                    </button>
                    <span>Page {pagination.page} of {pagination.totalPages}</span>
                    <button
                        disabled={pagination.page === pagination.totalPages}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    >
                        Next <ChevronRight size={18} />
                    </button>
                </div>
            )}
        </div>
    );
};
