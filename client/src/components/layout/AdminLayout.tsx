import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../../lib/api';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
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
    Target,
    Home,
    Zap,
    ShieldAlert,
    ArrowDownToLine,
    ArrowUpFromLine,
    ArrowLeft,
    Wallet,
    Coins,
    Landmark,
    Activity,
    Sparkles,
    ShieldCheck
} from 'lucide-react';

import { LanguageSelector } from '../common/LanguageSelector';
import SecureImage from '../common/SecureImage';
import OfflineBanner from '../common/OfflineBanner';
import { preloadRoute, preloadCoreAdminRoutes } from '../../utils/routePreloader';
import './AdminLayout.css';

interface AdminProfile {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
    role: string;
}

export const AdminLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
    const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
    const [newChatsCount] = useState(0);
    const [chatActive, setChatActive] = useState(false);
    const touchStartX = useRef<number | null>(null);

    const { session, profile, user, signOut } = useAuth();
    const isFincraDemoUser = profile?.role === 'fincra_demo' || user?.email === 'fincra-demo@notestandard.com' || (typeof window !== 'undefined' && sessionStorage.getItem('notestandard_fincra_demo_session') === 'true');

    const fetchAdminProfile = useCallback(async () => {
        if (isFincraDemoUser) {
            setAdminProfile({
                id: 'USR-DEMO-FINCRA-8821',
                username: 'fincra-demo',
                full_name: 'Fincra Compliance Reviewer',
                avatar_url: '',
                role: 'fincra_demo'
            });
            if (location.pathname === '/admin' || location.pathname === '/admin/') {
                navigate('/admin/compliance-demo', { replace: true });
            }
            return;
        }

        if (!session?.access_token) return;

        try {
            const res = await fetch(`${API_URL}/api/admin/me`, {
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`,
                    'Accept': 'application/json'
                }
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
    }, [session?.access_token, isFincraDemoUser, location.pathname, navigate]);

    useEffect(() => {
        fetchAdminProfile();
        if (!isFincraDemoUser) {
            preloadCoreAdminRoutes();
        }
    }, [session, fetchAdminProfile, isFincraDemoUser]);

    // Auto-close sidebar on route navigation on mobile viewports
    useEffect(() => {
        if (window.innerWidth < 1024) {
            setSidebarOpen(false);
        }
    }, [location.pathname]);

    useEffect(() => {
        const handleChatActive = (e: any) => setChatActive(e.detail);
        window.addEventListener('admin-chat-active', handleChatActive);
        return () => window.removeEventListener('admin-chat-active', handleChatActive);
    }, []);

    // Touch swipe gesture handling for mobile drawer
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const currentX = e.touches[0].clientX;
        const diffX = currentX - touchStartX.current;
        // Swipe left to close sidebar
        if (diffX < -60 && sidebarOpen && window.innerWidth < 1024) {
            setSidebarOpen(false);
            touchStartX.current = null;
        }
    };

    const handleLogout = async () => {
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('notestandard_fincra_demo_session');
        }
        await signOut();
        navigate('/login');
    };

    const allNavItems = [
        { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
        { to: '/admin/beta-feedback', icon: Sparkles, label: 'Beta Feedback' },
        { to: '/admin/users', icon: Users, label: 'Users' },
        { to: '/admin/crypto-treasury', icon: Coins, label: 'Crypto Treasury' },
        { to: '/admin/payment-capabilities', icon: Landmark, label: 'Payment Rails' },
        { to: '/admin/collection-accounts', icon: Landmark, label: 'Collection Accounts' },
        { to: '/admin/deposit-monitoring', icon: Activity, label: 'Deposit Monitoring' },
        { to: '/admin/chats', icon: MessageSquare, label: 'Support Chats', badge: newChatsCount },
        { to: '/admin/ads', icon: Target, label: 'Manage Ads' },
        { to: '/admin/audit-logs', icon: HistoryIcon, label: 'Audit Logs' },
        { to: '/admin/reconciliation', icon: ShieldAlert, label: 'NFI Control' },
        { to: '/admin/push-health', icon: Bell, label: 'Push & Coverage' },
        { to: '/admin/communication-health', icon: Activity, label: 'Comm Health' },
        { to: '/admin/fincra', icon: Wallet, label: 'Fincra Audit' },
        { to: '/admin/compliance-demo', icon: ShieldCheck, label: 'Compliance Demo' },
        { to: '/admin/broadcasts', icon: Megaphone, label: 'Broadcasts' },
        { to: '/admin/limit-requests', icon: Zap, label: 'Limit Requests' },
        { to: '/admin/deposits', icon: ArrowDownToLine, label: 'Manual Deposits' },
        { to: '/admin/withdrawals', icon: ArrowUpFromLine, label: 'Manual Withdrawals' },
        { to: '/admin/auto-reply', icon: Bot, label: 'Auto-Reply' },
        { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
        { to: '/admin/settings', icon: Settings, label: 'Settings' },
    ];

    const navItems = isFincraDemoUser
        ? allNavItems.filter(item => item.to === '/admin/compliance-demo')
        : allNavItems;


    return (
        <div className="admin-layout" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove}>
            {/* Sidebar */}
            <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
                <div className="sidebar-header">
                    <div className="logo">
                        <Shield className="logo-icon" />
                        {sidebarOpen && <span>Admin Panel</span>}
                    </div>
                    <button
                        className="toggle-btn min-h-[44px] min-w-[44px] flex items-center justify-center"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        aria-label="Toggle navigation menu"
                    >
                        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>

                <nav className="sidebar-nav">
                    <NavLink
                        to="/dashboard"
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        style={{ 
                            marginBottom: '1rem',
                            background: 'rgba(56, 189, 248, 0.1)', 
                            color: '#38bdf8', 
                            border: '1px solid rgba(56, 189, 248, 0.2)' 
                        }}
                    >
                        <Home size={20} />
                        {sidebarOpen && <span>User Dashboard</span>}
                    </NavLink>

                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            onMouseEnter={() => preloadRoute(item.to)}
                            onPointerDown={() => preloadRoute(item.to)}
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
                    <button className="logout-btn min-h-[44px]" onClick={handleLogout}>
                        <LogOut size={20} />
                        {sidebarOpen && <span>Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="admin-main">
                <OfflineBanner />

                {/* Top Header */}
                <header className="admin-header">
                    <div className="header-left">
                        {chatActive ? (
                            <button 
                                className="mobile-toggle-btn min-h-[44px] min-w-[44px] flex items-center justify-center"
                                onClick={() => window.dispatchEvent(new CustomEvent('admin-chat-back'))}
                                aria-label="Go back"
                            >
                                <ArrowLeft size={20} />
                            </button>
                        ) : (
                            <button 
                                className="mobile-toggle-btn min-h-[44px] min-w-[44px] flex items-center justify-center"
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                aria-label="Toggle drawer menu"
                            >
                                {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                            </button>
                        )}
                        <h1 className={chatActive ? 'mobile-hidden-title' : ''}>Administration</h1>
                    </div>
                    <div className="header-right">
                        <div className="desktop-only-lang">
                            <LanguageSelector />
                        </div>
                        <div className="h-6 w-[1px] bg-white/10 mx-1 md:mx-2 desktop-only-lang" />
                        <button className="notification-btn min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Notifications">
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
                <main className={`admin-content ${location.pathname.startsWith('/admin/chats') ? 'chat-page-layout' : ''}`}>
                    <Outlet key={location.pathname} />
                </main>

                {/* Mobile Overlay */}
                {sidebarOpen && (
                    <div 
                        className="sidebar-overlay" 
                        onClick={() => setSidebarOpen(false)}
                    />
                )}
            </div>
        </div>
    );
};

