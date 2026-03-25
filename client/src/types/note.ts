export interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
  is_private: boolean;
  tags?: string[];
  owner_id: string;
  owner?: {
      username?: string;
      email?: string;
  };
}
