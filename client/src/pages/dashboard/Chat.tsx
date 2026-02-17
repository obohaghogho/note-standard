import React, { useState, useEffect } from 'react';
import ChatWindow from '../../components/chat/ChatWindow';
import ConversationList from '../../components/chat/ConversationList';
import NewChatModal from '../../components/chat/NewChatModal';
import { Plus, MessageSquare } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useChat } from '../../context/ChatContext';

export const Chat: React.FC = () => {
    const [isNewChatOpen, setIsNewChatOpen] = useState(false);
    const [searchParams] = useSearchParams();
    const { setActiveConversationId } = useChat();

    useEffect(() => {
        const id = searchParams.get('id');
        if (id) {
            setActiveConversationId(id);
        }
    }, [searchParams, setActiveConversationId]);

    return (
        <div className="flex h-full bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
            {/* Sidebar */}
            <div className="w-80 border-r border-gray-800 flex flex-col bg-gray-900">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <MessageSquare size={24} className="text-blue-500" />
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

                <ConversationList />
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0">
                <ChatWindow />
            </div>

            <NewChatModal isOpen={isNewChatOpen} onClose={() => setIsNewChatOpen(false)} />
        </div>
    );
};
