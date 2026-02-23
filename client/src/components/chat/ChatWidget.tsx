import { useState, useEffect, useRef, useCallback } from 'react';
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
    Video
} from 'lucide-react';
import type { Message, Conversation } from '../../context/ChatContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { CallOverlay } from './ChatWindow'; // Reuse CallOverlay from ChatWindow
import toast from 'react-hot-toast';

// Local interfaces removed in favor of exports from ChatContext

export const ChatWidget = () => {
    const { session, user } = useAuth();
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
    const [supportChat, setSupportChat] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [adminTyping, setAdminTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<any>(null);

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
            const res = await fetch(`${API_URL}/api/chat/conversations`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (res.ok) {
                const chats = await res.json();
                const openSupportChat = chats.find((c: any) =>
                    c.chat_type === 'support' && c.support_status !== 'resolved'
                );

                if (openSupportChat) {
                    setSupportChat(openSupportChat);
                    fetchMessages(openSupportChat.id);
                }
            }
        } catch (err) {
            console.error('Failed to check existing chat:', err);
        } finally {
            setLoading(false);
        }
    }, [session?.access_token, fetchMessages]);

    // Register Chat Listeners
    useEffect(() => {
        if (!socket || !connected || !isOpen) return;

        const onReceiveMessage = (msg: Message) => {
            if (msg.conversation_id === supportChat?.id) {
                setMessages(prev => [...prev, msg]);
            }
        };

        const onTyping = ({ conversationId, userId, isTyping: typing }: any) => {
            if (conversationId === supportChat?.id && userId !== user?.id) {
                setAdminTyping(typing);
            }
        };

        const onMessageRead = ({ messageId }: any) => {
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, read_at: new Date().toISOString() } : m));
        };

        socket.on('receive_message', onReceiveMessage);
        socket.on('user_typing', onTyping);
        socket.on('message_read', onMessageRead);

        if (supportChat) {
            socket.emit('join_room', supportChat.id);
        }

        return () => {
            socket.off('receive_message', onReceiveMessage);
            socket.off('user_typing', onTyping);
            socket.off('message_read', onMessageRead);
        };
    }, [socket, connected, isOpen, supportChat?.id, user?.id]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Check for existing chat
    useEffect(() => {
        if (isOpen && session?.access_token && !supportChat) {
            checkExistingSupportChat();
        }
    }, [isOpen, session?.access_token, supportChat, checkExistingSupportChat]);

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
                if (data.existingChatId) {
                    setSupportChat({ id: data.existingChatId, name: 'Support', support_status: 'open' });
                    fetchMessages(data.existingChatId);
                    if (socket && connected) {
                        socket.emit('join_room', data.existingChatId);
                    }
                    return;
                }
                throw new Error(data.error || 'Failed to start chat');
            }

            setSupportChat(data.conversation);
            if (socket && connected) {
                socket.emit('join_room', data.conversation.id);
            }
        } catch (err) {
            console.error('Failed to start support chat:', err);
            setError(err instanceof Error ? err.message : 'Failed to start chat');
        } finally {
            setLoading(false);
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
        const otherMember = supportChat.members?.find((m: any) => m.user_id !== user?.id);
        
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

    if (!user) return null;

    return (
        <div className={`chat-widget ${isOpen ? 'open' : ''} ${isMinimized ? 'minimized' : ''}`}>
            {!isOpen && (
                <button className="chat-widget-button" onClick={() => setIsOpen(true)}>
                    <MessageCircle size={24} />
                    <span className="button-label">Need Help?</span>
                </button>
            )}

            {isOpen && (
                <div className="chat-widget-window">
                    {/* Call Overlay Integration */}
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

                    <div className="chat-widget-header">
                        <div className="header-info">
                            <Headphones size={20} />
                            <div>
                                <h4>Support Chat</h4>
                                <span className="status">
                                    {supportChat?.support_status === 'pending' ? 'Admin is responding' : 'We typically reply within minutes'}
                                </span>
                            </div>
                        </div>
                        <div className="header-actions">
                            {supportChat && !isMinimized && (
                                <div className="flex items-center mr-2">
                                    <button onClick={() => handleCall('voice')} className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded-full" title="Voice Call">
                                        <Phone size={16} />
                                    </button>
                                    <button onClick={() => handleCall('video')} className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded-full" title="Video Call">
                                        <Video size={16} />
                                    </button>
                                </div>
                            )}
                            <button onClick={() => setIsMinimized(!isMinimized)}>
                                <Minimize2 size={18} />
                            </button>
                            <button onClick={() => setIsOpen(false)}>
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
                                            messages.map(msg => (
                                                <div
                                                    key={msg.id}
                                                    className={`chat-message ${msg.sender_id === user?.id ? 'own' : 'other'}`}
                                                >
                                                    <div className="message-bubble">
                                                        <p>{msg.content}</p>
                                                        <span className="msg-time">
                                                            {formatTime(msg.created_at)}
                                                            {msg.sender_id === user?.id && (
                                                                <span className="ml-1 inline-block scale-75">
                                                                    {msg.read_at ? (
                                                                        <CheckCheck size={12} className="text-blue-300" />
                                                                    ) : (
                                                                        <Check size={12} />
                                                                    )}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                        {adminTyping && (
                                            <div className="typing-indicator">
                                                <span></span><span></span><span></span>
                                                Admin is typing...
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
                                            setNewMessage(e.target.value);
                                            handleTyping();
                                        }}
                                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                        aria-label="Type your support message"
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
        </div>
    );
};
