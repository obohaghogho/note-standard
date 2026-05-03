import React from 'react';
import { motion } from 'framer-motion';
import { X, MessageSquare, Bell, Info } from 'lucide-react';

export interface NotificationToastData {
    id: string;
    title: string;
    message?: string;
    type?: string;
    count?: number;
    link?: string;
    sender?: {
        username: string;
        avatar_url?: string;
    };
}

interface NotificationToastProps {
    notification: NotificationToastData;
    onDismiss: () => void;
    onClick: () => void;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ notification, onDismiss, onClick }) => {
    // Determine icon based on type
    const renderIcon = () => {
        if (notification.type === 'chat_message' || notification.type === 'message') {
            return <MessageSquare className="w-5 h-5 text-emerald-500" />;
        }
        if (notification.type === 'info') {
            return <Info className="w-5 h-5 text-blue-500" />;
        }
        return <Bell className="w-5 h-5 text-primary" />;
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -100, scale: 0.9, transition: { duration: 0.2 } }}
            drag
            dragConstraints={{ top: -100, bottom: 50, left: -200, right: 200 }}
            onDragEnd={(_, info) => {
                // Dismiss if swiped up, far left, or far right
                if (info.offset.y < -30 || Math.abs(info.offset.x) > 100) {
                    onDismiss();
                }
            }}
            whileTap={{ scale: 0.98 }}
            className="fixed top-2 sm:top-4 left-0 right-0 z-[9999] flex justify-center px-4 pointer-events-none"
        >
            <div 
                className="pointer-events-auto max-w-sm w-full bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden cursor-pointer active:cursor-grabbing"
                onClick={onClick}
            >
                <div className="p-3 flex items-center gap-3">
                    {notification.sender?.avatar_url ? (
                        <img 
                            src={notification.sender.avatar_url} 
                            alt={notification.sender.username} 
                            className="w-10 h-10 rounded-full object-cover border border-white/10"
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
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                            {notification.message}
                        </p>
                    </div>

                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onDismiss();
                        }}
                        className="p-2 hover:bg-white/5 rounded-full transition-colors group"
                    >
                        <X className="w-4 h-4 text-gray-500 group-hover:text-white" />
                    </button>
                </div>
                
                {/* Subtle visual indicator that it's swipable */}
                <div className="h-[2px] w-8 bg-white/10 rounded-full mx-auto mb-1" />
            </div>
        </motion.div>
    );
};

export default NotificationToast;
