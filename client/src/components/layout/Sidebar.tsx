import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    LayoutDashboard,
    Notebook,
    Share2,
    Users,
    Search,
    Activity,
    FileText,
    Settings,
    LogOut,
    Plus,
    Globe,
    MessageSquare,
    Bell,
    Shield,
    BadgeCheck,
    TrendingUp
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../common/Button';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../hooks/useNotifications';
import { AdDisplay } from '../ads/AdDisplay';
import { getStoredAccounts } from '../../utils/accountManager';
import SecureImage from '../common/SecureImage';
import { useMultiAccountNotifications } from '../../hooks/useMultiAccountNotifications';

// Items will be defined inside component to access translation


interface SidebarProps {
    onCreateNote: () => void;
    isOpen?: boolean;
    onClose?: () => void;
}

export const Sidebar = ({ onCreateNote, isOpen = false, onClose }: SidebarProps) => {
    const { t } = useTranslation();
    const { user, signOut, switchAccount, addAccount, isPro, isAdmin } = useAuth();
    const { unreadCount } = useNotifications();
    
    // Accounts for switcher
    const allAccounts = getStoredAccounts();
    const { unreadCounts: backgroundUnreadCounts } = useMultiAccountNotifications();

    const navItems = [
        { icon: LayoutDashboard, label: t('nav.home'), to: '/dashboard' },
        { icon: Notebook, label: t('nav.notes'), to: '/dashboard/notes' },
        { icon: Globe, label: t('nav.feed'), to: '/dashboard/feed' },
        { icon: TrendingUp, label: t('nav.trends'), to: '/dashboard/trends' },
        { icon: MessageSquare, label: t('nav.chat'), to: '/dashboard/chat' },
        { icon: Share2, label: t('nav.shared'), to: '/dashboard/shared' },
        { icon: Users, label: t('nav.teams'), to: '/dashboard/teams' },
        { icon: Activity, label: t('nav.wallet'), to: '/dashboard/activity' },
        { icon: FileText, label: 'Activity Logs', to: '/dashboard/history' },
        { icon: TrendingUp, label: 'Affiliates', to: '/dashboard/affiliates' },
        { icon: Bell, label: t('common.notifications'), to: '/dashboard/notifications' },
        { icon: Search, label: t('nav.search_item'), to: '/dashboard/search' },
    ];

    const bottomNavItems = [
        { icon: FileText, label: t('nav.billing'), to: '/dashboard/billing' },
        { icon: Settings, label: t('common.settings'), to: '/dashboard/settings' },
    ];

    const fullName = user?.user_metadata?.full_name || 'User';
    const email = user?.email || '';
    const initials = fullName
        ? fullName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
        : email.substring(0, 2).toUpperCase();

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                    onClick={onClose}
                />
            )}
            
            <div className={cn(
                "w-64 h-[100dvh] border-r border-white/10 flex flex-col fixed left-0 top-0 z-50 transition-transform duration-300",
                isPro ? "bg-black/40 backdrop-blur-xl" : "bg-[#0a0a0a]",
                isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            )}>
            {/* Header */}
            <div className="h-16 md:h-20 flex items-center px-6 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-white">N</div>
                    <span className="font-bold text-xl tracking-tight">Note Standard</span>
                </div>
            </div>

            {/* Main Nav */}
            <div className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
                <Button className="w-full justify-start gap-2 mb-6" variant="primary" onClick={onCreateNote}>
                    <Plus size={18} />
                    {t('common.new_note')}
                </Button>

                {isAdmin && (
                    <NavLink
                        to="/admin"
                        onClick={onClose}
                        className={() => cn(
                            "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 mb-4 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                        )}
                    >
                        <Shield size={18} />
                        Admin Panel
                    </NavLink>
                )}

                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/dashboard'}
                        onClick={onClose}
                        className={({ isActive }) => cn(
                            "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                            isActive
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "text-gray-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <item.icon size={18} />
                        <span className="flex-1">{item.label}</span>
                        {item.to === '/dashboard/notifications' && unreadCount > 0 && (
                            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </NavLink>
                ))}

                <div className="mt-6 mx-4">
                    <AdDisplay />
                </div>

                <div className="my-4 border-t border-white/10 mx-2" />

                <div className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Account
                </div>

                {bottomNavItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) => cn(
                            "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                            isActive
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "text-gray-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <item.icon size={18} />
                        {item.label}
                    </NavLink>
                ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10">
                {/* Account Switcher Row */}
                {allAccounts.length > 0 && (
                    <div className="flex items-center gap-2 mb-4 px-2 overflow-x-auto no-scrollbar">
                        {allAccounts.map((acc) => {
                            const isActive = acc.id === user?.id;
                            const unread = isActive ? unreadCount : (backgroundUnreadCounts[acc.id] || 0);
                            
                            const initials = acc.full_name
                                .split(' ')
                                .map((n: string) => n[0])
                                .join('')
                                .substring(0, 2)
                                .toUpperCase();

                            return (
                                <button
                                    key={acc.id}
                                    onClick={() => !isActive && switchAccount(acc.id)}
                                    className={cn(
                                        "relative w-8 h-8 rounded-full flex-shrink-0 transition-all duration-300",
                                        isActive 
                                            ? "ring-2 ring-primary ring-offset-2 ring-offset-black scale-110 z-10" 
                                            : "opacity-60 hover:opacity-100 hover:scale-105"
                                    )}
                                    title={acc.full_name}
                                >
                                    {acc.avatar_url ? (
                                        <SecureImage 
                                            src={acc.avatar_url} 
                                            alt={acc.full_name} 
                                            className="w-full h-full rounded-full object-cover"
                                            fallbackType="profile"
                                        />
                                    ) : (
                                        <div className="w-full h-full rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-[10px] font-bold text-white border border-white/10">
                                            {initials}
                                        </div>
                                    )}
                                    
                                    {/* Unread Badge */}
                                    {unread > 0 && (
                                        <div className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 rounded-full border border-black flex items-center justify-center px-0.5 z-20 shadow-sm animate-pulse">
                                            <span className="text-[8px] font-bold text-white leading-none">
                                                {unread > 9 ? '9+' : unread}
                                            </span>
                                        </div>
                                    )}

                                    {isActive && (
                                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-black rounded-full" />
                                    )}
                                </button>
                            );
                        })}
                        
                        {/* Add Account Button */}
                        <button 
                            onClick={addAccount}
                            className="w-8 h-8 rounded-full border border-dashed border-white/20 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/40 transition-all flex-shrink-0"
                            title="Add Account"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer mb-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                            <div className="text-sm font-medium text-white truncate">{fullName}</div>
                            {isPro && <BadgeCheck size={14} className="text-blue-400 fill-blue-400/10" />}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{email}</div>
                    </div>
                </div>

                <button
                    onClick={() => signOut()}
                    className="flex items-center gap-2 w-full px-2 py-2 text-sm text-gray-400 hover:text-red-400 transition-colors"
                >
                    <LogOut size={16} />
                    {t('common.logout')}
                </button>
            </div>
        </div>
        </>
    );
};
