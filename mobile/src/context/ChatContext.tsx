import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { supabase } from '../api/supabase';
import { encryptMessage, decryptMessage } from '../utils/crypto';
import { storage } from '../utils/storage';
import { fromByteArray } from 'base64-js';

interface Message {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    nonce?: string;
    created_at: string;
    type: string;
    isOwn: boolean;
}

interface ChatContextType {
    conversations: any[];
    messages: Record<string, Message[]>;
    sendMessage: (conversationId: string, text: string) => Promise<void>;
    activeConversationId: string | null;
    setActiveConversationId: (id: string | null) => void;
}

const ChatContext = createContext<ChatContextType>({
    conversations: [],
    messages: {},
    sendMessage: async () => { },
    activeConversationId: null,
    setActiveConversationId: () => { },
});

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, session, profile } = useAuth();
    const [conversations, setConversations] = useState<any[]>([]);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (!session || !user) return;

        const socket = io('http://localhost:5000', {
            auth: { token: session.access_token }
        });
        socketRef.current = socket;

        socket.on('receive_message', async (rawMsg: any) => {
            const decryptedContent = await handleMessageDecryption(rawMsg);
            const processedMsg: Message = {
                ...rawMsg,
                content: decryptedContent || '[Encrypted Message]',
                isOwn: rawMsg.sender_id === user.id
            };

            setMessages(prev => ({
                ...prev,
                [rawMsg.conversation_id]: [...(prev[rawMsg.conversation_id] || []), processedMsg]
            }));
        });

        loadConversations();

        return () => { socket.disconnect(); };
    }, [session, user]);

    const loadConversations = async () => {
        const { data } = await supabase
            .from('conversation_members')
            .select('conversation:conversations(*)');
        if (data) setConversations(data.map(d => d.conversation));
    };

    const handleMessageDecryption = async (msg: any) => {
        if (!msg.nonce) return msg.content; // Not encrypted

        // 1. Get sender's public key
        const { data: sender } = await supabase
            .from('profiles')
            .select('public_key')
            .eq('id', msg.sender_id)
            .single();

        if (!sender?.public_key) return null;

        // 2. Get own private key
        const privateKey = await storage.getPrivateKey();
        if (!privateKey) return null;

        // 3. Decrypt
        return decryptMessage(msg.content, msg.nonce, sender.public_key, privateKey);
    };

    const sendMessage = async (conversationId: string, text: string) => {
        if (!user || !socketRef.current) return;

        // Get other participant to encrypt for them
        const { data: members } = await supabase
            .from('conversation_members')
            .select('user_id, profiles(public_key)')
            .eq('conversation_id', conversationId)
            .neq('user_id', user.id)
            .single();

        const receiverPublicKey = (members?.profiles as any)?.public_key;
        const privateKey = await storage.getPrivateKey();

        let payload: any = { content: text };

        if (receiverPublicKey && privateKey) {
            const encrypted = encryptMessage(text, receiverPublicKey, privateKey);
            payload = {
                content: encrypted.content,
                nonce: encrypted.nonce,
                is_encrypted: true
            };
        }

        // Emit via socket or call API
        await fetch(`http://localhost:5000/api/chat/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify(payload)
        });
    };

    return (
        <ChatContext.Provider value={{
            conversations,
            messages,
            sendMessage,
            activeConversationId,
            setActiveConversationId
        }}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => useContext(ChatContext);
