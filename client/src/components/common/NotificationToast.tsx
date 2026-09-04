import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageSquare, Bell, Info, Send, CornerDownLeft, Check } from 'lucide-react';

export interface NotificationToastData {
    id: string;
    title: string;
    message?: string;
    type?: string;
    count?: number;
    link?: string;
    conversationId?: string;
    sender?: {
        username: string;
        avatar_url?: string;
    };
}

interface NotificationToastProps {
    notification: NotificationToastData;
    onDismiss: () => void;
    onClick: () => void;
    onQuickReply?: (conversationId: string, text: string) => Promise<void>;
    onInteractChange?: (isInteracting: boolean) => void;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ 
    notification, 
    onDismiss, 
    onClick,
    onQuickReply,
    onInteractChange 
}) => {
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [sentSuccess, setSentSuccess] = useState(false);

    const isChatNotif = 
        notification.type === 'chat_message' || 
        notification.type === 'message' || 
        notification.type === 'chat_request' || 
        notification.type === 'chat_accepted' ||
        !!notification.conversationId ||
        (notification.link && notification.link.includes('/chat'));

    const convId = notification.conversationId || ((): string | undefined => {
        if (!notification.link) return undefined;
        const match = notification.link.match(/[?&](?:id|conversationId)=([^&]+)/);
        return match ? match[1] : undefined;
    })();

    // Determine icon based on type
    const renderIcon = () => {
        if (isChatNotif) {
            return <MessageSquare className="w-5 h-5 text-emerald-500" />;
        }
        if (notification.type === 'info') {
            return <Info className="w-5 h-5 text-blue-500" />;
        }
        return <Bell className="w-5 h-5 text-primary" />;
    };

    const handleStartReply = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsReplying(true);
        onInteractChange?.(true);
    };

    const handleCancelReply = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setIsReplying(false);
        setReplyText('');
        onInteractChange?.(false);
    };

    const handleSendReply = async (e: React.FormEvent | React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (!replyText.trim() || !convId || isSending) return;

        setIsSending(true);
        try {
            if (onQuickReply) {
                await onQuickReply(convId, replyText.trim());
            }
            setSentSuccess(true);
            setTimeout(() => {
                onDismiss();
            }, 1200);
        } catch (err) {
            console.error('[NotificationToast] Quick reply failed:', err);
            setIsSending(false);
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -100, scale: 0.9, transition: { duration: 0.2 } }}
            drag={!isReplying}
            dragConstraints={{ top: -100, bottom: 50, left: -200, right: 200 }}
            onDragEnd={(_, info) => {
                if (!isReplying && (info.offset.y < -30 || Math.abs(info.offset.x) > 100)) {
                    onDismiss();
                }
            }}
            whileTap={isReplying ? {} : { scale: 0.98 }}
            className="fixed top-2 sm:top-4 left-0 right-0 z-[9999] flex justify-center px-4 pointer-events-none"
        >
            <div 
                className="pointer-events-auto max-w-sm w-full bg-[#1a1a1a]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden cursor-pointer transition-all duration-300"
                onClick={isReplying ? undefined : onClick}
            >
                <div className="p-3.5 flex items-center gap-3">
                    {notification.sender?.avatar_url ? (
                        <img 
                            src={notification.sender.avatar_url} 
                            alt={notification.sender.username} 
                            className="w-10 h-10 rounded-full object-cover border border-white/10 flex-shrink-0"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10">
                            {renderIcon()}
                        </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white truncate">
                                {notification.count && notification.count > 1 
                                    ? `${notification.count} new messages from ${notification.sender?.username || notification.title}`
                                    : notification.title}
                            </h3>
                            {notification.count && notification.count > 1 && (
                                <span className="bg-emerald-500 text-black text-[10px] font-black px-1.5 rounded-full">
                                    +{notification.count - 1}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-300 truncate mt-0.5">
                            {notification.message}
                        </p>
                    </div>

                    <div className="flex items-center gap-1">
                        {isChatNotif && convId && !isReplying && !sentSuccess && (
                            <button
                                type="button"
                                onClick={handleStartReply}
                                className="px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-400 hover:text-blue-300 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all active:scale-95 flex-shrink-0"
                                title="Quick Reply"
                            >
                                <CornerDownLeft size={13} />
                                <span>Reply</span>
                            </button>
                        )}

                        <button 
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDismiss();
                            }}
                            className="p-1.5 hover:bg-white/10 rounded-full transition-colors group flex-shrink-0"
                        >
                            <X className="w-4 h-4 text-gray-400 group-hover:text-white" />
                        </button>
                    </div>
                </div>

                {/* Inline Quick Reply Expandable Box */}
                <AnimatePresence>
                    {isReplying && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="px-3.5 pb-3.5 pt-1 border-t border-white/10 bg-black/40"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {sentSuccess ? (
                                <div className="flex items-center justify-center gap-2 py-2 text-emerald-400 text-xs font-bold animate-in fade-in zoom-in-95 duration-200">
                                    <Check size={16} strokeWidth={3} />
                                    <span>Reply Sent Successfully!</span>
                                </div>
                            ) : (
                                <form onSubmit={handleSendReply} className="flex items-center gap-2">
                                    <input 
                                        type="text"
                                        autoFocus
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        placeholder={`Reply to ${notification.sender?.username || 'message'}...`}
                                        className="flex-1 bg-white/10 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-blue-500/60 transition-all"
                                        disabled={isSending}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!replyText.trim() || isSending}
                                        className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white flex items-center justify-center transition-all shadow-md shadow-blue-900/40 active:scale-95 flex-shrink-0"
                                    >
                                        <Send size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCancelReply}
                                        className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 text-xs font-medium"
                                    >
                                        Cancel
                                    </button>
                                </form>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
                
                {/* Subtle visual drag indicator */}
                <div className="h-[2px] w-8 bg-white/10 rounded-full mx-auto mb-1" />
            </div>
        </motion.div>
    );
};

export default NotificationToast;
