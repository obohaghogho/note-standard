import axios from 'axios';
import { API_URL } from '../Config';
import { AuthService } from './AuthService';

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
    private static async getHeaders() {
        const token = await AuthService.getToken();
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
    }

    static async getConversations(): Promise<Conversation[]> {
        try {
            const headers = await this.getHeaders();
            const response = await axios.get(`${API_URL}/api/chat/conversations`, { headers });
            return response.data;
        } catch (err) {
            console.error('[ChatService] Failed to fetch conversations:', err);
            return [];
        }
    }

    static async acceptConversation(conversationId: string): Promise<boolean> {
        try {
            const headers = await this.getHeaders();
            const response = await axios.put(`${API_URL}/api/chat/conversations/${conversationId}/accept`, {}, { headers });
            return response.status === 200;
        } catch (err) {
            console.error('[ChatService] Failed to accept conversation:', err);
            return false;
        }
    }
}
