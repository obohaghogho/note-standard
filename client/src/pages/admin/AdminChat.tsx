import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { NotificationService } from '../../services/NotificationService';
import { ExportButton } from '../../components/chat/ExportButton';
import {
    MessageSquare,
    Send,
    CheckCheck,
    Search
} from 'lucide-react';
import SecureImage from '../../components/common/SecureImage';
import './AdminChat.css';

interface Message {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    created_at: string;
    type: string;
    sentiment?: {
        label: 'positive' | 'negative' | 'neutral';
        score: number;
    };
}

interface Conversation {
    id: string;
    name: string;
    support_status: 'open' | 'pending' | 'resolved';
    lastMessage?: {
        content: string;
        created_at: string;
        sender_id: string;
    };
    members: {
        user_id: string;
        role: string;
        profile: {
            username: string;
            email: string;
            avatar_url: string;
            is_online: boolean;
        };
    }[];
}

export const AdminChat = () => {
    const { session, user, isAdmin } = useAuth();
    const { socket, connected } = useSocket();
    
    // State
    const [chats, setChats] = useState<Conversation[]>([]);
    const [activeChat, setActiveChat] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [activeAdmins, setActiveAdmins] = useState<Record<string, string[]>>({});
    const [typingUsers] = useState<Record<string, boolean>>({});
    
    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Register Admin Listeners
    useEffect(() => {
        if (!socket || !isAdmin || !connected) return;

        console.log('[AdminChat] Registering listeners on shared socket');

        const onReceiveMessage = (msg: Message) => {
            if (msg.sender_id !== user?.id) {
                NotificationService.notifyNewMessage('User', msg.content, msg.conversation_id);
            }
            setMessages(prev => {
                if (msg.conversation_id === activeChat?.id) {
                    return [...prev, msg];
                }
                return prev;
            });
            setChats(prev => prev.map(c =>
                c.id === msg.conversation_id
                    ? { ...c, lastMessage: { content: msg.content, created_at: msg.created_at, sender_id: msg.sender_id } }
                    : c
            ));
        };

        const onNewSupportChat = (chat: Conversation) => {
            NotificationService.notifyNewSupportChat('A User');
            setChats(prev => [chat, ...prev]);
        };

        const onPresenceUpdate = ({ conversationId, adminId, adminName, status }: any) => {
            if (adminId === user?.id) return;
            setActiveAdmins(prev => {
                const current = prev[conversationId] || [];
                if (status === 'viewing') {
                    if (!current.includes(adminName)) {
                        return { ...prev, [conversationId]: [...current, adminName] };
                    }
                } else if (status === 'left') {
                    return { ...prev, [conversationId]: current.filter(n => n !== adminName) };
                }
                return prev;
            });
        };

        socket.on('receive_message', onReceiveMessage);
        socket.on('new_support_chat', onNewSupportChat);
        socket.on('admin_presence_update', onPresenceUpdate);

        return () => {
            socket.off('receive_message', onReceiveMessage);
            socket.off('new_support_chat', onNewSupportChat);
            socket.off('admin_presence_update', onPresenceUpdate);
        };
    }, [socket, connected, isAdmin, user?.id, activeChat?.id]);

    // Fetch messages when active chat changes
    useEffect(() => {
        if (!activeChat || !session?.access_token) return;

        const fetchMessages = async () => {
            try {
                const res = await fetch(`${API_URL}/api/chat/conversations/${activeChat.id}/messages`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data);
                }
            } catch (err) {
                console.error('Failed to fetch messages:', err);
            }
        };

        fetchMessages();
        if (socket && connected) {
            socket.emit('join_room', activeChat.id);
            socket.emit('admin_viewing_chat', {
                conversationId: activeChat.id,
                adminName: user?.user_metadata?.username || user?.email || 'Admin'
            });
        }

        return () => {
            if (socket && connected) {
                socket.emit('admin_leaving_chat', { conversationId: activeChat.id });
            }
        };
    }, [activeChat, session?.access_token, socket, connected, user]);

    // Initial Fetch
    useEffect(() => {
        const fetchChats = async () => {
            if (!session?.access_token) return;
            setLoading(true);
            try {
                const params = new URLSearchParams();
                if (statusFilter) params.append('status', statusFilter);

                const res = await fetch(`${API_URL}/api/admin/support-chats?${params}`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    setChats(data);
                }
            } catch (err) {
                console.error('Failed to fetch chats:', err);
            } finally {
                setLoading(false);
            }
        };

        if (isAdmin && session) {
            fetchChats();
        }
    }, [isAdmin, session, statusFilter]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!newMessage.trim() || !activeChat || !session?.access_token) return;

        const content = newMessage.trim();
        setNewMessage('');

        const tempId = `temp-${Date.now()}`;
        const optimisticMessage: Message = {
            id: tempId,
            conversation_id: activeChat.id,
            sender_id: user?.id || '',
            content,
            created_at: new Date().toISOString(),
            type: 'text'
        };
        setMessages(prev => [...prev, optimisticMessage]);

        try {
            const res = await fetch(`${API_URL}/api/chat/conversations/${activeChat.id}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ content, type: 'text' })
            });

            if (!res.ok) {
                setMessages(prev => prev.filter(m => m.id !== tempId));
            } else {
                const serverMessage = await res.json();
                setMessages(prev => prev.map(m => m.id === tempId ? serverMessage : m));
            }
        } catch (err) {
            console.error('Failed to send message:', err);
            setMessages(prev => prev.filter(m => m.id !== tempId));
        }
    };

    const updateChatStatus = async (chatId: string, status: string) => {
        if (!session?.access_token) return;

        try {
            const res = await fetch(`${API_URL}/api/admin/support-chats/${chatId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ support_status: status })
            });

            if (res.ok) {
                setChats(prev => prev.map(c =>
                    c.id === chatId ? { ...c, support_status: status as any } : c
                ));
                if (activeChat?.id === chatId) {
                    setActiveChat(prev => prev ? { ...prev, support_status: status as any } : null);
                }
            }
        } catch (err) {
            console.error('Failed to update status:', err);
        }
    };

    const handleChatSelect = async (chat: Conversation) => {
        if (!session?.access_token) return;
        try {
            await fetch(`${API_URL}/api/admin/support-chats/${chat.id}/join`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            setActiveChat(chat);
        } catch (err) {
            console.error('Failed to join chat:', err);
            setActiveChat(chat);
        }
    };

    const getUserFromChat = (chat: Conversation) => {
        return chat.members.find(m => m.role !== 'admin')?.profile;
    };

    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getSentimentEmoji = (label?: string) => {
        switch (label) {
            case 'positive': return '😊';
            case 'negative': return '😟';
            case 'neutral': return '😐';
            default: return null;
        }
    };

    const filteredChats = chats.filter(chat => {
        if (!searchTerm) return true;
        const userProfile = getUserFromChat(chat);
        return (
            chat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            userProfile?.username?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    if (!isAdmin) return <div className="p-8">Access Denied</div>;

    return (
        <div className="admin-chat-container">
            <div className="admin-chat-sidebar">
                <div className="sidebar-header">
                    <h3>Support Chats</h3>
                    <div className="filters">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            aria-label="Filter chats"
                        >
                            <option value="">All</option>
                            <option value="open">Open</option>
                            <option value="pending">Pending</option>
                            <option value="resolved">Resolved</option>
                        </select>
                    </div>
                </div>

                <div className="search-bar">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search chats..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        aria-label="Search"
                    />
                </div>

                <div className="chat-list">
                    {loading ? (
                        <div className="p-4 text-center">Loading...</div>
                    ) : filteredChats.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            <MessageSquare size={32} className="mx-auto mb-2 opacity-20" />
                            <p>No chats found</p>
                        </div>
                    ) : (
                        filteredChats.map(chat => {
                            const userProfile = getUserFromChat(chat);
                            return (
                                <div
                                    key={chat.id}
                                    className={`chat-item ${activeChat?.id === chat.id ? 'active' : ''}`}
                                    onClick={() => handleChatSelect(chat)}
                                >
                                    <div className="avatar">
                                        {userProfile?.avatar_url ? (
                                            <SecureImage src={userProfile.avatar_url} alt="" fallbackType="profile" />
                                        ) : (
                                            <div className="placeholder">
                                                {userProfile?.username?.[0]?.toUpperCase() || '?'}
                                            </div>
                                        )}
                                        {userProfile?.is_online && <span className="online-dot" />}
                                    </div>
                                    <div className="info">
                                        <div className="header">
                                            <span className="name">{userProfile?.username || chat.name}</span>
                                            <span className={`status-tag ${chat.support_status}`} />
                                        </div>
                                        <p className="preview">
                                            {chat.lastMessage?.content || 'No messages'}
                                        </p>
                                    </div>
                                    {chat.lastMessage && (
                                        <span className="time">{formatTime(chat.lastMessage.created_at)}</span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <div className="admin-chat-main">
                {activeChat ? (
                    <>
                        <div className="main-header">
                            <div className="user-info">
                                {(() => {
                                    const userProfile = getUserFromChat(activeChat);
                                    return (
                                        <>
                                            <div className="avatar">
                                                {userProfile?.avatar_url ? (
                                                    <SecureImage src={userProfile.avatar_url} alt="" fallbackType="profile" />
                                                ) : (
                                                    <div className="placeholder">
                                                        {userProfile?.username?.[0]?.toUpperCase() || '?'}
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <h4>{userProfile?.username || activeChat.name}</h4>
                                                <span className={userProfile?.is_online ? 'online' : 'offline'}>
                                                    {userProfile?.is_online ? 'Online' : 'Offline'}
                                                </span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                            <div className="actions">
                                <select
                                    value={activeChat.support_status}
                                    onChange={(e) => updateChatStatus(activeChat.id, e.target.value)}
                                    className={`status-select ${activeChat.support_status}`}
                                    aria-label="Status"
                                >
                                    <option value="open">Open</option>
                                    <option value="pending">Pending</option>
                                    <option value="resolved">Resolved</option>
                                </select>
                                <ExportButton conversationId={activeChat.id} />
                            </div>
                        </div>

                        {activeAdmins[activeChat.id]?.length > 0 && (
                            <div className="admin-presence">
                                <span className="pulse" />
                                <span>{activeAdmins[activeChat.id].join(', ')} also viewing</span>
                            </div>
                        )}

                        <div className="messages-area">
                            {messages.map(msg => (
                                <div
                                    key={msg.id}
                                    className={`message-row ${msg.sender_id === user?.id ? 'own' : 'other'}`}
                                >
                                    <div className={`bubble ${msg.sentiment?.label || ''}`}>
                                        <p>{msg.content}</p>
                                        <div className="meta">
                                            {msg.sentiment && (
                                                <span className="sentiment" title={msg.sentiment.label}>
                                                    {getSentimentEmoji(msg.sentiment.label)}
                                                </span>
                                            )}
                                            <span className="time">{formatTime(msg.created_at)}</span>
                                            {msg.sender_id === user?.id && <CheckCheck size={14} className="status" />}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {typingUsers[activeChat.id] && (
                                <div className="typing">User is typing...</div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="input-area">
                            <input
                                type="text"
                                placeholder="Type a response..."
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                aria-label="Input"
                            />
                            <button onClick={sendMessage} disabled={!newMessage.trim()} aria-label="Send">
                                <Send size={20} />
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="empty-state">
                        <MessageSquare size={48} />
                        <h3>Select a conversation</h3>
                        <p>Pick a chat from the sidebar to start responding to users.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
