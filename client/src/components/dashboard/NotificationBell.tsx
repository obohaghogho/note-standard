import { useState, useRef, useEffect } from 'react';
import { Bell, Check, ExternalLink, MessageSquare, StickyNote, UserPlus, Globe, Edit3 } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { cn } from '../../utils/cn';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';

export const NotificationBell = () => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const getIcon = (type: string) => {
        switch (type) {
            case 'chat_message': return <MessageSquare size={16} className="text-blue-400" />;
            case 'note_share': return <UserPlus size={16} className="text-green-400" />;
            case 'note_edit': return <Edit3 size={16} className="text-yellow-400" />;
            case 'mention': return <UserPlus size={16} className="text-purple-400" />;
            case 'community_post': return <Globe size={16} className="text-primary" />;
            default: return <StickyNote size={16} className="text-gray-400" />;
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "p-2 rounded-full hover:bg-white/5 transition-all relative group",
                    isOpen ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
                )}
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-black">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 md:w-96 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                        <h3 className="font-bold text-sm">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                                <Check size={12} />
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="p-10 text-center space-y-2">
                                <Bell size={32} className="mx-auto text-gray-600 opacity-20" />
                                <p className="text-gray-500 text-sm">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map((notif) => (
                                <div
                                    key={notif.id}
                                    className={cn(
                                        "p-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors relative flex gap-3",
                                        !notif.is_read && "bg-primary/5"
                                    )}
                                    onClick={() => !notif.is_read && markAsRead(notif.id)}
                                >
                                    <div className="flex-shrink-0 mt-1">
                                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                            {getIcon(notif.type)}
                                        </div>
                                    </div>

                                    <div className="flex-1 space-y-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className={cn(
                                                "text-sm font-semibold truncate",
                                                !notif.is_read ? "text-white" : "text-gray-400"
                                            )}>
                                                {notif.title}
                                            </p>
                                            <span className="text-[10px] text-gray-500 whitespace-nowrap">
                                                {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400 line-clamp-2">
                                            {notif.message}
                                        </p>

                                        {notif.link && (
                                            <Link
                                                to={notif.link}
                                                className="text-[10px] text-primary hover:underline flex items-center gap-1 w-fit mt-2"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsOpen(false);
                                                }}
                                            >
                                                View Details
                                                <ExternalLink size={10} />
                                            </Link>
                                        )}
                                    </div>

                                    {!notif.is_read && (
                                        <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-primary" />
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-3 bg-white/5 border-t border-white/10 text-center">
                        <Link
                            to="/dashboard/notifications"
                            className="text-xs text-gray-400 hover:text-white transition-colors"
                            onClick={() => setIsOpen(false)}
                        >
                            View all notifications
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};
