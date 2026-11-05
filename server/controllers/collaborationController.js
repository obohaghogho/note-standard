const supabase = require("../config/database");
const realtime = require("../services/realtimeService");
const crypto = require('crypto');

// UUID Validation Helper
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(val) {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

// Core workspace membership roles supported across authorization boundaries
const ALLOWED_CORE_ROLES = ['owner', 'admin', 'member'];

// NOTE ON CUSTOM ROLE PERMISSIONS:
// Custom-role permissions (stored in workspace_roles.permissions JSONB) are currently descriptive
// metadata for UI presentation and are not consumed by server middleware, RLS policies, or RPCs.
// They must not be treated as an authorization boundary. Core access control remains strictly
// governed by team_members.role ('owner', 'admin', 'member'). Any future enforcement of custom-role
// permissions requires a separately designed, explicitly allowlisted permission schema and comprehensive
// authorization review.

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

/**
 * Generalized Workspace Authorization Helper
 * Authenticates requester context, validates team UUID, checks active team membership,
 * and enforces required roles ('owner', 'admin', 'member').
 * Sends appropriate HTTP rejection response and returns null on failure.
 * Database lookup errors are thrown to caller to ensure fail-closed routing via next(err).
 * Returns { teamId, requesterId, role } on success.
 */
async function authorizeWorkspaceAccess(req, res, targetTeamId, requiredRoles = ['owner', 'admin', 'member']) {
  const requesterId = req.user?.id;
  if (!requesterId || !isValidUUID(requesterId)) {
    res.status(401).json({ error: 'Unauthorized: Valid authentication context required', code: 'UNAUTHORIZED' });
    return null;
  }

  const rawTeamId = targetTeamId || req.params?.teamId;
  if (!isValidUUID(rawTeamId)) {
    res.status(400).json({ error: 'Invalid or missing team ID', code: 'INVALID_TEAM_ID' });
    return null;
  }
  const teamId = rawTeamId.toLowerCase();

  const { data: membership, error: membershipError } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', requesterId)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    res.status(403).json({ error: 'Forbidden: Not a member of this workspace', code: 'NOT_TEAM_MEMBER' });
    return null;
  }

  if (!ALLOWED_CORE_ROLES.includes(membership.role)) {
    res.status(403).json({ error: 'Forbidden: Unsupported team membership role', code: 'INVALID_TEAM_ROLE' });
    return null;
  }

  if (requiredRoles && !requiredRoles.includes(membership.role)) {
    res.status(403).json({ error: 'Forbidden: Insufficient permissions for this operation', code: 'INSUFFICIENT_PERMISSIONS' });
    return null;
  }

  return { teamId, requesterId, role: membership.role };
}

// ====================================
// PROJECTS
// ====================================

