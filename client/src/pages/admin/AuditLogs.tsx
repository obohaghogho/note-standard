import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import {
    History as HistoryIcon,
    Filter,
    Activity as ActivityIcon,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { API_URL } from '../../lib/api';
import SecureImage from '../../components/common/SecureImage';
import ResponsiveTableWrapper from '../../components/common/ResponsiveTableWrapper';
import TruncatedId from '../../components/common/TruncatedId';
import './AuditLogs.css';

interface AuditLog {
    id: string;
    admin_id: string;
    action: string;
    target_type: string;
    target_id: string;
    details: Record<string, unknown>;
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
    const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

    const toggleExpand = (id: string) => {
        setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const fetchLogs = useCallback(async () => {
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
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`,
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) throw new Error('Failed to fetch audit logs');

            const data = await res.json() || {};
            setLogs(data.logs || []);
            setPagination(data.pagination || {
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 0
            });
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
            toast.error('Failed to load audit logs');
        } finally {
            setLoading(false);
        }
    }, [session?.access_token, pagination.page, pagination.limit, actionFilter, targetFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

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

    const headers = [
        { key: 'time', label: 'Time' },
        { key: 'admin', label: 'Admin' },
        { key: 'action', label: 'Action' },
        { key: 'target', label: 'Target' },
        { key: 'ip', label: 'IP Address' },
        { key: 'details', label: 'Details' }
    ];

    return (
        <div className="audit-logs px-2 sm:px-4 py-3">
            <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="header-title flex items-center gap-3">
                    <HistoryIcon className="header-icon text-indigo-400 shrink-0" size={28} />
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Admin Audit Logs</h2>
                        <p className="text-xs sm:text-sm text-gray-400">Track all administrative actions and security events</p>
                    </div>
                </div>
                <div className="stats-mini self-start sm:self-auto bg-gray-900/60 border border-gray-800 px-3 py-1.5 rounded-lg">
                    <div className="stat-item flex items-center gap-2 text-xs">
                        <span className="label text-gray-400 font-medium">Total Events:</span>
                        <span className="value font-bold text-indigo-300">{pagination.total}</span>
                    </div>
                </div>
            </div>

            {/* Sticky Filters Toolbar */}
            <div className="filters-bar sticky top-14 z-30 bg-[#0F1220]/95 backdrop-blur-md p-3 rounded-xl border border-gray-800/80 mb-4 flex flex-col sm:flex-row gap-3">
                <div className="filter-group flex-1 flex items-center gap-2 bg-gray-900/80 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300">
                    <ActivityIcon size={18} className="text-gray-400 shrink-0" />
                    <select
                        id="audit-action-filter"
                        name="actionFilter"
                        value={actionFilter}
                        onChange={(e) => {
                            setActionFilter(e.target.value);
                            setPagination(prev => ({ ...prev, page: 1 }));
                        }}
                        className="bg-transparent border-none outline-none text-gray-200 text-sm w-full cursor-pointer"
                        aria-label="Filter by action type"
                    >
                        <option value="" className="bg-gray-900">All Actions</option>
                        <option value="update_user_status" className="bg-gray-900">User Status Updates</option>
                        <option value="update_support_status" className="bg-gray-900">Support Status Updates</option>
                        <option value="join_support_chat" className="bg-gray-900">Admin Joins</option>
                        <option value="broadcast" className="bg-gray-900">Broadcast Messages</option>
                    </select>
                </div>

                <div className="filter-group flex-1 flex items-center gap-2 bg-gray-900/80 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300">
                    <Filter size={18} className="text-gray-400 shrink-0" />
                    <select
                        id="audit-target-filter"
                        name="targetFilter"
                        value={targetFilter}
                        onChange={(e) => {
                            setTargetFilter(e.target.value);
                            setPagination(prev => ({ ...prev, page: 1 }));
                        }}
                        className="bg-transparent border-none outline-none text-gray-200 text-sm w-full cursor-pointer"
                        aria-label="Filter by target type"
                    >
                        <option value="" className="bg-gray-900">All Targets</option>
                        <option value="user" className="bg-gray-900">Users</option>
                        <option value="conversation" className="bg-gray-900">Conversations</option>
                        <option value="broadcast" className="bg-gray-900">Broadcasts</option>
                    </select>
                </div>
            </div>

            <ResponsiveTableWrapper
                headers={headers}
                data={logs}
                loading={loading}
                emptyTitle="No Audit Logs Found"
                emptyDescription="No administrative actions match your active filter criteria."
                keyExtractor={(log) => log.id}
                renderRow={(log) => {
                    const { date, time } = formatDate(log.created_at);
                    return (
                        <tr key={log.id} className="hover:bg-white/5 transition-colors">
                            <td className="time-cell px-4 py-3 text-xs">
                                <div className="date font-medium text-gray-200">{date}</div>
                                <div className="time text-gray-400">{time}</div>
                            </td>
                            <td className="admin-cell px-4 py-3">
                                <div className="admin-info flex items-center gap-2">
                                    {log.admin?.avatar_url ? (
                                        <SecureImage src={log.admin.avatar_url} alt="" fallbackType="profile" className="w-7 h-7 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-xs text-white">
                                            {log.admin?.username?.[0]?.toUpperCase() || 'A'}
                                        </div>
                                    )}
                                    <span className="text-sm text-gray-200 font-medium">{log.admin?.username || 'Unknown Admin'}</span>
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                <span className={`action-badge px-2.5 py-1 rounded-full text-xs font-semibold ${getActionBadgeClass(log.action)}`}>
                                    {formatActionName(log.action)}
                                </span>
                            </td>
                            <td className="target-cell px-4 py-3 text-xs">
                                <span className="target-type block text-gray-400 font-medium">{log.target_type}</span>
                                <TruncatedId id={log.target_id} />
                            </td>
                            <td className="ip-cell px-4 py-3 text-xs font-mono text-gray-400">{log.ip_address || 'Internal'}</td>
                            <td className="details-cell px-4 py-3 text-xs">
                                <pre className="max-w-xs overflow-x-auto text-[11px] bg-gray-900/60 p-2 rounded border border-gray-800 text-gray-300">
                                    {JSON.stringify(log.details, null, 2)}
                                </pre>
                            </td>
                        </tr>
                    );
                }}
                renderCard={(log) => {
                    const { date, time } = formatDate(log.created_at);
                    const isExpanded = !!expandedCards[log.id];
                    return (
                        <div className="p-4 rounded-xl bg-gray-900/80 border border-gray-800 space-y-3 shadow-lg">
                            <div className="flex items-center justify-between gap-2 border-b border-gray-800/60 pb-2.5">
                                <div className="flex items-center gap-2">
                                    {log.admin?.avatar_url ? (
                                        <SecureImage src={log.admin.avatar_url} alt="" fallbackType="profile" className="w-7 h-7 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-xs text-white">
                                            {log.admin?.username?.[0]?.toUpperCase() || 'A'}
                                        </div>
                                    )}
                                    <span className="text-sm font-bold text-white">{log.admin?.username || 'Unknown Admin'}</span>
                                </div>
                                <span className={`action-badge px-2 py-0.5 rounded-full text-[11px] font-semibold ${getActionBadgeClass(log.action)}`}>
                                    {formatActionName(log.action)}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <span className="text-gray-500 block">Time:</span>
                                    <span className="text-gray-300 font-medium">{date} {time}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">IP Address:</span>
                                    <span className="font-mono text-gray-300">{log.ip_address || 'Internal'}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-gray-500 block">Target ({log.target_type}):</span>
                                    <TruncatedId id={log.target_id} startChars={6} endChars={6} />
                                </div>
                            </div>

                            <div className="pt-2 border-t border-gray-800/60">
                                <button
                                    onClick={() => toggleExpand(log.id)}
                                    className="flex items-center justify-between w-full text-xs font-semibold text-indigo-400 hover:text-indigo-300 py-1"
                                >
                                    <span>Payload Details</span>
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                                {isExpanded && (
                                    <pre className="mt-2 text-[11px] bg-black/50 p-2.5 rounded-lg border border-gray-800 text-gray-300 overflow-x-auto whitespace-pre-wrap word-break">
                                        {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                )}
                            </div>
                        </div>
                    );
                }}
            />

            {pagination.totalPages > 1 && (
                <div className="pagination flex items-center justify-between mt-6 pt-4 border-t border-gray-800">
                    <button
                        disabled={pagination.page === 1}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                        className="px-3.5 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 min-h-[44px]"
                    >
                        <ChevronLeft size={18} /> Previous
                    </button>
                    <span className="text-xs sm:text-sm text-gray-400">Page {pagination.page} of {pagination.totalPages}</span>
                    <button
                        disabled={pagination.page === pagination.totalPages}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                        className="px-3.5 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 min-h-[44px]"
                    >
                        Next <ChevronRight size={18} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default AuditLogs;

