import { useState, useEffect } from 'react';
import { API_URL } from '../../lib/api';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    LayoutDashboard,
    Users,
    MessageSquare,
    BarChart3,
    Settings,
    LogOut,
    Menu,
    X,
    Bell,
    Shield,
    History as HistoryIcon,
    Megaphone,
    Bot,
    Monitor
} from 'lucide-react';
import { LanguageSelector } from '../common/LanguageSelector';
import SecureImage from '../common/SecureImage';
import './AdminLayout.css';

interface AdminProfile {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
    role: string;
}

export const AdminLayout = () => {
    const { session, signOut } = useAuth();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [newChatsCount, _setNewChatsCount] = useState(0);

    useEffect(() => {
        fetchAdminProfile();
    }, [session]);

    const fetchAdminProfile = async () => {
        if (!session?.access_token) return;

        try {
            const res = await fetch(`${API_URL}/api/admin/me`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (res.status === 403) {
                // Not an admin, redirect
                navigate('/dashboard');
                return;
            }

            if (res.ok) {
                const data = await res.json();
                setAdminProfile(data);
            }
        } catch (err) {
            console.error('Failed to fetch admin profile:', err);
            navigate('/dashboard');
        }
    };

    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    const navItems = [
        { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
        { to: '/admin/users', icon: Users, label: 'Users' },
        { to: '/admin/chats', icon: MessageSquare, label: 'Support Chats', badge: newChatsCount },
        { to: '/admin/ads', icon: Monitor, label: 'Manage Ads' },
        { to: '/admin/audit-logs', icon: HistoryIcon, label: 'Audit Logs' },
        { to: '/admin/broadcasts', icon: Megaphone, label: 'Broadcasts' },
        { to: '/admin/auto-reply', icon: Bot, label: 'Auto-Reply' },
        { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
        { to: '/admin/settings', icon: Settings, label: 'Settings' },
    ];

    return (
        <div className="admin-layout">
            {/* Sidebar */}
            <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
                <div className="sidebar-header">
                    <div className="logo">
                        <Shield className="logo-icon" />
                        {sidebarOpen && <span>Admin Panel</span>}
                    </div>
                    <button
                        className="toggle-btn"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                    >
                        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                                `nav-item ${isActive ? 'active' : ''}`
                            }
                        >
                            <item.icon size={20} />
                            {sidebarOpen && (
                                <>
                                    <span>{item.label}</span>
                                    {item.badge && item.badge > 0 && (
                                        <span className="badge">{item.badge}</span>
                                    )}
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={20} />
                        {sidebarOpen && <span>Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="admin-main">
                {/* Top Header */}
                <header className="admin-header">
                    <div className="header-left">
                        <h1>Administration</h1>
                    </div>
                    <div className="header-right">
                        <LanguageSelector />
                        <div className="h-6 w-[1px] bg-white/10 mx-2" />
                        <button className="notification-btn">
                            <Bell size={20} />
                            {newChatsCount > 0 && <span className="notif-dot" />}
                        </button>
                        <div className="admin-profile">
                            {adminProfile?.avatar_url ? (
                                <SecureImage src={adminProfile.avatar_url} alt="Admin" fallbackType="profile" />
                            ) : (
                                <div className="avatar-placeholder">
                                    {adminProfile?.username?.[0]?.toUpperCase() || 'A'}
                                </div>
                            )}
                            {sidebarOpen && (
                                <div className="profile-info">
                                    <span className="name">{adminProfile?.full_name || adminProfile?.username}</span>
                                    <span className="role">{adminProfile?.role}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="admin-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
