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
    const [searchParams] = useSearchParams();
    const { activeConversationId, setActiveConversationId } = useChat();
    const { openMobileMenu } = useOutletContext<{ openMobileMenu?: () => void }>() || {};

    useEffect(() => {
        const id = searchParams.get('id');
        if (id) {
            setActiveConversationId(id);
        }
    }, [searchParams, setActiveConversationId]);

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
                        className={`${activeConversationId ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-gray-800 flex-col bg-gray-900 absolute md:relative inset-0 md:inset-auto z-10`}
                    >
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openMobileMenu?.();
                                    }}
                                    className="p-1 -ml-1 text-gray-400 hover:text-white md:hidden mr-1"
                                >
                                    <Menu size={24} />
                                </button>
                                <MessageSquare size={24} className="text-blue-500 hidden sm:block" />
                                Messages
                            </h2>
                            <button
                                onClick={() => setIsNewChatOpen(true)}
                                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                title="New Chat"
                            >
                                <Plus size={20} />
                            </button>
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
