import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import {
    Clock,
    ArrowUpCircle,
    Loader2,
    CheckCircle,
    XCircle
} from 'lucide-react';
import { API_URL } from '../../lib/api';
import './LimitRequestsPage.css';

interface LimitRequest {
    id: string;
    user_id: string;
    requested_limit: number;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    admin_note: string | null;
    created_at: string;
    user: {
        username: string;
        email: string;
        full_name: string;
        plan_tier: string;
        daily_deposit_limit: number | null;
    };
}

export const LimitRequestsPage = () => {
    const { session } = useAuth();
    const [requests, setRequests] = useState<LimitRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchRequests = useCallback(async () => {
        if (!session?.access_token) return;
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/api/admin/limit-requests?status=${statusFilter}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) throw new Error('Failed to fetch requests');
            const data = await res.json();
            setRequests(data);
        } catch (err) {
            console.error('Fetch error:', err);
            toast.error('Failed to load limit requests');
        } finally {
            setLoading(false);
        }
    }, [session?.access_token, statusFilter]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const handleProcessRequest = async (id: string, status: 'approved' | 'rejected', note: string = '') => {
        if (!session?.access_token) return;
        setProcessingId(id);

        try {
            const res = await fetch(`${API_URL}/api/admin/limit-requests/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ status, admin_note: note })
            });

            if (!res.ok) throw new Error('Failed to process request');
            
            toast.success(`Request ${status} successfully`);
            setRequests(prev => prev.filter(r => r.id !== id));
        } catch {
            toast.error('Failed to process request');
        } finally {
            setProcessingId(null);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="limit-requests-page">
            <div className="page-header">
                <div className="title-section">
                    <h2>Limit Increase Requests</h2>
                    <p className="subtitle">Review and manage custom daily transaction limits</p>
                </div>
                
                <div className="filter-tabs">
                    <button 
                        className={statusFilter === 'pending' ? 'active' : ''} 
                        onClick={() => setStatusFilter('pending')}
                    >
                        Pending
                    </button>
                    <button 
                        className={statusFilter === 'approved' ? 'active' : ''} 
                        onClick={() => setStatusFilter('approved')}
                    >
                        Approved
                    </button>
                    <button 
                        className={statusFilter === 'rejected' ? 'active' : ''} 
                        onClick={() => setStatusFilter('rejected')}
                    >
                        Rejected
                    </button>
                </div>
            </div>

            <div className="requests-container">
                {loading ? (
                    <div className="loading-state">
                        <Loader2 className="animate-spin" size={32} />
                        <p>Loading requests...</p>
                    </div>
                ) : requests.length === 0 ? (
                    <div className="empty-state">
                        <Clock size={48} className="text-gray-600 mb-4" />
                        <h3>No {statusFilter} requests</h3>
                        <p>All clear! There are no {statusFilter} limit increase requests to show.</p>
                    </div>
                ) : (
                    <div className="requests-grid">
                        {requests.map(request => (
                            <div key={request.id} className="request-card">
                                <div className="card-header">
                                    <div className="user-info">
                                        <div className="avatar-mini">
                                            {request.user.username[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <span className="username">{request.user.username}</span>
                                            <span className="email">{request.user.email}</span>
                                        </div>
                                    </div>
                                    <div className={`plan-badge ${request.user.plan_tier}`}>
                                        {request.user.plan_tier}
                                    </div>
                                </div>

                                <div className="limit-comparison">
                                    <div className="limit-item">
                                        <span className="label">Current Limit</span>
                                        <span className="value">${(request.user.daily_deposit_limit || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="limit-arrow">
                                        <ArrowUpCircle className="text-primary" size={20} />
                                    </div>
                                    <div className="limit-item">
                                        <span className="label">Requested</span>
                                        <span className="value requested">${request.requested_limit.toLocaleString()}</span>
                                    </div>
                                </div>

                                <div className="reason-box">
                                    <span className="label">Reason for Request</span>
                                    <p>{request.reason || 'No reason provided.'}</p>
                                </div>

                                <div className="card-footer">
                                    <span className="timestamp">{formatDate(request.created_at)}</span>
                                    
                                    {statusFilter === 'pending' && (
                                        <div className="action-buttons">
                                            <button 
                                                className="btn-reject"
                                                onClick={() => handleProcessRequest(request.id, 'rejected')}
                                                disabled={!!processingId}
                                            >
                                                {processingId === request.id ? <Loader2 className="animate-spin" size={16} /> : <XCircle size={16} />}
                                                Reject
                                            </button>
                                            <button 
                                                className="btn-approve"
                                                onClick={() => handleProcessRequest(request.id, 'approved')}
                                                disabled={!!processingId}
                                            >
                                                {processingId === request.id ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                                                Approve
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
