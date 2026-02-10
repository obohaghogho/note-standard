import { useState, useEffect } from 'react';
import { Bot, Save, Clock, Globe, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../lib/api';
import './AutoReplySettings.css';

interface Settings {
    id?: string;
    enabled: boolean;
    message: string;
    start_hour: string;
    end_hour: string;
    timezone: string;
}

// Helper to ensure time is HH:mm format
// Helper to ensure time is HH:mm format
const normalizeTime = (time: string | number | undefined | null) => {
    if (time === undefined || time === null || time === '') return '00:00';
    
    // Convert numbers to string safe
    const timeStr = time.toString();

    // Handle "9" or "18" -> "09:00", "18:00"
    if (!timeStr.includes(':')) {
        return `${timeStr.padStart(2, '0')}:00`;
    }
    // Handle "9:30" -> "09:30"
    const [h, m] = timeStr.split(':');
    return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
};

export const AutoReplySettings = () => {
    const { session } = useAuth();
    const [settings, setSettings] = useState<Settings>({
        enabled: false,
        message: '',
        start_hour: '18:00',
        end_hour: '09:00',
        timezone: 'UTC'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    useEffect(() => {
        fetchSettings();
    }, [session]);

    const fetchSettings = async () => {
        if (!session?.access_token) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/admin/auto-reply`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSettings({
                    ...data,
                    start_hour: normalizeTime(data.start_hour),
                    end_hour: normalizeTime(data.end_hour)
                });
            }
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!session?.access_token) return;
        setSaving(true);
        setStatus(null);

        try {
            const res = await fetch(`${API_URL}/api/admin/auto-reply`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(settings)
            });

            if (res.ok) {
                const data = await res.json();
                setSettings(data);
                setStatus({ type: 'success', msg: 'Settings updated successfully' });
            } else {
                throw new Error('Failed to update');
            }
        } catch (err) {
            setStatus({ type: 'error', msg: 'Failed to save settings' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="loading-state">Loading settings...</div>;

    return (
        <div className="autoreply-settings">
            <div className="page-header">
                <div className="header-title">
                    <Bot className="header-icon" />
                    <div>
                        <h2>AI Auto-Reply Settings</h2>
                        <p>Configure automated responses for offline hours</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSave} className="settings-form">
                <div className="settings-section">
                    <div className="section-header">
                        <ShieldAlert size={20} />
                        <h3>Status & Message</h3>
                    </div>

                    <div className="form-group toggle">
                        <label className="toggle-label" htmlFor="enableAutoReply">
                            <span>Enable Auto-Reply</span>
                            <div className="toggle-switch">
                                <input 
                                    type="checkbox" 
                                    id="enableAutoReply" 
                                    name="enabled"
                                    checked={settings.enabled}
                                    onChange={(e) => setSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                                />
                                <div className="slider" />
                            </div>
                        </label>
                    </div>

                    <div className="form-group">
                        <label htmlFor="offlineMessage">Offline Message</label>
                        <textarea
                            id="offlineMessage"
                            name="offlineMessage"
                            value={settings.message}
                            onChange={(e) => setSettings(prev => ({ ...prev, message: e.target.value }))}
                            placeholder="Thank you for contacting us. We are currently offline..."
                            rows={4}
                            required
                        />
                        <p className="hint">This message will be sent automatically to users who contact support during offline hours.</p>
                    </div>
                </div>

                <div className="settings-section">
                    <div className="section-header">
                        <Clock size={20} />
                        <h3>Offline Schedule</h3>
                    </div>

                    <div className="time-grid">
                        <div className="form-group">
                            <label htmlFor="startHour">Start Hour (Offline)</label>
                            <input
                                id="startHour"
                                name="startHour"
                                type="time"
                                value={settings.start_hour}
                                onChange={(e) => setSettings(prev => ({ ...prev, start_hour: e.target.value }))}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="endHour">End Hour (Offline)</label>
                            <input
                                id="endHour"
                                name="endHour"
                                type="time"
                                value={settings.end_hour}
                                onChange={(e) => setSettings(prev => ({ ...prev, end_hour: e.target.value }))}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="timezone">Timezone</label>
                            <div className="select-with-icon">
                                <Globe size={18} />
                                <select
                                    id="timezone"
                                    name="timezone"
                                    value={settings.timezone}
                                    onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
                                >
                                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                                    <option value="GMT">GMT (Greenwich Mean Time)</option>
                                    <option value="EST">EST (Eastern Standard Time)</option>
                                    <option value="PST">PST (Pacific Standard Time)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {status && (
                    <div className={`status-banner ${status.type}`}>
                        {status.msg}
                    </div>
                )}

                <button type="submit" className="save-btn" disabled={saving}>
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </form>
        </div>
    );
};
