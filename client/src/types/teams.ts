// ====================================
// TEAM COLLABORATION TYPES
// ====================================

export type TeamRole = 'owner' | 'admin' | 'member';
export type MessageType = 'text' | 'note_share' | 'system' | 'image';
export type NotePermission = 'read' | 'edit';

export interface Team {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: string;
  invited_by?: string;
  last_read_at?: string;
  
  // Joined profile data
  profile?: {
    id: string;
    email: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export interface TeamMessage {
  id: string;
  team_id: string;
  sender_id: string;
  content?: string;
  message_type: MessageType;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  parent_message_id?: string;
  
  // Joined data
  sender?: {
    id: string;
    email: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
  };
  
  // For note_share messages
  shared_note?: SharedNote;
  
  // UI state
  isOwn?: boolean;
  isOptimistic?: boolean;
  failed?: boolean;
}

export interface SharedNote {
  id: string;
  team_id: string;
  note_id: string;
  shared_by: string;
  message_id?: string;
  permission: NotePermission;
  shared_at: string;
  
  // Joined note data
  note?: {
    id: string;
    title: string;
    content: string;
    owner_id: string;
    updated_at: string;
    is_favorite: boolean;
  };
  
  // Joined sharer profile
  sharer?: {
    id: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export interface TeamMessageRead {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
}

// ====================================
// API REQUEST/RESPONSE TYPES
// ====================================

export interface CreateTeamRequest {
  name: string;
  description?: string;
  avatar_url?: string;
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
  avatar_url?: string;
  is_archived?: boolean;
}

export interface InviteMemberRequest {
  email?: string;
  username?: string;
  role?: TeamRole;
}

export interface UpdateMemberRoleRequest {
  role: TeamRole;
}

export interface SendMessageRequest {
  content: string;
  message_type?: MessageType;
  metadata?: Record<string, any>;
  parent_message_id?: string;
}

export interface ShareNoteRequest {
  note_id: string;
  permission?: NotePermission;
}

export interface UpdateSharedNoteRequest {
  permission: NotePermission;
}

// ====================================
// UI HELPER TYPES
// ====================================

export interface TeamWithUnreadCount extends Team {
  unread_count: number;
  member_count: number;
  last_message?: TeamMessage;
  my_role?: TeamRole;
}

export interface TeamStats {
  total_messages: number;
  total_members: number;
  shared_notes: number;
  created_at: string;
}

// ====================================
// REALTIME EVENT TYPES
// ====================================

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RealtimePayload<T = any> {
  eventType: RealtimeEventType;
  new: T;
  old: T;
  table: string;
}

export interface TeamRealtimeEvent {
  type: 'message' | 'member' | 'team_update' | 'note_share';
  payload: RealtimePayload;
}
