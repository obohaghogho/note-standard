import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../lib/api';
import { Send, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    created_at: string;
    type: string;
}

interface SupabaseRealtimeChatProps {
    conversationId: string;
}

export const SupabaseRealtimeChat: React.FC<SupabaseRealtimeChatProps> = ({ conversationId }) => {
    const { user, session } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // 1. Initial Load of Messages
    useEffect(() => {
        const fetchMessages = async () => {
            if (!conversationId) return;
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('messages')
                    .select('*')
                    .eq('conversation_id', conversationId)
                    .order('created_at', { ascending: true });

                if (error) throw error;
                setMessages(data || []);
            } catch (err) {
                console.error('Error fetching messages:', err);
                toast.error('Failed to load messages');
            } finally {
                setLoading(false);
                scrollToBottom();
            }
        };

        fetchMessages();
    }, [conversationId]);

    // 2. Setup Realtime Subscription
    useEffect(() => {
        if (!conversationId) return;

        console.log(`[Realtime] Subscribing to conversation: ${conversationId}`);

        const channel = supabase
            .channel(`chat:${conversationId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload) => {
                    const newMessage = payload.new as Message;
                    console.log('[Realtime] New message received:', newMessage);
                    setMessages((prev) => [...prev, newMessage]);
                    scrollToBottom();
                }
            )
            .subscribe((status) => {
                console.log(`[Realtime] Subscription status for ${conversationId}:`, status);
            });

        // Cleanup on unmount
        return () => {
            console.log(`[Realtime] Unsubscribing from ${conversationId}`);
            supabase.removeChannel(channel);
        };
    }, [conversationId]);

    // 3. Send Message via Netlify API
    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || sending || !session) return;

        setSending(true);
        try {
            const response = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    content: inputValue,
                    type: 'text',
                }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to send message');
            }

            setInputValue('');
        } catch (err: any) {
            console.error('Send error:', err);
            toast.error(err.message || 'Failed to send message');
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-10 text-gray-400">
                <Loader2 className="animate-spin mr-2" /> Loading chat...
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[500px] w-full max-w-2xl mx-auto bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <p className="text-center text-gray-500 py-10">No messages yet. Start the conversation!</p>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[80%] p-3 rounded-2xl ${
                                    msg.sender_id === user?.id
                                        ? 'bg-blue-600 text-white rounded-br-sm'
                                        : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                                }`}
                            >
                                <p className="text-sm break-words">{msg.content}</p>
                                <span className="text-[10px] opacity-50 block mt-1">
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-4 bg-gray-900/50 border-t border-gray-800 flex gap-2">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500 transition-all"
                />
                <button
                    type="submit"
                    disabled={!inputValue.trim() || sending}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl disabled:opacity-50 transition-all active:scale-95"
                >
                    {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                </button>
            </form>
        </div>
    );
};
