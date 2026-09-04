import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  Wallet, 
  MessageSquare, 
  Globe, 
  Notebook,
  Settings
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useChat } from '../../context/ChatContext';

export const MobileBottomNav: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { conversations } = useChat();

  const unreadChatCount = (conversations || []).reduce((sum, conv) => {
    const count = conv.unreadCount ?? (conv as any).unread_count ?? 0;
    return sum + (typeof count === 'number' ? count : 0);
  }, 0);

  // Hide bottom nav on active chat view on mobile to maximize chat window
  const isChatViewActive = location.pathname.startsWith('/dashboard/chat/') && location.pathname !== '/dashboard/chat';
  if (isChatViewActive) return null;

  const items = [
    { id: 'home', label: t('nav.home', 'Home'), icon: LayoutDashboard, to: '/dashboard' },
    { id: 'notes', label: t('nav.notes', 'Notes'), icon: Notebook, to: '/dashboard/notes' },
    { id: 'wallet', label: t('nav.wallet', 'Wallet'), icon: Wallet, to: '/dashboard/wallet' },
    { id: 'chat', label: t('nav.chat', 'Chat'), icon: MessageSquare, to: '/dashboard/chat', badge: unreadChatCount },
    { id: 'feed', label: t('nav.feed', 'Feed'), icon: Globe, to: '/dashboard/feed' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-gray-950/90 backdrop-blur-xl border-t border-white/10 pb-safe shadow-2xl">
      <div className="flex items-center justify-around h-16 px-1 max-w-md mx-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.to === '/dashboard'
            ? location.pathname === '/dashboard'
            : location.pathname.startsWith(item.to);

          return (
            <button
              key={item.id}
              onClick={() => navigate(item.to)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 min-h-[44px] min-w-[44px] py-1 transition-all duration-200 relative rounded-xl",
                isActive 
                  ? "text-primary font-bold" 
                  : "text-gray-400 hover:text-gray-200 active:scale-95"
              )}
            >
              <div className="relative">
                <Icon size={20} className={cn("transition-transform duration-200", isActive && "scale-110")} />
                {Boolean(item.badge && item.badge > 0) && (
                  <span className="absolute -top-1 -right-2 bg-rose-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center border border-gray-950">
                    {item.badge! > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-1 truncate max-w-[64px]">
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-1 w-1 h-1 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
