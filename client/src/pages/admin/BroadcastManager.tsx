import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    Megaphone,
    Plus,
    Trash2,
    Clock
} from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'dompurify';
import { API_URL } from '../../lib/api';
import './BroadcastManager.css';

interface Broadcast {
    id: string;
    title: string;
    content: string;
    target_audience: string;
    created_at: string;
    expires_at: string | null;
    admin: {
        username: string;
    };
}

export const BroadcastManager = () => {
    const { session } = useAuth();
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newBroadcast, setNewBroadcast] = useState({
        title: '',
        content: '',
        target_audience: 'all',
        expires_in_hours: '24'
    });

    useEffect(() => {
        fetchBroadcasts();
    }, [session]);

    const fetchBroadcasts = async () => {
        if (!session?.access_token) return;
        try {
            const res = await fetch(`${API_URL}/api/admin/broadcasts`, {
                headers: { 'Authorization': `Bearer ${session.access_token} ` }
            });
            const data = await res.json();
            setBroadcasts(data);
        } catch (err) {
            console.error('Failed to fetch broadcasts:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!session?.access_token) return;

        try {
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + parseInt(newBroadcast.expires_in_hours));

            const res = await fetch(`${API_URL}/api/admin/broadcasts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token} `
                },
                body: JSON.stringify({
                    ...newBroadcast,
                    expires_at: expiresAt.toISOString()
                })
            });

            if (res.ok) {
                const created = await res.json();
                setBroadcasts(prev => [created, ...prev]);
                setShowModal(false);
                setNewBroadcast({ title: '', content: '', target_audience: 'all', expires_in_hours: '24' });
            }
        } catch (err) {
            console.error('Failed to create broadcast:', err);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this broadcast?')) return;
        if (!session?.access_token) return;

        try {
            const res = await fetch(`${API_URL}/api/admin/broadcasts/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (res.ok) {
                setBroadcasts(prev => prev.filter(b => b.id !== id));
            }
        } catch (err) {
            console.error('Failed to delete broadcast:', err);
        }
    };

    return (
        <div className="broadcast-manager">
            <div className="page-header">
                <div className="header-title">
                    <Megaphone className="header-icon" />
                    <div>
                        <h2>Broadcast Messages</h2>
                        <p>Send announcements to all active users</p>
                    </div>
                </div>
                <button className="create-btn" onClick={() => setShowModal(true)}>
                    <Plus size={18} /> New Broadcast
                </button>
            </div>

            <div className="broadcast-grid">
                {loading ? (
                    <div>Loading...</div>
                ) : broadcasts.length === 0 ? (
                    <div className="empty-state">
                        <Megaphone size={48} />
                        <h3>No broadcasts yet</h3>
                        <p>Start by creating your first global announcement.</p>
                    </div>
                ) : (
                    broadcasts.map(b => (
                        <div key={b.id} className="broadcast-card">
                            <div className="card-header">
                                <span className="audience-tag">{b.target_audience}</span>
                                <button className="delete-btn" onClick={() => handleDelete(b.id)}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <h3>{b.title}</h3>
                            <div
                                className="content"
                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(b.content) }}
                            />
                            <div className="card-footer">
                                <span className="admin-name">By {b.admin.username}</span>
                                <span className="date">
                                    <Clock size={12} />
                                    {new Date(b.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Create New Broadcast</h3>
                        <form onSubmit={handleCreate}>
                            <div className="form-group">
                                <label htmlFor="broadcastTitle">Title</label>
                                <input
                                    id="broadcastTitle"
                                    name="broadcastTitle"
                                    type="text"
                                    required
                                    value={newBroadcast.title}
                                    onChange={e => setNewBroadcast({ ...newBroadcast, title: e.target.value })}
                                    placeholder="Enter title..."
                                />
                            </div>
                            <div className="form-group quill-group">
                                <label htmlFor="broadcastContent">Content</label>
                                <div id="broadcastContent">
                                    <ReactQuill
                                        theme="snow"
                                        value={newBroadcast.content}
                                        onChange={content => setNewBroadcast({ ...newBroadcast, content })}
                                        placeholder="Enter announcement message..."
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="targetAudience">Audience</label>
                                    <select
                                        id="targetAudience"
                                        name="targetAudience"
                                        value={newBroadcast.target_audience}
                                        onChange={e => setNewBroadcast({ ...newBroadcast, target_audience: e.target.value })}
                                    >
                                        <option value="all">All Users</option>
                                        <option value="pro">Pro Only</option>
                                        <option value="free">Free Only</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="expiresIn">Expires In</label>
                                    <select
                                        id="expiresIn"
                                        name="expiresIn"
                                        value={newBroadcast.expires_in_hours}
                                        onChange={e => setNewBroadcast({ ...newBroadcast, expires_in_hours: e.target.value })}
                                    >
                                        <option value="1">1 Hour</option>
                                        <option value="6">6 Hours</option>
                                        <option value="24">24 Hours</option>
                                        <option value="168">7 Days</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="submit-btn" disabled={!newBroadcast.title || !newBroadcast.content || newBroadcast.content === '<p><br></p>'}>
                                    Send Broadcast
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
