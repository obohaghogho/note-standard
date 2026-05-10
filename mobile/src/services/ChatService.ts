import apiClient from '../api/apiClient';

export interface Profile {
    username: string;
    full_name?: string;
    avatar_url?: string;
    is_verified?: boolean;
    plan_tier?: string;
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
}

export class ChatService {
    static async getConversations(): Promise<Conversation[]> {
        try {
            const response = await apiClient.get(`/chat/conversations`);
            return response.data;
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
}
