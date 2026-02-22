import { Bell, Check, ExternalLink, MessageSquare, StickyNote, UserPlus, Globe, Edit3 } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { cn } from '../../utils/cn';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';

export const Notifications = () => {
    const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useNotifications();

    const getIcon = (type: string, size = 20) => {
        switch (type) {
            case 'chat_message': return <MessageSquare size={size} className="text-blue-400" />;
            case 'note_share': return <UserPlus size={size} className="text-green-400" />;
            case 'note_edit': return <Edit3 size={size} className="text-yellow-400" />;
            case 'mention': return <UserPlus size={size} className="text-purple-400" />;
            case 'community_post': return <Globe size={size} className="text-primary" />;
            default: return <StickyNote size={size} className="text-gray-400" />;
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                    <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 md:gap-3">
                        <Bell className="text-primary w-6 h-6 md:w-8 md:h-8" />
                        Notifications
                    </h1>
                    <p className="text-sm md:text-base text-gray-400">Manage your alerts and activities</p>
                </div>
                {unreadCount > 0 && (
                    <Button onClick={markAllAsRead} variant="outline" className="gap-2">
                        <Check size={18} />
                        Mark all as read
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : notifications.length === 0 ? (
                <Card className="p-20 text-center space-y-4" variant="glass">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-gray-600">
                        <Bell size={32} />
                    </div>
                    <div className="space-y-1">
                        <p className="text-xl font-medium">Clear skies!</p>
                        <p className="text-gray-500">You don't have any notifications right now.</p>
                    </div>
                </Card>
            ) : (
                <div className="space-y-3">
                    {notifications.map((notif) => (
                        <Card
                            key={notif.id}
                            className={cn(
                                "p-4 transition-all hover:bg-white/5 relative group cursor-pointer",
                                !notif.is_read ? "border-primary/30 bg-primary/5" : "border-white/5"
                            )}
                            onClick={() => !notif.is_read && markAsRead(notif.id)}
                            variant="glass"
                        >
                            <div className="flex gap-3 md:gap-4">
                                <div className="flex-shrink-0">
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 shadow-sm">
                                        <div className="md:hidden">{getIcon(notif.type, 16)}</div>
                                        <div className="hidden md:block">{getIcon(notif.type, 20)}</div>
                                    </div>
                                </div>

                                <div className="flex-1 space-y-1 min-w-0">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 flex-wrap">
                                        <h3 className={cn(
                                            "text-base md:text-lg font-bold break-words",
                                            !notif.is_read ? "text-white" : "text-gray-400"
                                        )}>
                                            {notif.title}
                                        </h3>
                                        <span className="text-[10px] md:text-xs text-gray-500 whitespace-nowrap">
                                            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                                        </span>
                                    </div>
                                    <p className="text-gray-400 text-sm leading-relaxed break-words">
                                        {notif.message}
                                    </p>

                                    <div className="flex items-center gap-4 pt-3 mt-2 border-t border-white/5 flex-wrap">
                                        {notif.link && (
                                            <Link
                                                to={notif.link}
                                                className="text-xs text-primary font-semibold hover:underline flex items-center gap-1.5"
                                            >
                                                <ExternalLink size={14} />
                                                View Activity
                                            </Link>
                                        )}
                                        {!notif.is_read && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    markAsRead(notif.id);
                                                }}
                                                className="text-xs text-gray-500 hover:text-white flex items-center gap-1.5 transition-colors"
                                            >
                                                <Check size={14} />
                                                Mark as read
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {!notif.is_read && (
                                    <div className="absolute top-2 right-2 md:top-4 md:right-4 w-2 h-2 rounded-full bg-primary animate-pulse" />
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
