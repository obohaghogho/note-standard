import { useState, useEffect } from 'react';
import {
    Settings,
    Shield,
    Bot,
    Server,
    Database,
    Lock,
    Save,
    RefreshCcw,
    ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../lib/api';
import { toast } from 'react-hot-toast';
import './AdminSettings.css';

interface SystemSettings {
    system_name: string;
    maintenance_mode: boolean;
    registration_status: string;
    admin_2fa_enabled: boolean;
}

export const AdminSettings = () => {
    const { session } = useAuth();
    const [settings, setSettings] = useState<SystemSettings>({
        system_name: 'Note Standard Admin',
        maintenance_mode: false,
        registration_status: 'public',
        admin_2fa_enabled: true
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, [session]);

    const fetchSettings = async () => {
        if (!session?.access_token) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/admin/settings`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSettings({
                    system_name: data.system_name,
                    maintenance_mode: data.maintenance_mode,
                    registration_status: data.registration_status,
                    admin_2fa_enabled: data.admin_2fa_enabled
                });
            }
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!session?.access_token) return;
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/api/admin/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(settings)
            });

            if (res.ok) {
                toast.success('System settings updated');
            } else {
                throw new Error('Failed to update');
            }
        } catch (err) {
            console.error(err);
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center py-20"><RefreshCcw className="animate-spin text-primary" /></div>;
    }

    return (
        <div className="admin-settings-page">
            <div className="settings-header">
                <div className="header-info">
                    <h2>System Settings</h2>
                    <p>Global configuration and security controls</p>
                </div>
                <button
                    className={`save-btn ${saving ? 'saving' : ''}`}
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? <RefreshCcw className="spinner" size={18} /> : <Save size={18} />}
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            <div className="settings-container">
                {/* General Settings */}
                <section className="settings-section">
                    <div className="section-header">
                        <Settings size={20} />
                        <h3>General Configuration</h3>
                    </div>
                    <div className="section-content">
                        <div className="input-group">
                            <label htmlFor="systemName">System Name</label>
                            <input 
                                id="systemName" 
                                name="systemName"
                                type="text" 
                                value={settings.system_name} 
                                onChange={(e) => setSettings(prev => ({ ...prev, system_name: e.target.value }))}
                                autoComplete="organization"
                            />
                        </div>
                        <div className="input-group">
                            <label htmlFor="maintenance">Maintenance Mode</label>
                            <div className="toggle-switch">
                                <input 
                                    type="checkbox" 
                                    id="maintenance" 
                                    name="maintenance"
                                    checked={settings.maintenance_mode}
                                    onChange={(e) => setSettings(prev => ({ ...prev, maintenance_mode: e.target.checked }))}
                                    autoComplete="off"
                                />
                                <label htmlFor="maintenance"></label>
                                <span className="toggle-status">{settings.maintenance_mode ? 'Enabled' : 'Disabled'}</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Security Settings */}
                <section className="settings-section">
                    <div className="section-header">
                        <Shield size={20} />
                        <h3>Security & Access</h3>
                    </div>
                    <div className="section-content">
                        <div className="input-group">
                            <label htmlFor="regStatus">Registration Status</label>
                            <select 
                                id="regStatus" 
                                name="regStatus"
                                value={settings.registration_status}
                                onChange={(e) => setSettings(prev => ({ ...prev, registration_status: e.target.value }))}
                            >
                                <option value="public">Public (Anyone can join)</option>
                                <option value="invite">Invite Only</option>
                                <option value="closed">Closed</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <span id="label-2fa" className="text-sm font-medium text-gray-400 mb-1 block">Admin 2FA</span>
                            <div className={`status-badge ${settings.admin_2fa_enabled ? 'secure' : 'warning'}`}>
                                {settings.admin_2fa_enabled ? 'Enabled' : 'Disabled'}
                            </div>
                            <button 
                                type="button"
                                aria-labelledby="label-2fa"
                                className="text-xs text-primary hover:underline mt-1 bg-transparent border-none p-0"
                                onClick={() => setSettings(prev => ({ ...prev, admin_2fa_enabled: !prev.admin_2fa_enabled }))}
                            >
                                Toggle 2FA Requirement
                            </button>
                        </div>
                    </div>
                </section>

                {/* Quick Shortcuts */}
                <div className="shortcuts-grid">
                    <a href="/admin/auto-reply" className="shortcut-card">
                        <div className="shortcut-icon bot">
                            <Bot size={24} />
                        </div>
                        <div className="shortcut-info">
                            <h4>Auto-Reply Config</h4>
                            <p>Manage support bot behavior</p>
                        </div>
                        <ExternalLink size={16} className="arrow" />
                    </a>

                    <div className="shortcut-card disabled">
                        <div className="shortcut-icon backup">
                            <Database size={24} />
                        </div>
                        <div className="shortcut-info">
                            <h4>Database Backups</h4>
                            <p>Configure automated backups</p>
                        </div>
                        <Lock size={16} className="lock" />
                    </div>
                </div>

                {/* Infrastructure Info */}
                <section className="settings-section info">
                    <div className="section-header">
                        <Server size={20} />
                        <h3>Infrastructure</h3>
                    </div>
                    <div className="info-grid">
                        <div className="info-item">
                            <span>API Version</span>
                            <strong>v1.4.2-stable</strong>
                        </div>
                        <div className="info-item">
                            <span>Environment</span>
                            <strong>Production</strong>
                        </div>
                        <div className="info-item">
                            <span>Region</span>
                            <strong>us-east-1</strong>
                        </div>
                        <div className="info-item">
                            <span>Uptime</span>
                            <strong>99.98%</strong>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};
