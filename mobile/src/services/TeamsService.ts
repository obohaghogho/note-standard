import apiClient from '../api/apiClient';

export interface Team {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  my_role: string;
}

export class TeamsService {
  static async getMyTeams(): Promise<Team[]> {
    try {
      const response = await apiClient.get(`/teams/my-teams`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      console.error('[TeamsService] Failed to fetch teams:', err);
      return [];
    }
  }

  static async inviteMember(teamId: string, payload: any): Promise<any> {
    try {
      const response = await apiClient.post(`/teams/${teamId}/members`, payload);
      return response.data;
    } catch (err) {
      console.error('[TeamsService] Failed to invite member:', err);
      throw err;
    }
  }
}
