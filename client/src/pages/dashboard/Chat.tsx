import React, { useState, useEffect } from 'react';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import ChatWindow from '../../components/chat/ChatWindow';
import ConversationList from '../../components/chat/ConversationList';
import NewChatModal from '../../components/chat/NewChatModal';
import { Plus, MessageSquare, Menu } from 'lucide-react';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { useChat } from '../../context/ChatContext';
import { motion, AnimatePresence } from 'framer-motion';

function ChatContent() {
    const [isNewChatOpen, setIsNewChatOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const { activeConversationId, setActiveConversationId, startConversation } = useChat();
    const { openMobileMenu } = useOutletContext<{ openMobileMenu?: () => void }>() || {};

    useEffect(() => {
        const id = searchParams.get('id');
        const username = searchParams.get('username');

        if (id) {
            setActiveConversationId(id);
        } else if (username) {
            const initiateChat = async () => {
                try {
                    await startConversation(username);
                    // Clear the username param but keep the ID once it's set by startConversation
                    const newParams = new URLSearchParams(searchParams);
                    newParams.delete('username');
                    setSearchParams(newParams, { replace: true });
                } catch (err) {
                    console.error('Failed to auto-start chat:', err);
                }
            };
            initiateChat();
        }
    }, [searchParams, setActiveConversationId, startConversation, setSearchParams]);

    return (
        <div className="flex h-full bg-gray-950 shadow-none rounded-none md:border md:border-gray-800 md:rounded-2xl overflow-hidden md:shadow-2xl relative">
            <AnimatePresence mode="wait" initial={false}>
                {/* Sidebar - Visible on large screens, or on mobile when no conversation is active */}
                {(!activeConversationId || window.innerWidth >= 768) && (
                    <motion.div 
                        key="sidebar"
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -20, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={`${activeConversationId ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-gray-800 flex-col bg-gray-950 absolute md:relative inset-0 md:inset-auto z-10`}
                    >
                        {/* Header with Safe Area Handling */}
                        <div className="pt-safe flex-shrink-0 bg-gray-950/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-20">
                            <div className="p-4 md:p-5 flex justify-between items-center">
                                <h2 className="text-xl md:text-2xl font-extrabold text-white flex items-center gap-3 tracking-tight">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openMobileMenu?.();
                                        }}
                                        className="p-2 -ml-2 text-gray-400 hover:text-white md:hidden transition-colors active:scale-90"
                                    >
                                        <Menu size={24} />
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <MessageSquare size={22} className="text-blue-500 hidden sm:block" />
                                        Messages
                                    </div>
                                </h2>
                                <button
                                    onClick={() => setIsNewChatOpen(true)}
                                    className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                                    title="New Chat"
                                >
                                    <Plus size={22} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden">
                            <ConversationList />
                        </div>
                    </motion.div>
                )}

                {/* Main Area - Visible on large screens, or on mobile when a conversation is active */}
                {(activeConversationId || window.innerWidth >= 768) && (
                    <motion.div 
                        key="chat"
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 20, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={`${activeConversationId ? 'flex' : 'hidden md:flex'} flex-1 flex flex-col min-w-0 relative z-20 h-full`}
                    >
                        <ChatWindow />
                    </motion.div>
                )}
            </AnimatePresence>

            <NewChatModal isOpen={isNewChatOpen} onClose={() => setIsNewChatOpen(false)} />
        </div>
    );
}

export default function Chat() {
    return (
        <ErrorBoundary fallback={<div className="p-8 text-center text-red-500 bg-red-500/5 rounded-xl border border-red-500/10">Something went wrong loading chat. <button onClick={() => window.location.reload()} className="underline ml-2">Try again</button></div>}>
            <ChatContent />
        </ErrorBoundary>
    );
}
