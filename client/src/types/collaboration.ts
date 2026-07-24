export interface Department {
  id: string;
  name: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface WorkspaceRole {
  id: string;
  team_id: string;
  name: string;
  permissions: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  team_id: string;
  name: string;
  description?: string;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  owner_id?: string;
  owner?: {
    id: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
  };
  due_date?: string;
  budget: number;
  progress: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  parent_task_id?: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigned_to?: string;
  assignee?: {
    id: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
  };
  due_date?: string;
  estimated_time: number; // in minutes
  actual_time: number; // in minutes
  recurrence?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskDependency {
  task_id: string;
  depends_on_task_id: string;
  dependency_type: 'fs' | 'ss' | 'ff' | 'sf';
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  author?: {
    id: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
  };
  created_at: string;
}

export interface TaskChecklistItem {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  created_at: string;
}

export interface WorkspaceFile {
  id: string;
  team_id: string;
  parent_folder_id?: string;
  name: string;
  file_path?: string; // null for folders
  file_size: number;
  mime_type?: string;
  version: number;
  is_folder: boolean;
  is_favorite: boolean;
  is_recycled: boolean;
  created_by?: string;
  creator?: {
    id: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface FileVersion {
  id: string;
  file_id: string;
  file_path: string;
  version: number;
  created_by?: string;
  created_at: string;
}

export interface Meeting {
  id: string;
  team_id: string;
  title: string;
  description?: string;
  agenda?: string;
  scheduled_at: string;
  duration_minutes: number;
  room_id: string;
  status: 'scheduled' | 'live' | 'ended';
  recording_url?: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingAttendance {
  meeting_id: string;
  user_id: string;
  joined_at: string;
  left_at?: string;
}

export interface Announcement {
  id: string;
  team_id?: string; // null for organization-wide
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  audience: 'all' | 'business' | 'team';
  scheduled_at: string;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementRead {
  announcement_id: string;
  user_id: string;
  read_at: string;
}

export interface WorkspaceActivity {
  id: string;
  team_id: string;
  user_id?: string;
  activity_type: string;
  entity_id?: string;
  entity_name?: string;
  details: Record<string, any>;
  actor?: {
    id: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
  };
  created_at: string;
}

export interface WorkspaceAnalytics {
  members: number;
  online_members: number;
  projects: number;
  tasks: number;
  completed_tasks: number;
  messages: number;
  storage_bytes: number;
  pending_invitations: number;
  productivity_score: number;
  workspace_health: number;
  activities_by_day: number[];  // Last 7 days
  tasks_by_week: number[];      // Last 4 weeks completed
}
