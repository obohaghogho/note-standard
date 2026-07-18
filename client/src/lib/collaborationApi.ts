import api from '../api/axiosInstance';
import type {
  Project,
  Task,
  TaskChecklistItem,
  TaskComment,
  Department,
  WorkspaceRole,
  WorkspaceFile,
  Meeting,
  Announcement,
  WorkspaceActivity,
  WorkspaceAnalytics
} from '../types/collaboration';

// NOTE: axios baseURL is already `${API_URL}/api`, so paths here start with /collaboration/...

// ====================================
// PROJECTS
// ====================================

export async function getProjects(teamId: string): Promise<Project[]> {
  const res = await api.get(`/collaboration/teams/${teamId}/projects`);
  return res.data;
}

export async function createProject(teamId: string, payload: Partial<Project>): Promise<Project> {
  const res = await api.post(`/collaboration/teams/${teamId}/projects`, payload);
  return res.data;
}

export async function updateProject(teamId: string, projectId: string, payload: Partial<Project>): Promise<Project> {
  const res = await api.patch(`/collaboration/teams/${teamId}/projects/${projectId}`, payload);
  return res.data;
}

export async function deleteProject(teamId: string, projectId: string): Promise<boolean> {
  const res = await api.delete(`/collaboration/teams/${teamId}/projects/${projectId}`);
  return res.data?.success || false;
}

// ====================================
// TASKS
// ====================================

export async function getTasks(projectId: string): Promise<Task[]> {
  const res = await api.get(`/collaboration/projects/${projectId}/tasks`);
  return res.data;
}

export async function createTask(teamId: string, projectId: string, payload: Partial<Task>): Promise<Task> {
  const res = await api.post(`/collaboration/teams/${teamId}/projects/${projectId}/tasks`, payload);
  return res.data;
}

export async function updateTask(teamId: string, taskId: string, payload: Partial<Task>): Promise<Task> {
  const res = await api.patch(`/collaboration/teams/${teamId}/tasks/${taskId}`, payload);
  return res.data;
}

export async function deleteTask(teamId: string, taskId: string): Promise<boolean> {
  const res = await api.delete(`/collaboration/teams/${teamId}/tasks/${taskId}`);
  return res.data?.success || false;
}

// ====================================
// TASK CHECKLISTS & COMMENTS
// ====================================

export async function getTaskChecklist(taskId: string): Promise<TaskChecklistItem[]> {
  const res = await api.get(`/collaboration/tasks/${taskId}/checklist`);
  return res.data;
}

export async function addTaskChecklistItem(taskId: string, title: string): Promise<TaskChecklistItem> {
  const res = await api.post(`/collaboration/tasks/${taskId}/checklist`, { title });
  return res.data;
}

export async function updateTaskChecklistItem(itemId: string, completed: boolean): Promise<TaskChecklistItem> {
  const res = await api.patch(`/collaboration/checklist/${itemId}`, { completed });
  return res.data;
}

export async function deleteTaskChecklistItem(itemId: string): Promise<boolean> {
  const res = await api.delete(`/collaboration/checklist/${itemId}`);
  return res.data?.success || false;
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const res = await api.get(`/collaboration/tasks/${taskId}/comments`);
  return res.data;
}

export async function addTaskComment(taskId: string, content: string): Promise<TaskComment> {
  const res = await api.post(`/collaboration/tasks/${taskId}/comments`, { content });
  return res.data;
}

// ====================================
// DEPARTMENTS
// ====================================

export async function getDepartments(): Promise<Department[]> {
  const res = await api.get('/collaboration/departments');
  return res.data;
}

export async function createDepartment(name: string): Promise<Department> {
  const res = await api.post('/collaboration/departments', { name });
  return res.data;
}

export async function updateMemberDepartment(teamId: string, userId: string, departmentId: string | null): Promise<any> {
  const res = await api.patch(`/collaboration/teams/${teamId}/members/${userId}/department`, { departmentId });
  return res.data;
}

// ====================================
// ROLES
// ====================================

