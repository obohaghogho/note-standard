const supabase = require("../config/database");
const realtime = require("../services/realtimeService");
const crypto = require('crypto');

// Helper to log activities
async function logActivity(teamId, userId, activityType, entityId, entityName, details = {}) {
  try {
    await supabase.from('workspace_activities').insert({
      team_id: teamId,
      user_id: userId,
      activity_type: activityType,
      entity_id: entityId,
      entity_name: entityName,
      details
    });
  } catch (err) {
    console.error('[ActivityLog] Failed to log activity:', err);
  }
}

// ====================================
// PROJECTS
// ====================================

exports.getProjects = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { data, error } = await supabase
      .from('projects')
      .select('*, owner:profiles(id, username, full_name, avatar_url)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.createProject = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { name, description, priority, owner_id, due_date, budget } = req.body;

    const { data, error } = await supabase
      .from('projects')
      .insert({
        team_id: teamId,
        name,
        description,
        priority: priority || 'medium',
        owner_id: owner_id || req.user.id,
        due_date,
        budget: budget || 0.00
      })
      .select('*, owner:profiles(id, username, full_name, avatar_url)')
      .single();

    if (error) throw error;

    await logActivity(teamId, req.user.id, 'project_created', data.id, data.name);
    try { await realtime.emit('to_room', teamId, 'project:created', data); } catch (e) { console.warn(e); }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.updateProject = async (req, res, next) => {
  try {
    const { teamId, projectId } = req.params;
    const updateFields = req.body;

    const { data, error } = await supabase
      .from('projects')
      .update(updateFields)
      .eq('id', projectId)
      .select('*, owner:profiles(id, username, full_name, avatar_url)')
      .single();

    if (error) throw error;

    await logActivity(teamId, req.user.id, 'project_updated', projectId, data.name, updateFields);
    try { await realtime.emit('to_room', teamId, 'project:updated', data); } catch (e) { console.warn(e); }

    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.deleteProject = async (req, res, next) => {
  try {
    const { teamId, projectId } = req.params;

    // Fetch name for log before delete
    const { data: project } = await supabase.from('projects').select('name').eq('id', projectId).single();

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) throw error;

    await logActivity(teamId, req.user.id, 'project_deleted', projectId, project?.name || 'Project');
    try { await realtime.emit('to_room', teamId, 'project:deleted', { projectId }); } catch (e) { console.warn(e); }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ====================================
// TASKS
// ====================================

exports.getTasks = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { data, error } = await supabase
      .from('tasks')
      .select('*, assignee:profiles(id, username, full_name, avatar_url)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.createTask = async (req, res, next) => {
  try {
    const { teamId, projectId } = req.params;
    const { title, description, priority, assigned_to, due_date, estimated_time, parent_task_id, recurrence } = req.body;

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        project_id: projectId,
        parent_task_id,
        title,
        description,
        priority: priority || 'medium',
        assigned_to,
        due_date,
        estimated_time: estimated_time || 0,
        recurrence
      })
      .select('*, assignee:profiles(id, username, full_name, avatar_url)')
      .single();

    if (error) throw error;

    await logActivity(teamId, req.user.id, 'task_created', data.id, data.title);
    try { await realtime.emit('to_room', teamId, 'task:created', data); } catch (e) { console.warn(e); }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.updateTask = async (req, res, next) => {
  try {
    const { teamId, taskId } = req.params;
    const updateFields = req.body;

    const { data, error } = await supabase
      .from('tasks')
      .update(updateFields)
      .eq('id', taskId)
      .select('*, assignee:profiles(id, username, full_name, avatar_url)')
      .single();

    if (error) throw error;

    const activityType = updateFields.status === 'done' ? 'task_completed' : 'task_updated';
    await logActivity(teamId, req.user.id, activityType, taskId, data.title, updateFields);
    try { await realtime.emit('to_room', teamId, 'task:updated', data); } catch (e) { console.warn(e); }

    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.deleteTask = async (req, res, next) => {
  try {
    const { teamId, taskId } = req.params;

    // Fetch details for activity log
    const { data: task } = await supabase.from('tasks').select('title').eq('id', taskId).single();

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;

    await logActivity(teamId, req.user.id, 'task_deleted', taskId, task?.title || 'Task');
    try { await realtime.emit('to_room', teamId, 'task:deleted', { taskId }); } catch (e) { console.warn(e); }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ====================================
// TASK CHECKLISTS & COMMENTS
// ====================================

exports.getTaskChecklist = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { data, error } = await supabase
      .from('task_checklists')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.addTaskChecklistItem = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { title } = req.body;

    const { data, error } = await supabase
      .from('task_checklists')
      .insert({
        task_id: taskId,
        title,
        completed: false
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.updateTaskChecklistItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { completed } = req.body;

    const { data, error } = await supabase
      .from('task_checklists')
      .update({ completed })
      .eq('id', itemId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.deleteTaskChecklistItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { error } = await supabase
      .from('task_checklists')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.getTaskComments = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { data, error } = await supabase
      .from('task_comments')
      .select('*, author:profiles(id, username, full_name, avatar_url)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.addTaskComment = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { content } = req.body;

    const { data, error } = await supabase
      .from('task_comments')
      .insert({
        task_id: taskId,
        user_id: req.user.id,
        content
      })
      .select('*, author:profiles(id, username, full_name, avatar_url)')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

// ====================================
// DEPARTMENTS
// ====================================

exports.getDepartments = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.createDepartment = async (req, res, next) => {
  try {
    const { name } = req.body;
    const { data, error } = await supabase
      .from('departments')
      .insert({ name })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.updateMemberDepartment = async (req, res, next) => {
  try {
    const { teamId, userId } = req.params;
    const { departmentId } = req.body;

    const { data, error } = await supabase
      .from('team_members')
      .update({ department_id: departmentId || null })
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// ====================================
// ROLES & CUSTOM PERMISSIONS
// ====================================

exports.getCustomRoles = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { data, error } = await supabase
      .from('workspace_roles')
      .select('*')
      .eq('team_id', teamId)
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.createCustomRole = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { name, permissions } = req.body;

    const { data, error } = await supabase
      .from('workspace_roles')
      .insert({
        team_id: teamId,
        name,
        permissions: permissions || {}
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.updateMemberCustomRole = async (req, res, next) => {
  try {
    const { teamId, userId } = req.params;
    const { customRoleId, role } = req.body;

    const updatePayload = {};
    if (customRoleId !== undefined) updatePayload.custom_role_id = customRoleId || null;
    if (role !== undefined)         updatePayload.role = role;

    const { data, error } = await supabase
      .from('team_members')
      .update(updatePayload)
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    await logActivity(teamId, req.user.id, 'role_changed', userId, 'Role Update', updatePayload);
    try { await realtime.emit('to_room', teamId, 'member:role_updated', { userId, ...updatePayload }); } catch (e) { console.warn(e); }

    res.json(data);
  } catch (err) {
    next(err);
  }
};

// ====================================
// FILE MANAGER
// ====================================

exports.getWorkspaceFiles = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { parentFolderId } = req.query;

    let query = supabase
      .from('workspace_files')
      .select('*, creator:profiles(id, username, full_name, avatar_url)')
      .eq('team_id', teamId)
      .eq('is_recycled', false);

    if (parentFolderId && parentFolderId !== 'null' && parentFolderId !== 'undefined') {
      query = query.eq('parent_folder_id', parentFolderId);
    } else {
      query = query.is('parent_folder_id', null);
    }

    const { data, error } = await query.order('is_folder', { ascending: false }).order('name', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.getRecycledFiles = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { data, error } = await supabase
      .from('workspace_files')
      .select('*, creator:profiles(id, username, full_name, avatar_url)')
      .eq('team_id', teamId)
      .eq('is_recycled', true)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.createFolder = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { name, parentFolderId } = req.body;

    const { data, error } = await supabase
      .from('workspace_files')
      .insert({
        team_id: teamId,
        parent_folder_id: parentFolderId || null,
        name,
        is_folder: true,
        created_by: req.user.id
      })
      .select('*, creator:profiles(id, username, full_name, avatar_url)')
      .single();

    if (error) throw error;

    await logActivity(teamId, req.user.id, 'folder_created', data.id, name);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.uploadFileMetadata = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { name, filePath, fileSize, mime_type, parentFolderId } = req.body;

    const { data, error } = await supabase
      .from('workspace_files')
      .insert({
        team_id: teamId,
        parent_folder_id: parentFolderId || null,
        name,
        file_path: filePath,
        file_size: fileSize || 0,
        mime_type,
        is_folder: false,
        created_by: req.user.id
      })
      .select('*, creator:profiles(id, username, full_name, avatar_url)')
      .single();

    if (error) throw error;

    await logActivity(teamId, req.user.id, 'file_uploaded', data.id, name);
    try { await realtime.emit('to_room', teamId, 'file:uploaded', data); } catch (e) { console.warn(e); }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.toggleFileFavorite = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const { isFavorite } = req.body;

    const { data, error } = await supabase
      .from('workspace_files')
      .update({ is_favorite: isFavorite })
      .eq('id', fileId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.recycleFile = async (req, res, next) => {
  try {
    const { teamId, fileId } = req.params;
    const { isRecycled } = req.body;

    const { data, error } = await supabase
      .from('workspace_files')
      .update({ is_recycled: isRecycled, updated_at: new Date().toISOString() })
      .eq('id', fileId)
      .select()
      .single();

    if (error) throw error;

    const activityType = isRecycled ? 'file_recycled' : 'file_restored';
    await logActivity(teamId, req.user.id, activityType, fileId, data.name);
    try { await realtime.emit('to_room', teamId, 'file:recycled', { fileId, isRecycled }); } catch (e) { console.warn(e); }

    res.json(data);
  } catch (err) {
    next(err);
  }
};

// ====================================
// MEETINGS
// ====================================

exports.getMeetings = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('team_id', teamId)
      .order('scheduled_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.createMeeting = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { title, description, agenda, scheduled_at, duration_minutes } = req.body;
    const roomId = `meeting_${teamId}_${Date.now()}`;

    const { data, error } = await supabase
      .from('meetings')
      .insert({
        team_id: teamId,
        title,
        description,
        agenda,
        scheduled_at,
        duration_minutes: duration_minutes || 30,
        room_id: roomId,
        status: 'scheduled'
      })
      .select()
      .single();

    if (error) throw error;

    await logActivity(teamId, req.user.id, 'meeting_scheduled', data.id, title);
    try { await realtime.emit('to_room', teamId, 'meeting:scheduled', data); } catch (e) { console.warn(e); }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.updateMeetingStatus = async (req, res, next) => {
  try {
    const { teamId, meetingId } = req.params;
    const { status } = req.body;

    const { data, error } = await supabase
      .from('meetings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', meetingId)
      .select()
      .single();

    if (error) throw error;

    await logActivity(teamId, req.user.id, `meeting_${status}`, meetingId, data.title);
    try { await realtime.emit('to_room', teamId, 'meeting:status_updated', data); } catch (e) { console.warn(e); }

    res.json(data);
  } catch (err) {
    next(err);
  }
};

// ====================================
// ANNOUNCEMENTS
// ====================================

exports.getAnnouncements = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    
    let query = supabase
      .from('announcements')
      .select('*');
      
    if (teamId && teamId !== 'null' && teamId !== 'undefined') {
      query = query.eq('team_id', teamId);
    } else {
      query = query.is('team_id', null); // Org-wide
    }

    const { data, error } = await query.order('scheduled_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.createAnnouncement = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { title, content, priority, audience, scheduled_at } = req.body;

    const { data, error } = await supabase
      .from('announcements')
      .insert({
        team_id: teamId || null,
        title,
        content,
        priority: priority || 'normal',
        audience: audience || 'all',
        scheduled_at: scheduled_at || new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    const logTeamId = teamId || null;
    await logActivity(logTeamId, req.user.id, 'announcement_posted', data.id, title);
    try { await realtime.emit('to_room', logTeamId || 'global', 'announcement:created', data); } catch (e) { console.warn(e); }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

// ====================================
// ACTIVITY FEED
// ====================================

exports.getWorkspaceActivities = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { data, error } = await supabase
      .from('workspace_activities')
      .select('*, actor:profiles(id, username, full_name, avatar_url)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

// ====================================
// WORKSPACE ANALYTICS
// ====================================

exports.getAnalytics = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const now = new Date();

    // Fetch project IDs to correctly count tasks
    const { data: projectRows } = await supabase
      .from('projects')
      .select('id')
      .eq('team_id', teamId);
    const projectIds = (projectRows || []).map(p => p.id);

    // Run aggregate queries in parallel
    const [membersRes, projectsRes, messagesRes, storageRes, pendingRes] = await Promise.all([
      supabase.from('team_members').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('team_messages').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('workspace_files').select('file_size').eq('team_id', teamId).eq('is_folder', false),
      supabase.from('team_invitations').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('status', 'pending')
    ]);

    // Task counts (total + completed)
    let totalTasks = 0, completedTasks = 0;
    if (projectIds.length > 0) {
      const [totalRes, doneRes] = await Promise.all([
        supabase.from('tasks').select('id', { count: 'exact', head: true }).in('project_id', projectIds),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).in('project_id', projectIds).eq('status', 'done')
      ]);
      totalTasks = totalRes.count || 0;
      completedTasks = doneRes.count || 0;
    }

    // Online members (profiles with is_online=true and membership in this team)
    const { data: onlineRows } = await supabase
      .from('team_members')
      .select('profiles!inner(is_online)')
      .eq('team_id', teamId)
      .eq('profiles.is_online', true);
    const onlineMembers = (onlineRows || []).length;

    // Activity counts per day — last 7 days
    const activities_by_day = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(now.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const { count } = await supabase
        .from('workspace_activities')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString());
      activities_by_day.push(count || 0);
    }

    // Completed tasks per week — last 4 weeks
    const tasks_by_week = [];
    if (projectIds.length > 0) {
      for (let i = 3; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (i * 7) - 6);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(now);
        weekEnd.setDate(now.getDate() - (i * 7));
        weekEnd.setHours(23, 59, 59, 999);

        const { count } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .in('project_id', projectIds)
          .eq('status', 'done')
          .gte('updated_at', weekStart.toISOString())
          .lte('updated_at', weekEnd.toISOString());
        tasks_by_week.push(count || 0);
      }
    } else {
      tasks_by_week.push(0, 0, 0, 0);
    }

    // Productivity score: (completed / total) * 100, fallback 0
    const productivity_score = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

    // Workspace health: 100 minus 5 per overdue task
    const { count: overdueCount } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .in('project_id', projectIds.length > 0 ? projectIds : ['__none__'])
      .lt('due_date', now.toISOString())
      .neq('status', 'done');
    const workspace_health = Math.max(0, 100 - ((overdueCount || 0) * 5));

    const totalStorageBytes = (storageRes.data || []).reduce((acc, f) => acc + parseInt(f.file_size || 0), 0);

    res.json({
      members: membersRes.count || 0,
      online_members: onlineMembers,
      projects: projectsRes.count || 0,
      tasks: totalTasks,
      completed_tasks: completedTasks,
      messages: messagesRes.count || 0,
      storage_bytes: totalStorageBytes,
      pending_invitations: pendingRes.count || 0,
      productivity_score,
      workspace_health,
      activities_by_day,
      tasks_by_week
    });
  } catch (err) {
    next(err);
  }
};

// ====================================
// WEBHOOK SECRET
// ====================================

exports.getWebhookSecret = (req, res) => {
  const { teamId } = req.params;
  const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
  const secret = crypto
    .createHmac('sha256', jwtSecret)
    .update(`webhook:${teamId}`)
    .digest('hex')
    .substring(0, 32);
  res.json({ secret: `whsec_${secret}` });
};
