import axios from 'axios';
import { API_URL } from '../Config';
import { AuthService } from './AuthService';

export interface Team {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  my_role: string;
}

export class TeamsService {
  private static async getHeaders() {
    const token = await AuthService.getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  static async getMyTeams(): Promise<Team[]> {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(`${API_URL}/api/teams/my-teams`, { headers });
      return response.data;
    } catch (err) {
      console.error('[TeamsService] Failed to fetch teams:', err);
      return [];
    }
  }
}