export async function getCustomRoles(teamId: string): Promise<WorkspaceRole[]> {
  const res = await api.get(`/collaboration/teams/${teamId}/roles`);
  return res.data;
}

export async function createCustomRole(teamId: string, name: string, permissions: Record<string, boolean>): Promise<WorkspaceRole> {
  const res = await api.post(`/collaboration/teams/${teamId}/roles`, { name, permissions });
  return res.data;
}

export async function updateMemberCustomRole(teamId: string, userId: string, payload: { customRoleId?: string | null; role?: string }): Promise<any> {
  const res = await api.patch(`/collaboration/teams/${teamId}/members/${userId}/role`, payload);
  return res.data;
}

// ====================================
// FILES
// ====================================

export async function getWorkspaceFiles(teamId: string, parentFolderId?: string | null): Promise<WorkspaceFile[]> {
  const res = await api.get(`/collaboration/teams/${teamId}/files`, {
    params: { parentFolderId }
  });
  return res.data;
}

export async function getRecycledFiles(teamId: string): Promise<WorkspaceFile[]> {
  const res = await api.get(`/collaboration/teams/${teamId}/files/recycled`);
  return res.data;
}

export async function createFolder(teamId: string, name: string, parentFolderId?: string | null): Promise<WorkspaceFile> {
  const res = await api.post(`/collaboration/teams/${teamId}/folders`, { name, parentFolderId });
  return res.data;
}

export async function uploadFileMetadata(
  teamId: string,
  payload: { name: string; filePath: string; fileSize: number; mime_type: string; parentFolderId?: string | null }
): Promise<WorkspaceFile> {
  const res = await api.post(`/collaboration/teams/${teamId}/files`, payload);
  return res.data;
}

export async function toggleFileFavorite(fileId: string, isFavorite: boolean): Promise<WorkspaceFile> {
  const res = await api.patch(`/collaboration/files/${fileId}/favorite`, { isFavorite });
  return res.data;
}

export async function recycleFile(teamId: string, fileId: string, isRecycled: boolean): Promise<WorkspaceFile> {
  const res = await api.patch(`/collaboration/teams/${teamId}/files/${fileId}/recycle`, { isRecycled });
  return res.data;
}

// ====================================
// MEETINGS
// ====================================

export async function getMeetings(teamId: string): Promise<Meeting[]> {
  const res = await api.get(`/collaboration/teams/${teamId}/meetings`);
  return res.data;
}

export async function createMeeting(teamId: string, payload: Partial<Meeting>): Promise<Meeting> {
  const res = await api.post(`/collaboration/teams/${teamId}/meetings`, payload);
  return res.data;
}

export async function updateMeetingStatus(teamId: string, meetingId: string, status: 'scheduled' | 'live' | 'ended'): Promise<Meeting> {
  const res = await api.patch(`/collaboration/teams/${teamId}/meetings/${meetingId}/status`, { status });
  return res.data;
}

// ====================================
// ANNOUNCEMENTS
// ====================================

export async function getAnnouncements(teamId?: string | null): Promise<Announcement[]> {
  const res = await api.get(`/collaboration/teams/${teamId || 'null'}/announcements`);
  return res.data;
}

export async function createAnnouncement(teamId: string | null, payload: Partial<Announcement>): Promise<Announcement> {
  const res = await api.post(`/collaboration/teams/${teamId || 'null'}/announcements`, payload);
  return res.data;
}

// ====================================
// ACTIVITIES
// ====================================

export async function getWorkspaceActivities(teamId: string): Promise<WorkspaceActivity[]> {
  const res = await api.get(`/collaboration/teams/${teamId}/activities`);
  return res.data;
}

// ====================================
// ANALYTICS
// ====================================

export async function getWorkspaceAnalytics(teamId: string): Promise<WorkspaceAnalytics> {
  const res = await api.get(`/collaboration/teams/${teamId}/analytics`);
  return res.data;
}

// ====================================
// WEBHOOK SECRET
// ====================================

export async function getWorkspaceWebhookSecret(teamId: string): Promise<string> {
  const res = await api.get(`/collaboration/teams/${teamId}/webhook-secret`);
  return res.data.secret;
}
