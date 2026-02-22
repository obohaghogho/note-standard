import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    LayoutDashboard,
    Notebook,
    Share2,
    Users,
    Search,
    Wallet,
    Receipt,
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
import { AdDisplay } from '../ads/AdDisplay';

// Items will be defined inside component to access translation


interface SidebarProps {
    onCreateNote: () => void;
    isOpen?: boolean;
    onClose?: () => void;
}

export const Sidebar = ({ onCreateNote, isOpen = false, onClose }: SidebarProps) => {
    const { t } = useTranslation();
    const { user, signOut, isPro, isAdmin } = useAuth();

    const navItems = [
        { icon: LayoutDashboard, label: t('nav.home'), to: '/dashboard' },
        { icon: Notebook, label: t('nav.notes'), to: '/dashboard/notes' },
        { icon: Globe, label: t('nav.feed'), to: '/dashboard/feed' },
        { icon: TrendingUp, label: t('nav.trends'), to: '/dashboard/trends' },
        { icon: MessageSquare, label: t('nav.chat'), to: '/dashboard/chat' },
        { icon: Share2, label: t('nav.shared'), to: '/dashboard/shared' },
        { icon: Users, label: t('nav.teams'), to: '/dashboard/teams' },
        { icon: Wallet, label: t('nav.wallet'), to: '/dashboard/wallet' },
        { icon: TrendingUp, label: 'Affiliates', to: '/dashboard/affiliates' },
        { icon: Bell, label: t('common.notifications'), to: '/dashboard/notifications' },
        { icon: Search, label: t('nav.search_item'), to: '/dashboard/search' },
    ];

    const bottomNavItems = [
        { icon: Receipt, label: t('nav.billing'), to: '/dashboard/billing' },
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
                        {item.label}
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
