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
  is_archived?: boolean;
  is_pinned?: boolean;
  category_id?: string;
  last_opened_at?: string;
  note_type?: 'text' | 'checklist' | 'voice' | 'image' | 'drawing' | 'document';
  cover_image?: string;
  color?: string;
  word_count?: number;
  reading_time?: number;
  deleted_at?: string;
  reminder_at?: string;
  reminder_completed?: boolean;
  repeat_type?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  version?: number;
  metadata?: any;
}
