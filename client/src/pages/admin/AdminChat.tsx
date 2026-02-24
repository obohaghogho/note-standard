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
    Check,
    Search,
    Phone,
    Video
} from 'lucide-react';
import type { Message, Conversation } from '../../context/ChatContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { AudioPlayer } from '../../components/chat/AudioPlayer';
import toast from 'react-hot-toast';
import SecureImage from '../../components/common/SecureImage';
import './AdminChat.css';

export const AdminChat = () => {
    const { session, user, isAdmin } = useAuth();
    const { socket, connected } = useSocket();
    const { startCall } = useWebRTC();
    
    // State
    const [chats, setChats] = useState<Conversation[]>([]);
    const [activeChat, setActiveChat] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [activeAdmins, setActiveAdmins] = useState<Record<string, string[]>>({});
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

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

        const onMessageRead = ({ messageId }: any) => {
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, read_at: new Date().toISOString() } : m));
        };

        socket.on('receive_message', onReceiveMessage);
        socket.on('new_support_chat', onNewSupportChat);
        socket.on('admin_presence_update', onPresenceUpdate);
        socket.on('message_read', onMessageRead);

        return () => {
            socket.off('receive_message', onReceiveMessage);
            socket.off('new_support_chat', onNewSupportChat);
            socket.off('admin_presence_update', onPresenceUpdate);
            socket.off('message_read', onMessageRead);
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
                    const data = await res.json() || [];
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
                    const data = await res.json() || [];
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

    const fetchSignedUrl = async (path: string) => {
        if (signedUrls[path]) return signedUrls[path];
        try {
            const res = await fetch(`${API_URL}/api/media/signed-url?path=${encodeURIComponent(path)}`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            if (res.ok) {
                const { url } = await res.json();
                setSignedUrls(prev => ({ ...prev, [path]: url }));
                return url;
            }
        } catch (err) {
            console.error('Failed to get signed URL:', err);
        }
        return null;
    };

    const getUserFromChat = (chat: Conversation) => {
        return chat.members.find(m => m.role !== 'admin');
    };

    const handleCall = (type: 'voice' | 'video') => {
        if (!activeChat || !session?.access_token) return;
        const otherUser = getUserFromChat(activeChat);
        if (!otherUser) {
            toast.error('Could not find user to call');
            return;
        }
        toast.loading(`Starting ${type} call...`, { duration: 2000, id: 'call-start' });
        startCall(otherUser.user_id, activeChat.id, type, otherUser.profile?.username, otherUser.profile?.avatar_url)
            .catch(() => {
                toast.error('Failed to start call. Check camera/mic permissions.');
            });
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
        const chatMember = getUserFromChat(chat);
        const userProfile = chatMember?.profile;
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
                        filteredChats?.map(chat => {
                            const chatMember = getUserFromChat(chat);
                            const userProfile = chatMember?.profile;
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
                                    const chatMember = getUserFromChat(activeChat);
                                    const userProfile = chatMember?.profile;
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
                                <div className="flex items-center gap-1 mr-4">
                                    <button 
                                        onClick={() => handleCall('voice')}
                                        className="p-2 text-gray-400 hover:text-green-500 hover:bg-green-500/10 rounded-full transition-all"
                                        title="Voice Call"
                                    >
                                        <Phone size={18} />
                                    </button>
                                    <button 
                                        onClick={() => handleCall('video')}
                                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-full transition-all"
                                        title="Video Call"
                                    >
                                        <Video size={18} />
                                    </button>
                                </div>
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
                            {messages?.map(msg => (
                                <div
                                    key={msg.id}
                                    className={`message-row ${msg.sender_id === user?.id ? 'own' : 'other'}`}
                                >
                                    <div className={`bubble ${msg.sentiment?.label || ''}`}>
                                        {msg.type === 'audio' ? (
                                            <div className="flex flex-col gap-2 min-w-[200px]">
                                                <AudioPlayer 
                                                    path={msg.attachment?.storage_path || ''} 
                                                    fetchUrl={fetchSignedUrl} 
                                                />
                                            </div>
                                        ) : (
                                            <p>{msg.content}</p>
                                        )}
                                        <div className="meta">
                                            {msg.sentiment && (
                                                <span className="sentiment" title={msg.sentiment.label}>
                                                    {getSentimentEmoji(msg.sentiment.label)}
                                                </span>
                                            )}
                                            <span className="time">{formatTime(msg.created_at)}</span>
                                            {msg.sender_id === user?.id && (
                                                <span className="status ml-1 scale-90 inline-block">
                                                    {msg.read_at ? (
                                                        <CheckCheck size={14} className="text-blue-300" />
                                                    ) : (
                                                        <Check size={14} className="opacity-50" />
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
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
