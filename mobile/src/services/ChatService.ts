import apiClient from '../api/apiClient';

export interface Profile {
    username: string;
    full_name?: string;
    avatar_url?: string;
    is_verified?: boolean;
    plan_tier?: string;
    is_online?: boolean;
}

export interface Member {
    user_id: string;
    role: string;
    status: string;
    profile?: Profile;
}

export interface Conversation {
    id: string;
    type: 'direct' | 'group';
    name?: string;
    members: Member[];
    updated_at: string;
    last_message?: {
        id: string;
        content: string;
        sender_id: string;
        created_at: string;
    } | null;
}

export class ChatService {
    static async getConversations(): Promise<Conversation[]> {
        try {
            const response = await apiClient.get(`/chat/conversations`);
            // FIX: Guard against non-array responses (e.g. error objects from server)
            if (Array.isArray(response.data)) {
                return response.data;
            }
            console.warn('[ChatService] getConversations: unexpected response shape', response.data);
            return [];
        } catch (err) {
            console.error('[ChatService] Failed to fetch conversations:', err);
            return [];
        }
    }

    static async acceptConversation(conversationId: string): Promise<boolean> {
        try {
            const response = await apiClient.put(`/chat/conversations/${conversationId}/accept`, {});
            return response.status === 200;
        } catch (err) {
            console.error('[ChatService] Failed to accept conversation:', err);
            return false;
        }
    }

    static async createConversation(username: string): Promise<Conversation | null> {
        try {
            const response = await apiClient.post(`/chat/conversations`, {
                type: 'direct',
                participants: [username],
            });
            // Server returns { conversation, isExisting?, members?, resolvedParticipants? }
            const conv: Conversation = response.data?.conversation;
            if (!conv) {
                console.error('[ChatService] createConversation: no conversation in response', response.data);
                return null;
            }
            // Ensure members array always exists
            if (!Array.isArray(conv.members)) {
                conv.members = [];
            }
            return conv;
        } catch (err) {
            console.error('[ChatService] Failed to create conversation:', err);
            return null;
        }
    }
}
