import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseSafe';
import './ChatWidget.css';
import { API_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import {
    MessageCircle,
    X,
    Send,
    Minimize2,
    CheckCheck,
    Check,
    Headphones,
    Phone,
    Video,
    Zap,
    ShieldCheck,
    Trash2,
    RefreshCw
} from 'lucide-react';
import type { Message, Conversation } from '../../context/ChatContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { CallOverlay } from './CallOverlay';
import { AudioPlayer } from './AudioPlayer';
import { applyAutoCorrect } from '../../utils/textUtils';
import toast from 'react-hot-toast';
import { useKeyboardLayout } from '../../hooks/useKeyboardLayout';

export const ChatWidget = () => {
    const location = useLocation();
    const { session, user, isPro, isBusiness } = useAuth();
    const { socket, connected } = useSocket();
    const { 
        startCall, callState, acceptCall, rejectCall, endCall, 
        localStream, remoteStream, toggleMute, toggleVideo, 
        isMuted, isVideoEnabled 
    } = useWebRTC();

    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [supportChat, setSupportChat] = useState<Conversation | null>(null);
    const supportChatRef = useRef<Conversation | null>(null);
    useEffect(() => {
        supportChatRef.current = supportChat;
    }, [supportChat]);

    // Ensure socket room is joined whenever supportChat becomes available
    useEffect(() => {
        if (socket && connected && supportChat?.id) {
            socket.emit('join_room', supportChat.id);
        }
    }, [socket, connected, supportChat?.id]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [adminTyping, setAdminTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
    const { isKeyboardOpen } = useKeyboardLayout();

    const fetchMessages = useCallback(async (chatId: string) => {
        if (!session?.access_token) return;
        try {
            const res = await fetch(`${API_URL}/api/chat/conversations/${chatId}/messages`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setMessages(data);
            }
        } catch (err) {
            console.error('Failed to fetch messages:', err);
        }
    }, [session?.access_token]);

    const checkExistingSupportChat = useCallback(async () => {
        if (!session?.access_token) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/chat/support`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (res.ok) {
                const data = await res.json();
                if (data && data.conversation) {
                    setSupportChat(data.conversation);
                    if (data.messages) {
                        setMessages(data.messages);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to check existing support chat:', err);
        } finally {
            setLoading(false);
        }
    }, [session?.access_token]);

    // Register Chat Listeners
    useEffect(() => {
        if (!socket || !connected || !isOpen) return;

        const onReceiveMessage = (msg: Message) => {
            const currentChatId = supportChatRef.current?.id || supportChat?.id;
            if (currentChatId && msg.conversation_id === currentChatId) {
                setMessages(prev => {
                    const exists = prev.some(m => 
                        m.id === msg.id || 
                        (m.id.startsWith('temp-') && m.content === msg.content)
                    );
                    if (exists) {
                        return prev.map(m => 
                            (m.id === msg.id || (m.id.startsWith('temp-') && m.content === msg.content)) 
                                ? msg 
                                : m
                        );
                    }
                    return [...prev, msg];
                });
                if (msg.sender_id !== user?.id) {
                    setAdminTyping(false);
                }
            }
        };

        const onTyping = ({ conversationId, userId, isTyping: typing }: { conversationId: string, userId: string, isTyping: boolean }) => {
            const currentChatId = supportChatRef.current?.id || supportChat?.id;
            if (currentChatId && conversationId === currentChatId && userId !== user?.id) {
                setAdminTyping(typing);
            }
        };

        const onConversationUpdated = ({ id, support_status }: { id: string; support_status: string }) => {
            const currentChatId = supportChatRef.current?.id || supportChat?.id;
            if (currentChatId && id === currentChatId) {
                setSupportChat(prev => prev ? { ...prev, support_status: support_status as any } : null);
            }
        };

        const onMessageRead = ({ messageId }: { messageId: string }) => {
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, read_at: new Date().toISOString() } : m));
        };
        
        socket.on('chat:message', onReceiveMessage);
        socket.on('chat:typing', onTyping);
        socket.on('chat:conversation_updated', onConversationUpdated);
        socket.on('chat:message_read', onMessageRead);
        socket.on('chat:message_delivered', ({ messageId }: { messageId: string }) => {
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, delivered_at: new Date().toISOString() } : m));
        });

        // Also listen via Supabase for direct DB updates to support_status
        const convChannel = supabase
            .channel(`support_conv_${supportChat?.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'conversations',
                    filter: `id=eq.${supportChat?.id}`
                },
                (payload: { new: Partial<Conversation> }) => {
                    setSupportChat((prev) => prev ? { ...prev, ...payload.new } : null);
                }
            )
            .subscribe();

        if (supportChat) {
            socket.emit('join_room', supportChat.id);
        }

        return () => {
            socket.off('chat:message', onReceiveMessage);
            socket.off('chat:typing', onTyping);
            socket.off('chat:conversation_updated', onConversationUpdated);
            socket.off('chat:message_read', onMessageRead);
            socket.off('chat:message_delivered');
            supabase.removeChannel(convChannel);
        };
    }, [socket, connected, isOpen, supportChat, supportChat?.id, user?.id]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handledSearchRef = useRef<string | null>(null);

    const handleCloseWidget = useCallback(() => {
        setIsOpen(false);
        setIsMinimized(false);
        if (typeof window !== 'undefined' && (window.location.search.includes('openSupport') || window.location.search.includes('support'))) {
            const url = new URL(window.location.href);
            url.searchParams.delete('openSupport');
            url.searchParams.delete('support');
            window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : ''));
        }
    }, []);

    // Check for existing chat or URL parameter trigger
    useEffect(() => {
        const search = location.search;
        if (search.includes('openSupport=true') || search.includes('support=true')) {
            if (handledSearchRef.current !== search) {
                handledSearchRef.current = search;
                setIsOpen(true);
                setIsMinimized(false);
            }
        } else {
            handledSearchRef.current = null;
        }
        if (isOpen && session?.access_token && !supportChat) {
            checkExistingSupportChat();
        }
    }, [isOpen, location.search, session?.access_token, supportChat, checkExistingSupportChat]);

    useEffect(() => {
        const handleOpenSupport = () => {
            setIsOpen(true);
            setIsMinimized(false);
            if (session?.access_token && !supportChat) {
                checkExistingSupportChat();
            }
        };
        window.addEventListener('open-support-chat', handleOpenSupport);
        return () => window.removeEventListener('open-support-chat', handleOpenSupport);
    }, [session?.access_token, supportChat, checkExistingSupportChat]);

    const startSupportChat = async () => {
        if (supportChat || !session?.access_token) return;
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${API_URL}/api/chat/support`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ subject: 'Support Request' })
            });

            const data = await res.json();
            if (!res.ok) {
                if (data && data.existingChatId) {
                    setSupportChat({ 
                        id: data.existingChatId, 
                        name: 'Support', 
                        support_status: 'open',
                        type: 'direct',
                        updated_at: new Date().toISOString(),
                        members: []
                    } as Conversation);
                    fetchMessages(data.existingChatId);
                    if (socket && connected) {
                        socket.emit('join_room', data.existingChatId);
                    }
                    return;
                }
                throw new Error(data?.error || 'Failed to start chat');
            }

            const targetConv = data?.conversation || {
                id: data?.conversationId,
                name: 'Support Chat',
                support_status: 'open',
                type: 'direct',
                chat_type: 'support',
                updated_at: new Date().toISOString(),
                members: []
            };

            if (targetConv && targetConv.id) {
                setSupportChat(targetConv as Conversation);
                if (socket && connected) {
                    socket.emit('join_room', targetConv.id);
                }
            }
        } catch (err) {
            console.error('Failed to start support chat:', err);
            setError(err instanceof Error ? err.message : 'Failed to start chat');
        } finally {
            setLoading(false);
        }
    };

    const handleCloseChat = async () => {
        if (!supportChat || !session?.access_token) return;
        try {
            toast.loading('Closing support chat & resetting history...', { id: 'close-support' });
            const res = await fetch(`${API_URL}/api/chat/support/close`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ conversationId: supportChat.id })
            });

            if (res.ok) {
                setMessages([]);
                setSupportChat(prev => prev ? { ...prev, support_status: 'resolved' as any } : null);
                toast.success('Support chat closed. Previous messages wiped clean!', { id: 'close-support' });
            } else {
                toast.error('Failed to close chat', { id: 'close-support' });
            }
        } catch (err) {
            console.error('Failed to close support chat:', err);
            toast.error('Error closing support chat', { id: 'close-support' });
        }
    };

    const sendMessage = async () => {
        if (!newMessage.trim() || !supportChat || !session?.access_token) return;

        const content = newMessage.trim();
        setNewMessage('');

        const tempId = `temp-${Date.now()}`;
        const optimisticMessage: Message = {
            id: tempId,
            conversation_id: supportChat.id || '',
            sender_id: user?.id || '',
            content,
            created_at: new Date().toISOString(),
            type: 'text'
        };
        setMessages(prev => [...prev, optimisticMessage]);

        try {
            const res = await fetch(`${API_URL}/api/chat/conversations/${supportChat.id}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ content, type: 'text' })
            });

            if (!res.ok) {
                setMessages(prev => prev.filter(m => m.id !== tempId));
                throw new Error('Failed to send message');
            }

            const serverMessage = await res.json();
            setMessages(prev => prev.map(m => m.id === tempId ? serverMessage : m));
        } catch (err) {
            console.error('Failed to send message:', err);
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

    const handleTyping = () => {
        if (!supportChat || !socket || !connected) return;

        socket.emit('typing', {
            conversationId: supportChat.id,
            isTyping: true
        });

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        typingTimeoutRef.current = setTimeout(() => {
            if (socket && connected) {
                socket.emit('typing', {
                    conversationId: supportChat.id,
                    isTyping: false
                });
            }
        }, 2000);
    };

    const handleCall = (type: 'voice' | 'video') => {
        if (!supportChat?.id) return;
        
        // Find an admin/agent in the chat to call
        const otherMember = supportChat.members?.find((m) => m.role === 'admin' || m.user_id !== user?.id);
        
        if (!otherMember) {
            toast.error('Waiting for an agent to join the chat...');
            return;
        }

        toast.loading(`Starting ${type} call...`, { duration: 2000, id: 'widget-call' });
        startCall(otherMember.user_id, supportChat.id, type)
            .catch(() => toast.error('Failed to start call'));
    };

    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const hasOpenSupportParam = location.search.includes('openSupport=true') || location.search.includes('support=true');

    // Hide the widget in full-screen/immersive views (chat, reels, feed, teams) unless explicitly open
    const isChatRoom = (
        location.pathname.startsWith('/dashboard/chat') || 
        location.pathname.startsWith('/admin/chats') ||
        location.pathname.startsWith('/dashboard/teams') ||
        location.pathname.startsWith('/dashboard/reels') ||
        location.pathname === '/dashboard/feed' ||
        location.pathname.startsWith('/dashboard/feed/')
    ) && !isOpen;

    if (!user || (!isOpen && isKeyboardOpen) || isChatRoom) return null;

    return (
        <div className={`chat-widget ${isOpen ? 'open' : ''} ${isMinimized ? 'minimized' : ''} ${isOpen && isKeyboardOpen ? 'keyboard-visible' : ''}`} style={{ display: (!isOpen && isKeyboardOpen) || isChatRoom ? 'none' : 'block' }}>
            {!isOpen && (
                <button className="chat-widget-button" onClick={() => setIsOpen(true)}>
                    <MessageCircle size={24} />
                    <span className="button-label">Need Help?</span>
                </button>
            )}

            {isOpen && (
                <div className="chat-widget-window">
                    <div className="chat-widget-header">
                        <div className="header-info">
                            <Headphones size={20} />
                            <div>
                                <h4>Support Chat</h4>
                                <div className="flex items-center gap-2">
                                    <span className="status">
                                        {supportChat?.support_status === 'resolved' || supportChat?.support_status === 'closed' ? (
                                            <span className="text-green-300">Issue Resolved</span>
                                        ) : supportChat?.support_status === 'escalated' || supportChat?.support_status === 'pending' || supportChat?.support_status === 'assigned' ? (
                                            <span className="text-amber-300 animate-pulse">Connecting to a Live Agent...</span>
                                        ) : (
                                            <span className="text-blue-300">AI Assistant Online ✅</span>
                                        )}
                                    </span>
                                    {isBusiness ? (
                                        <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-[9px] font-bold border border-blue-500/30 flex items-center gap-0.5">
                                            <ShieldCheck size={8} />
                                            PRIORITY
                                        </span>
                                    ) : isPro ? (
                                        <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-[9px] font-bold border border-purple-500/30 flex items-center gap-0.5">
                                            <Zap size={8} />
                                            PRIORITY
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <div className="header-actions">
                            {supportChat && !isMinimized && (
                                <div className="flex items-center mr-2 gap-1">
                                    <button onClick={() => handleCall('voice')} className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded-full" title="Voice Call">
                                        <Phone size={16} />
                                    </button>
                                    <button onClick={() => handleCall('video')} className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded-full" title="Video Call">
                                        <Video size={16} />
                                    </button>
                                    <button onClick={handleCloseChat} className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-full" title="Close Chat & Wipe History">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                            <button onClick={() => setIsMinimized(!isMinimized)} title="Minimize">
                                <Minimize2 size={18} />
                            </button>
                            <button onClick={handleCloseWidget} title="Close Support Widget">
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {!isMinimized && (
                        <>
                            <div className="chat-widget-body">
                                {loading ? (
                                    <div className="chat-loading">
                                        <div className="loader" />
                                        <p>Loading...</p>
                                    </div>
                                ) : !supportChat ? (
                                    <div className="chat-welcome">
                                        <Headphones size={48} />
                                        <h3>Hi there! 👋</h3>
                                        <p>Need help with something? Start a conversation with our support team.</p>
                                        <button className="start-chat-btn" onClick={startSupportChat}>
                                            Start Chat
                                        </button>
                                        {error && <p className="error-msg">{error}</p>}
                                    </div>
                                ) : (
                                    <div className="messages-container">
                                        {messages.length === 0 ? (
                                            <div className="no-messages">
                                                <p>Send a message to start the conversation</p>
                                            </div>
                                        ) : (
                                                                       messages.map((msg, idx) => {
                                                const isAi = msg.sender_type === 'ai' || msg.sender_id === '00000000-0000-0000-0000-000000000000';
                                                const isHumanAgent = msg.sender_type === 'human';
                                                const isOwn = !isAi && !isHumanAgent && msg.sender_id === user?.id;
                                                
                                                const isConsecutive = idx > 0 && messages[idx - 1].sender_id === msg.sender_id;
                                                const showLabel = !isOwn && !isConsecutive;

                                                let variantClass = 'other';
                                                if (isOwn) variantClass = 'own';
                                                else if (isAi) variantClass = 'ai';
                                                else if (isHumanAgent) variantClass = 'human';

                                                return (
                                                    <div
                                                        key={msg.id}
                                                        className={`chat-message ${variantClass} ${showLabel ? 'has-label' : ''}`}
                                                    >
                                                        <div className="message-bubble relative">
                                                            {showLabel && (
                                                                <span className="text-[9px] uppercase tracking-tighter text-blue-300 opacity-80 absolute -top-4 left-1 font-bold">
                                                                    {isAi ? '🤖 NoteStandard AI Support' : '🎧 Support Specialist'}
                                                                </span>
                                                            )}
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
                                                            <span className="msg-time">
                                                                {formatTime(msg.created_at)}
                                                                {isOwn && (
                                                                    <span className="ml-1 inline-block scale-75">
                                                                        {msg.read_at ? (
                                                                            <CheckCheck size={12} className="text-blue-300" />
                                                                        ) : msg.delivered_at ? (
                                                                            <CheckCheck size={12} className="text-gray-400 opacity-60" />
                                                                        ) : (
                                                                            <Check size={12} className="opacity-40" />
                                                                        )}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                        {adminTyping && (
                                            <div className="typing-indicator">
                                                <span></span><span></span><span></span>
                                                Support Agent is typing...
                                            </div>
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>
                                )}
                            </div>

                            {supportChat && (
                                <div className="chat-widget-input">
                                    <input
                                        id="chat-widget-input"
                                        name="message"
                                        type="text"
                                        placeholder="Type your message..."
                                        value={newMessage}
                                        onChange={(e) => {
                                            setNewMessage(applyAutoCorrect(e.target.value));
                                            handleTyping();
                                        }}
                                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                        aria-label="Type your support message"
                                        spellCheck={true}
                                        autoCapitalize="sentences"
                                        autoCorrect="on"
                                        autoComplete="on"
                                    />
                                    <button onClick={sendMessage} disabled={!newMessage.trim()}>
                                        <Send size={18} />
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            
            {callState.status !== 'idle' && (
                <CallOverlay 
                    callState={callState} 
                    acceptCall={acceptCall} 
                    rejectCall={rejectCall} 
                    endCall={endCall}
                    localStream={localStream} 
                    remoteStream={remoteStream} 
                    toggleMute={toggleMute} 
                    toggleVideo={toggleVideo}
                    isMuted={isMuted} 
                    isVideoEnabled={isVideoEnabled} 
                    otherUserName="Support Agent" 
                />
            )}
        </div>
    );
};