exports.getProjects = async (req, res, next) => {
  try {
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { data, error } = await supabase
      .from('projects')
      .select('*, owner:profiles(id, username, full_name, avatar_url)')
      .eq('team_id', access.teamId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.createProject = async (req, res, next) => {
  try {
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { name, description, priority, owner_id, due_date, budget } = req.body;

    const { data, error } = await supabase
      .from('projects')
      .insert({
        team_id: access.teamId,
        name,
        description,
        priority: priority || 'medium',
        owner_id: owner_id || access.requesterId,
        due_date,
        budget: budget || 0.00
      })
      .select('*, owner:profiles(id, username, full_name, avatar_url)')
      .single();

    if (error) throw error;

    await logActivity(access.teamId, access.requesterId, 'project_created', data.id, data.name);
    try { await realtime.emit('to_room', access.teamId, 'project:created', data); } catch (e) { console.warn(e); }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.updateProject = async (req, res, next) => {
  try {
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { projectId } = req.params;
    if (!isValidUUID(projectId)) return res.status(400).json({ error: 'Invalid project ID format' });

    const { data: existingProject, error: findError } = await supabase
      .from('projects')
      .select('id, team_id, name, owner_id')
      .eq('id', projectId)
      .eq('team_id', access.teamId)
      .maybeSingle();

    if (findError) throw findError;
    if (!existingProject) return res.status(404).json({ error: 'Project not found in this workspace' });

    const updateFields = { ...(req.body || {}) };
    delete updateFields.id;
    delete updateFields.team_id;

    const { data, error } = await supabase
      .from('projects')
      .update(updateFields)
      .eq('id', projectId)
      .eq('team_id', access.teamId)
      .select('*, owner:profiles(id, username, full_name, avatar_url)')
      .single();

    if (error) throw error;

    await logActivity(access.teamId, access.requesterId, 'project_updated', projectId, data.name, updateFields);
    try { await realtime.emit('to_room', access.teamId, 'project:updated', data); } catch (e) { console.warn(e); }

    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.deleteProject = async (req, res, next) => {
  try {
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { projectId } = req.params;
    if (!isValidUUID(projectId)) return res.status(400).json({ error: 'Invalid project ID format' });

    const { data: project, error: findError } = await supabase
      .from('projects')
      .select('id, name, owner_id')
      .eq('id', projectId)
      .eq('team_id', access.teamId)
      .maybeSingle();

    if (findError) throw findError;
    if (!project) return res.status(404).json({ error: 'Project not found in this workspace' });

    if (!['owner', 'admin'].includes(access.role) && project.owner_id !== access.requesterId) {
      return res.status(403).json({ error: 'Forbidden: Only workspace admins or the project owner may delete a project' });
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('team_id', access.teamId);

    if (error) throw error;

    await logActivity(access.teamId, access.requesterId, 'project_deleted', projectId, project?.name || 'Project');
    try { await realtime.emit('to_room', access.teamId, 'project:deleted', { projectId }); } catch (e) { console.warn(e); }

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
    if (!isValidUUID(projectId)) return res.status(400).json({ error: 'Invalid project ID format' });
    const { data: project, error: projError } = await supabase.from('projects').select('team_id').eq('id', projectId).maybeSingle();
    if (projError) throw projError;
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const access = await authorizeWorkspaceAccess(req, res, project.team_id, ['owner', 'admin', 'member']);
    if (!access) return;
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
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { projectId } = req.params;
    if (!isValidUUID(projectId)) return res.status(400).json({ error: 'Invalid project ID format' });
    const { data: project, error: projError } = await supabase.from('projects').select('team_id').eq('id', projectId).eq('team_id', access.teamId).maybeSingle();
    if (projError) throw projError;
    if (!project) return res.status(404).json({ error: 'Project not found in this workspace' });
    const { title, description, priority, assigned_to, due_date, estimated_time, parent_task_id, recurrence } = req.body || {};
    if (!title || typeof title !== 'string' || title.trim() === '') return res.status(400).json({ error: 'Task title is required' });

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

    await logActivity(access.teamId, access.requesterId, 'task_created', data.id, data.title);
    try { await realtime.emit('to_room', access.teamId, 'task:created', data); } catch (e) { console.warn(e); }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.updateTask = async (req, res, next) => {
  try {
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { taskId } = req.params;
    if (!isValidUUID(taskId)) return res.status(400).json({ error: 'Invalid task ID format' });
    const { data: taskRecord, error: taskFindError } = await supabase.from('tasks').select('id, project_id, title').eq('id', taskId).maybeSingle();
    if (taskFindError) throw taskFindError;
    if (!taskRecord) return res.status(404).json({ error: 'Task not found' });
    const { data: project, error: projError } = await supabase.from('projects').select('team_id').eq('id', taskRecord.project_id).eq('team_id', access.teamId).maybeSingle();
    if (projError) throw projError;
    if (!project) return res.status(404).json({ error: 'Task does not belong to this workspace' });
    const updateFields = { ...(req.body || {}) };
    delete updateFields.id;
    delete updateFields.project_id;

    const { data, error } = await supabase
      .from('tasks')
      .update(updateFields)
      .eq('id', taskId)
      .select('*, assignee:profiles(id, username, full_name, avatar_url)')
      .single();

    if (error) throw error;

    const activityType = updateFields.status === 'done' ? 'task_completed' : 'task_updated';
    await logActivity(access.teamId, access.requesterId, activityType, taskId, data.title, updateFields);
    try { await realtime.emit('to_room', access.teamId, 'task:updated', data); } catch (e) { console.warn(e); }

    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.deleteTask = async (req, res, next) => {
  try {
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { taskId } = req.params;
    if (!isValidUUID(taskId)) return res.status(400).json({ error: 'Invalid task ID format' });
    const { data: task, error: taskFindError } = await supabase.from('tasks').select('id, project_id, title').eq('id', taskId).maybeSingle();
    if (taskFindError) throw taskFindError;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const { data: project, error: projError } = await supabase.from('projects').select('team_id').eq('id', task.project_id).eq('team_id', access.teamId).maybeSingle();
    if (projError) throw projError;
    if (!project) return res.status(404).json({ error: 'Task does not belong to this workspace' });

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;

    await logActivity(access.teamId, access.requesterId, 'task_deleted', taskId, task?.title || 'Task');
    try { await realtime.emit('to_room', access.teamId, 'task:deleted', { taskId }); } catch (e) { console.warn(e); }

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
    if (!isValidUUID(taskId)) return res.status(400).json({ error: 'Invalid task ID format' });
    const { data: task, error: taskError } = await supabase.from('tasks').select('project_id').eq('id', taskId).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const { data: project, error: projError } = await supabase.from('projects').select('team_id').eq('id', task.project_id).maybeSingle();
    if (projError) throw projError;
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const access = await authorizeWorkspaceAccess(req, res, project.team_id, ['owner', 'admin', 'member']);
    if (!access) return;
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
    if (!isValidUUID(taskId)) return res.status(400).json({ error: 'Invalid task ID format' });
    const { data: task, error: taskError } = await supabase.from('tasks').select('project_id').eq('id', taskId).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const { data: project, error: projError } = await supabase.from('projects').select('team_id').eq('id', task.project_id).maybeSingle();
    if (projError) throw projError;
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const access = await authorizeWorkspaceAccess(req, res, project.team_id, ['owner', 'admin', 'member']);
    if (!access) return;
    const { title } = req.body || {};
    if (!title || typeof title !== 'string' || title.trim() === '') return res.status(400).json({ error: 'Checklist item title is required' });

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
    if (!isValidUUID(itemId)) return res.status(400).json({ error: 'Invalid checklist item ID format' });
    const { data: item, error: itemError } = await supabase.from('task_checklists').select('task_id').eq('id', itemId).maybeSingle();
    if (itemError) throw itemError;
    if (!item) return res.status(404).json({ error: 'Checklist item not found' });
    const { data: task, error: taskError } = await supabase.from('tasks').select('project_id').eq('id', item.task_id).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return res.status(404).json({ error: 'Parent task not found' });
    const { data: project, error: projError } = await supabase.from('projects').select('team_id').eq('id', task.project_id).maybeSingle();
    if (projError) throw projError;
    if (!project) return res.status(404).json({ error: 'Parent project not found' });
    const access = await authorizeWorkspaceAccess(req, res, project.team_id, ['owner', 'admin', 'member']);
    if (!access) return;
    const { completed } = req.body || {};
    const { data, error } = await supabase
      .from('task_checklists')
      .update({ completed: Boolean(completed) })
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
    if (!isValidUUID(itemId)) return res.status(400).json({ error: 'Invalid checklist item ID format' });
    const { data: item, error: itemError } = await supabase.from('task_checklists').select('task_id').eq('id', itemId).maybeSingle();
    if (itemError) throw itemError;
    if (!item) return res.status(404).json({ error: 'Checklist item not found' });
    const { data: task, error: taskError } = await supabase.from('tasks').select('project_id').eq('id', item.task_id).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return res.status(404).json({ error: 'Parent task not found' });
    const { data: project, error: projError } = await supabase.from('projects').select('team_id').eq('id', task.project_id).maybeSingle();
    if (projError) throw projError;
    if (!project) return res.status(404).json({ error: 'Parent project not found' });
    const access = await authorizeWorkspaceAccess(req, res, project.team_id, ['owner', 'admin', 'member']);
    if (!access) return;
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
    if (!isValidUUID(taskId)) return res.status(400).json({ error: 'Invalid task ID format' });
    const { data: task, error: taskError } = await supabase.from('tasks').select('project_id').eq('id', taskId).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const { data: project, error: projError } = await supabase.from('projects').select('team_id').eq('id', task.project_id).maybeSingle();
    if (projError) throw projError;
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const access = await authorizeWorkspaceAccess(req, res, project.team_id, ['owner', 'admin', 'member']);
    if (!access) return;
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
    if (!isValidUUID(taskId)) return res.status(400).json({ error: 'Invalid task ID format' });
    const { data: task, error: taskError } = await supabase.from('tasks').select('project_id').eq('id', taskId).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const { data: project, error: projError } = await supabase.from('projects').select('team_id').eq('id', task.project_id).maybeSingle();
    if (projError) throw projError;
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const access = await authorizeWorkspaceAccess(req, res, project.team_id, ['owner', 'admin', 'member']);
    if (!access) return;
    const { content } = req.body || {};
    if (!content || typeof content !== 'string' || content.trim() === '') return res.status(400).json({ error: 'Comment content is required' });

    const { data, error } = await supabase
      .from('task_comments')
      .insert({
        task_id: taskId,
        user_id: access.requesterId,
        content: content.trim()
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
    const requesterId = req.user?.id;
    if (!requesterId || !isValidUUID(requesterId)) {
      return res.status(401).json({ error: 'Unauthorized: Valid authentication context required' });
    }
    const { data: profile, error: profError } = await supabase.from('profiles').select('role').eq('id', requesterId).maybeSingle();
    if (profError) throw profError;
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden: Global administrator privileges required' });
    }
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim() === '') return res.status(400).json({ error: 'Department name is required' });
    const { data, error } = await supabase
      .from('departments')
      .insert({ name: name.trim() })
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

    // 1. Validate UUIDs on path parameters
    if (!isValidUUID(teamId) || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid UUID format in route parameters' });
    }

    // 2. Validate payload shape and reject unexpected fields
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Malformed request body' });
    }

    const allowedKeys = ['departmentId'];
    const extraKeys = Object.keys(req.body).filter(k => !allowedKeys.includes(k));
    if (extraKeys.length > 0) {
      return res.status(400).json({ error: `Unexpected fields in request body: ${extraKeys.join(', ')}` });
    }

    // 3. Authenticate requester from verified authentication context
    const requesterId = req.user?.id;
    if (!requesterId || !isValidUUID(requesterId)) {
      return res.status(401).json({ error: 'Unauthorized: Valid authentication context required' });
    }

    // 4. Verify requester is currently an owner or admin of the specified team
    const { data: requesterMember, error: requesterError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', requesterId)
      .maybeSingle();

    if (requesterError) throw requesterError;
    if (!requesterMember || !['owner', 'admin'].includes(requesterMember.role)) {
      return res.status(403).json({ error: 'Forbidden: Requester must be a team owner or admin' });
    }

    // 5. Verify target user is currently a member of that same team
    const { data: targetMember, error: targetError } = await supabase
      .from('team_members')
      .select('id, user_id, team_id, department_id')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!targetMember) {
      return res.status(404).json({ error: 'Target user is not a member of this team' });
    }

    // 6. Validate department against global departments table or handle clearing
    const { departmentId } = req.body;
    let targetDeptId = null;

    if (departmentId !== null && departmentId !== undefined && departmentId !== '') {
      if (!isValidUUID(departmentId)) {
        return res.status(400).json({ error: 'Invalid UUID format for departmentId' });
      }

      const { data: deptRecord, error: deptError } = await supabase
        .from('departments')
        .select('id, name, status')
        .eq('id', departmentId)
        .maybeSingle();

      if (deptError) throw deptError;
      if (!deptRecord) {
        return res.status(400).json({ error: 'Department not found' });
      }
      if (deptRecord.status !== 'active') {
        return res.status(400).json({ error: 'Department is inactive or archived' });
      }

      targetDeptId = deptRecord.id;
    }

    // 7. Perform mutation and verify row affected
    const { data, error } = await supabase
      .from('team_members')
      .update({ department_id: targetDeptId })
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return res.status(404).json({ error: 'Target member record not found or update affected zero rows' });
    }

    const updatedRow = Array.isArray(data) ? data[0] : data;
    return res.json(updatedRow);
  } catch (err) {
    next(err);
  }
};

// ====================================
// ROLES & CUSTOM PERMISSIONS
// ====================================

exports.getCustomRoles = async (req, res, next) => {
  try {
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { data, error } = await supabase
      .from('workspace_roles')
      .select('*')
      .eq('team_id', access.teamId)
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
};

exports.createCustomRole = async (req, res, next) => {
  try {
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin']);
    if (!access) return;
    const { name, permissions } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim() === '') return res.status(400).json({ error: 'Role name is required' });

    const { data, error } = await supabase
      .from('workspace_roles')
      .insert({
        team_id: access.teamId,
        name: name.trim(),
        permissions: (permissions && typeof permissions === 'object') ? permissions : {}
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

    // 1. Validate UUIDs on path parameters
    if (!isValidUUID(teamId) || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid UUID format in route parameters' });
    }

    // 2. Validate payload shape and reject unexpected fields
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Malformed request body' });
    }

    // Explicitly reject any request containing the core 'role' property
    if ('role' in req.body) {
      return res.status(400).json({ error: 'Core workspace roles cannot be mutated via custom role endpoint' });
    }

    // Reject unexpected fields
    const allowedKeys = ['customRoleId'];
    const extraKeys = Object.keys(req.body).filter(k => !allowedKeys.includes(k));
    if (extraKeys.length > 0) {
      return res.status(400).json({ error: `Unexpected fields in request body: ${extraKeys.join(', ')}` });
    }

    // Require customRoleId property explicitly present (distinguish empty body from explicit clearing)
    if (!Object.prototype.hasOwnProperty.call(req.body, 'customRoleId')) {
      return res.status(400).json({ error: 'Missing required field: customRoleId' });
    }

    // 3. Authenticate requester from verified authentication context
    const requesterId = req.user?.id;
    if (!requesterId || !isValidUUID(requesterId)) {
      return res.status(401).json({ error: 'Unauthorized: Valid authentication context required' });
    }

    // 4. Verify requester is currently an owner or admin of the specified team
    const { data: requesterMember, error: requesterError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', requesterId)
      .maybeSingle();

    if (requesterError) throw requesterError;
    if (!requesterMember || !['owner', 'admin'].includes(requesterMember.role)) {
      return res.status(403).json({ error: 'Forbidden: Requester must be a team owner or admin' });
    }

    // 5. Verify target user is currently a member of that same team
    const { data: targetMember, error: targetError } = await supabase
      .from('team_members')
      .select('id, user_id, team_id, role, custom_role_id')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!targetMember) {
      return res.status(404).json({ error: 'Target user is not a member of this team' });
    }

    // 6. Validate custom role or handle clearing
    const { customRoleId } = req.body;
    let targetCustomRoleId = null;

    // Supported clearing values: explicit null or empty string
    if (customRoleId !== null && customRoleId !== '') {
      if (!isValidUUID(customRoleId)) {
        return res.status(400).json({ error: 'Invalid UUID format for customRoleId' });
      }

      const { data: roleRecord, error: roleError } = await supabase
        .from('workspace_roles')
        .select('id, team_id, name, permissions')
        .eq('id', customRoleId)
        .maybeSingle();

      if (roleError) throw roleError;
      if (!roleRecord) {
        return res.status(400).json({ error: 'Custom role not found' });
      }
      if (roleRecord.team_id !== teamId) {
        return res.status(400).json({ error: 'Custom role does not belong to this workspace' });
      }

      targetCustomRoleId = roleRecord.id;
    }

    // 7. Perform mutation and verify row affected
    const updatePayload = { custom_role_id: targetCustomRoleId };

    const { data, error } = await supabase
      .from('team_members')
      .update(updatePayload)
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return res.status(404).json({ error: 'Target member record not found or update affected zero rows' });
    }

    const updatedRow = Array.isArray(data) ? data[0] : data;

    // 8. Execute side effects only after confirmed successful database mutation
    await logActivity(teamId, requesterId, 'role_changed', userId, 'Role Update', updatePayload);
    try {
      await realtime.emit('to_room', teamId, 'member:role_updated', { userId, ...updatePayload });
    } catch (e) {
      console.warn('[Realtime] Failed to emit role update event:', e);
    }

    return res.json(updatedRow);
  } catch (err) {
    next(err);
  }
};

// ====================================
// FILE MANAGER
// ====================================

exports.getWorkspaceFiles = async (req, res, next) => {
  try {
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { teamId } = { teamId: access.teamId };
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
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { teamId } = { teamId: access.teamId };
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
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const teamId = access.teamId;
    const { name, parentFolderId } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim() === '') return res.status(400).json({ error: 'Folder name is required' });
    if (parentFolderId && parentFolderId !== 'null' && parentFolderId !== 'undefined') {
      if (!isValidUUID(parentFolderId)) return res.status(400).json({ error: 'Invalid parent folder ID format' });
      const { data: pf, error: pfErr } = await supabase.from('workspace_files').select('id').eq('id', parentFolderId).eq('team_id', teamId).eq('is_folder', true).maybeSingle();
      if (pfErr) throw pfErr;
      if (!pf) return res.status(404).json({ error: 'Parent folder not found in this workspace' });
    }

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
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const teamId = access.teamId;
    const { name, filePath, fileSize, mime_type, parentFolderId } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim() === '') return res.status(400).json({ error: 'File name is required' });
    if (parentFolderId && parentFolderId !== 'null' && parentFolderId !== 'undefined') {
      if (!isValidUUID(parentFolderId)) return res.status(400).json({ error: 'Invalid parent folder ID format' });
      const { data: pf, error: pfErr } = await supabase.from('workspace_files').select('id').eq('id', parentFolderId).eq('team_id', teamId).eq('is_folder', true).maybeSingle();
      if (pfErr) throw pfErr;
      if (!pf) return res.status(404).json({ error: 'Parent folder not found in this workspace' });
    }

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
    if (!isValidUUID(fileId)) return res.status(400).json({ error: 'Invalid file ID format' });
    const { data: file, error: findError } = await supabase.from('workspace_files').select('id, team_id').eq('id', fileId).maybeSingle();
    if (findError) throw findError;
    if (!file) return res.status(404).json({ error: 'File not found' });
    const access = await authorizeWorkspaceAccess(req, res, file.team_id, ['owner', 'admin', 'member']);
    if (!access) return;
    const { isFavorite } = req.body || {};

    const { data, error } = await supabase
      .from('workspace_files')
      .update({ is_favorite: Boolean(isFavorite) })
      .eq('id', fileId)
      .eq('team_id', file.team_id)
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
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { fileId } = req.params;
    if (!isValidUUID(fileId)) return res.status(400).json({ error: 'Invalid file ID format' });
    const { data: existingFile, error: findError } = await supabase.from('workspace_files').select('id, team_id, name, created_by').eq('id', fileId).eq('team_id', access.teamId).maybeSingle();
    if (findError) throw findError;
    if (!existingFile) return res.status(404).json({ error: 'File not found in this workspace' });
    if (!['owner', 'admin'].includes(access.role) && existingFile.created_by !== access.requesterId) {
      return res.status(403).json({ error: 'Forbidden: Only workspace admins or the file uploader may recycle/restore a file' });
    }
    const { isRecycled } = req.body || {};

    const { data, error } = await supabase
      .from('workspace_files')
      .update({ is_recycled: Boolean(isRecycled), updated_at: new Date().toISOString() })
      .eq('id', fileId)
      .eq('team_id', access.teamId)
      .select()
      .single();

    if (error) throw error;

    const activityType = isRecycled ? 'file_recycled' : 'file_restored';
    await logActivity(access.teamId, access.requesterId, activityType, fileId, data.name);
    try { await realtime.emit('to_room', access.teamId, 'file:recycled', { fileId, isRecycled }); } catch (e) { console.warn(e); }

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
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { teamId } = { teamId: access.teamId };
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
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { title, description, agenda, scheduled_at, duration_minutes } = req.body;
    const roomId = `meeting_${access.teamId}_${Date.now()}`;

    const { data, error } = await supabase
      .from('meetings')
      .insert({
        team_id: access.teamId,
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

    await logActivity(access.teamId, access.requesterId, 'meeting_scheduled', data.id, title);
    try { await realtime.emit('to_room', access.teamId, 'meeting:scheduled', data); } catch (e) { console.warn(e); }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.updateMeetingStatus = async (req, res, next) => {
  try {
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const { meetingId } = req.params;
    if (!isValidUUID(meetingId)) return res.status(400).json({ error: 'Invalid meeting ID format' });
    const { data: meeting, error: findError } = await supabase.from('meetings').select('id, team_id, title').eq('id', meetingId).eq('team_id', access.teamId).maybeSingle();
    if (findError) throw findError;
    if (!meeting) return res.status(404).json({ error: 'Meeting not found in this workspace' });
    const { status } = req.body || {};
    const validStatuses = ['scheduled', 'live', 'ended'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status. Allowed: scheduled, live, ended' });
    const { teamId } = { teamId: access.teamId };

    const { data, error } = await supabase
      .from('meetings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', meetingId)
      .eq('team_id', access.teamId)
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

// Announcement contract (matches migration 240 CHECK constraints and the client Announcement type).
const ANNOUNCEMENT_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const ANNOUNCEMENT_AUDIENCES = ['all', 'business', 'team'];
const ANNOUNCEMENT_MEMBER_AUDIENCES = ['all', 'team'];
const ANNOUNCEMENT_ALLOWED_FIELDS = ['title', 'content', 'priority', 'audience', 'scheduled_at'];
const ANNOUNCEMENT_TITLE_MAX = 255; // announcements.title is VARCHAR(255)

/**
 * Shared announcement gate: authenticated requester + valid team UUID + verified
 * membership of that exact team, using the authoritative team_members row.
 * Sends the rejection response itself and returns null when access is denied.
 * Membership-query errors are thrown so the caller routes them to next(err) (fail closed).
 * Returns { teamId (canonical lowercase), requesterId, role } on success.
 */
async function authorizeAnnouncementAccess(req, res) {
  const requesterId = req.user?.id;
  if (!requesterId || !isValidUUID(requesterId)) {
    res.status(401).json({ error: 'Unauthorized: Valid authentication context required', code: 'UNAUTHORIZED' });
    return null;
  }

  const rawTeamId = req.params?.teamId;
  if (!isValidUUID(rawTeamId)) {
    res.status(400).json({ error: 'Invalid or missing team ID', code: 'INVALID_TEAM_ID' });
    return null;
  }
  // Canonicalise so the persisted team_id and realtime room name are identical for any UUID casing.
  const teamId = rawTeamId.toLowerCase();

  const { data: membership, error: membershipError } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', requesterId)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    res.status(403).json({ error: 'Forbidden: Not a member of this team', code: 'NOT_TEAM_MEMBER' });
    return null;
  }

  if (!ALLOWED_CORE_ROLES.includes(membership.role)) {
    res.status(403).json({ error: 'Forbidden: Unsupported team membership role', code: 'INVALID_TEAM_ROLE' });
    return null;
  }

  return { teamId, requesterId, role: membership.role };
}

exports.getAnnouncements = async (req, res, next) => {
  try {
    const access = await authorizeAnnouncementAccess(req, res);
    if (!access) return;

    // Owners and admins may retrieve all supported audiences ('all', 'team', 'business');
    // ordinary members are restricted at the database query layer to 'all' and 'team' only.
    const isOwnerOrAdmin = access.role === 'owner' || access.role === 'admin';
    let query = supabase
      .from('announcements')
      .select('*')
      .eq('team_id', access.teamId);

    if (!isOwnerOrAdmin) {
      query = query.in('audience', ANNOUNCEMENT_MEMBER_AUDIENCES);
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
    // 1-3. Authenticated + valid team UUID + verified membership of that exact team.
    const access = await authorizeAnnouncementAccess(req, res);
    if (!access) return;
    const { teamId, requesterId, role } = access;

    // 4. Core membership role only (team_members.role). Custom roles / client input are never consulted.
    if (role !== 'owner' && role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden: Only workspace owners and admins can create announcements',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // 5. Server-side payload validation (runs only after authorization has succeeded).
    const body = req.body;
    const invalid = (message) =>
      res.status(400).json({ error: message, code: 'INVALID_ANNOUNCEMENT_PAYLOAD' });

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return invalid('Request body must be a JSON object');
    }

    const extraKeys = Object.keys(body).filter((k) => !ANNOUNCEMENT_ALLOWED_FIELDS.includes(k));
    if (extraKeys.length > 0) {
      return invalid(`Unexpected fields in request body: ${extraKeys.join(', ')}`);
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return invalid('Announcement title is required');
    if (title.length > ANNOUNCEMENT_TITLE_MAX) {
      return invalid(`Announcement title must be at most ${ANNOUNCEMENT_TITLE_MAX} characters`);
    }

    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) return invalid('Announcement content is required');

    const priority = body.priority === undefined ? 'normal' : body.priority;
    if (!ANNOUNCEMENT_PRIORITIES.includes(priority)) {
      return invalid(`Invalid priority. Allowed: ${ANNOUNCEMENT_PRIORITIES.join(', ')}`);
    }

    const audience = body.audience === undefined ? 'all' : body.audience;
    if (!ANNOUNCEMENT_AUDIENCES.includes(audience)) {
      return invalid(`Invalid audience. Allowed: ${ANNOUNCEMENT_AUDIENCES.join(', ')}`);
    }

    let scheduledAt = new Date().toISOString();
    if (body.scheduled_at !== undefined && body.scheduled_at !== null && body.scheduled_at !== '') {
      const parsed = typeof body.scheduled_at === 'string' ? new Date(body.scheduled_at) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return invalid('scheduled_at must be a valid ISO date string');
      }
      scheduledAt = body.scheduled_at;
    }

    // 6. Team-scoped persistence: team_id always comes from the validated route parameter.
    const { data, error } = await supabase
      .from('announcements')
      .insert({
        team_id: teamId,
        title,
        content,
        priority,
        audience,
        scheduled_at: scheduledAt
      })
      .select()
      .single();

    if (error) throw error;

    // 7. Side effects only after confirmed persistence. These are best-effort and are NOT
    // transactional with the insert.
    // For 'business' (owner/admin-only) announcements, suppress both the shared workspace
    // activity entry and the shared team-room realtime broadcast so ordinary members cannot
    // receive restricted announcement titles, IDs, or payloads.
    if (audience !== 'business') {
      await logActivity(teamId, requesterId, 'announcement_posted', data.id, title);
      try {
        await realtime.emit('to_room', teamId, 'announcement:created', data);
      } catch (e) {
        console.warn('[Realtime] Failed to emit announcement:created:', e);
      }
    }

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
    const access = await authorizeAnnouncementAccess(req, res);
    if (!access) return;

    const { teamId, role } = access;
    if (!ALLOWED_CORE_ROLES.includes(role)) {
      return res.status(403).json({
        error: 'Forbidden: Unsupported team membership role',
        code: 'INVALID_TEAM_ROLE'
      });
    }

    const { data, error } = await supabase
      .from('workspace_activities')
      .select('*, actor:profiles(id, username, full_name, avatar_url)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const activities = data || [];
    if (role === 'owner' || role === 'admin') {
      return res.json(activities);
    }

    const announcementIds = Array.from(
      new Set(
        activities
          .filter((act) => act && act.activity_type === 'announcement_posted' && isValidUUID(act.entity_id))
          .map((act) => act.entity_id)
      )
    );

    let allowedAnnouncementIds = new Set();
    if (announcementIds.length > 0) {
      const { data: allowedAnnouncements, error: announcementError } = await supabase
        .from('announcements')
        .select('id')
        .eq('team_id', teamId)
        .in('id', announcementIds)
        .in('audience', ANNOUNCEMENT_MEMBER_AUDIENCES);

      if (announcementError) throw announcementError;

      allowedAnnouncementIds = new Set(
        (allowedAnnouncements || [])
          .filter((ann) => ann && isValidUUID(ann.id))
          .map((ann) => ann.id.toLowerCase())
      );
    }

    const filteredActivities = activities.filter((act) => {
      if (!act || act.activity_type !== 'announcement_posted') {
        return true;
      }
      if (!isValidUUID(act.entity_id)) {
        return false;
      }
      return allowedAnnouncementIds.has(act.entity_id.toLowerCase());
    });

    res.json(filteredActivities);
  } catch (err) {
    next(err);
  }
};

// ====================================
// WORKSPACE ANALYTICS
// ====================================

exports.getAnalytics = async (req, res, next) => {
  try {
    const access = await authorizeWorkspaceAccess(req, res, req.params?.teamId, ['owner', 'admin', 'member']);
    if (!access) return;
    const teamId = access.teamId;
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
// WEBHOOK SECRET (RETIRED - PHASE 2.0U.5A)
// ====================================

exports.getWebhookSecret = (req, res) => {
  return res.status(410).json({
    success: false,
    code: 'WORKSPACE_WEBHOOKS_UNAVAILABLE',
    message: 'Workspace webhook integrations are not currently available.'
  });
};
