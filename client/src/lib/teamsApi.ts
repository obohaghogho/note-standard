// ====================================
// TEAM COLLABORATION API
// Type-safe, rate-limited, error-handled
// ====================================

import { supabase, safeCall } from './supabaseSafe';
import type {
  Team,
  TeamMember,
  TeamMessage,
  SharedNote,
  TeamWithUnreadCount,
  CreateTeamRequest,
  UpdateTeamRequest,
  InviteMemberRequest,
  UpdateMemberRoleRequest,
  SendMessageRequest,
  ShareNoteRequest,
  UpdateSharedNoteRequest,
  TeamStats
} from '../types/teams';

// ====================================
// TEAMS
// ====================================

/**
 * Create a new team
 */
export async function createTeam(req: CreateTeamRequest): Promise<Team | null> {
  return safeCall<Team | null>('create-team', async () => {
    const { data, error } = await supabase.rpc('create_team_v2', {
      p_name: req.name,
      p_description: req.description,
      p_avatar_url: req.avatar_url
    });

    if (error) throw error;

    // The RPC returns SETOF teams, so we expect an array or a single object
    const team = Array.isArray(data) ? data[0] : data;
    return team;
  }, { minDelay: 1000 });
}

/**
 * Get all teams for current user
 */
export async function getMyTeams(): Promise<TeamWithUnreadCount[]> {
  const result = await safeCall<TeamWithUnreadCount[]>('get-my-teams', async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.warn('[TeamsAPI] No session found for getMyTeams');
      return [];
    }

    const userId = session.user.id;

    // 1. Get teams the user is a member of
    const { data: memberships, error: membershipsError } = await supabase
      .from('team_members')
      .select(`
        team_id,
        role,
        teams (
          id,
          name,
          description,
          avatar_url,
          owner_id,
          created_at,
          updated_at,
          is_archived
        )
      `)
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });

    if (membershipsError) throw membershipsError;
    if (!memberships) return [];

    // 2. Fetch unread counts and member counts for each team
    const teamsWithDetails = await Promise.all(
      memberships.map(async (membership: any) => {
        const team = membership.teams;
        if (!team) return null;

        // Use the RPC for unread count - much more stable than subqueries
        const { data: unreadCount, error: unreadError } = await supabase.rpc('get_unread_count', {
          p_team_id: team.id,
          p_user_id: userId
        });

        if (unreadError) {
          console.warn(`[TeamsAPI] Error fetching unread count for team ${team.id}:`, unreadError);
        }

        // Get member count
        const { count: memberCount, error: memberError } = await supabase
          .from('team_members')
          .select('id', { count: 'exact', head: true })
          .eq('team_id', team.id);

        if (memberError) {
          console.warn(`[TeamsAPI] Error fetching member count for team ${team.id}:`, memberError);
        }

        // Get last message
        const { data: lastMessage } = await supabase
          .from('team_messages')
          .select('*')
          .eq('team_id', team.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          ...team,
          unread_count: unreadCount ?? 0,
          member_count: memberCount ?? 0,
          last_message: lastMessage ?? undefined,
          my_role: membership.role,
        };
      })
    );

    return teamsWithDetails.filter(Boolean) as TeamWithUnreadCount[];
  }, { minDelay: 2000 });

  return result ?? [];
}

/**
 * Get a single team by ID
 */
export async function getTeam(teamId: string): Promise<Team | null> {
  return safeCall<Team | null>(`get-team-${teamId}`, async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (error) throw error;
    return data;
  }, { minDelay: 1000 });
}

/**
 * Update a team
 */
export async function updateTeam(teamId: string, req: UpdateTeamRequest): Promise<Team | null> {
  return safeCall<Team | null>(`update-team-${teamId}`, async () => {
    const { data, error } = await supabase
      .from('teams')
      .update(req)
      .eq('id', teamId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }, { minDelay: 1000 });
}

/**
 * Delete a team (owner only)
 */
export async function deleteTeam(teamId: string): Promise<boolean> {
  const result = await safeCall<boolean>(`delete-team-${teamId}`, async () => {
    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (error) throw error;
    return true;
  }, { minDelay: 1000 });

  return result ?? false;
}

// ====================================
// TEAM MEMBERS
// ====================================

/**
 * Get all members of a team
 */
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const result = await safeCall<TeamMember[]>(`get-team-members-${teamId}`, async () => {
    const { data, error } = await supabase
      .from('team_members')
      .select(`
        id,
        team_id,
        user_id,
        role,
        joined_at,
        invited_by,
        last_read_at,
        profiles:user_id (
          id,
          email,
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('team_id', teamId)
      .order('joined_at', { ascending: true });

    if (error) throw error;

    // Map profiles to proper structure
    return (data ?? []).map((member: any) => ({
      ...member,
      profile: member.profiles,
      profiles: undefined
    }));
  }, { minDelay: 1500 });

  return result ?? [];
}

/**
 * Invite a user to a team
 */
export async function inviteMember(teamId: string, req: InviteMemberRequest): Promise<TeamMember | null> {
  return safeCall<TeamMember | null>(`invite-member-${teamId}`, async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) throw new Error('Not authenticated');

    // Find user by email or username (case-insensitive)
    let invitee: any = null;

    if (req.email) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, username, email')
        .ilike('email', req.email.trim())
        .maybeSingle();
      invitee = data;
      if (!invitee) throw new Error(`User with email "${req.email}" not found.`);
    } else if (req.username) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, username, email')
        .ilike('username', req.username.trim())
        .maybeSingle();
      invitee = data;
      if (!invitee) throw new Error(`User with username "${req.username}" not found.`);
    }

    if (!invitee) throw new Error('Specify an email or username to invite.');

    const userId = invitee.id;

    // Check if user is already a member
    const { data: existing } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      throw new Error('This user is already a member of the team.');
    }

    // Add member
    const { data, error } = await supabase
      .from('team_members')
      .insert({
        team_id: teamId,
        user_id: userId,
        role: req.role ?? 'member',
        invited_by: sessionData.session.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    const inviteeName = invitee.full_name || invitee.username || invitee.email;

    // Send system message
    await supabase
      .from('team_messages')
      .insert({
        team_id: teamId,
        sender_id: sessionData.session.user.id,
        message_type: 'system',
        content: `invited ${inviteeName} to the team`,
        metadata: {
          event: 'member_joined',
          user_id: userId,
          user_name: inviteeName
        },
      });

    return data;
  }, { minDelay: 500 });
}

/**
 * Update member role
 */
export async function updateMemberRole(
  teamId: string,
  userId: string,
  req: UpdateMemberRoleRequest
): Promise<TeamMember | null> {
  return safeCall<TeamMember | null>(`update-member-${teamId}-${userId}`, async () => {
    const { data, error } = await supabase
      .from('team_members')
      .update({ role: req.role })
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }, { minDelay: 1000 });
}

/**
 * Remove a member from team
 */
export async function removeMember(teamId: string, userId: string): Promise<boolean> {
  const result = await safeCall<boolean>(`remove-member-${teamId}-${userId}`, async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);

    if (error) throw error;

    // Send system message
    await supabase
      .from('team_messages')
      .insert({
        team_id: teamId,
        sender_id: session.session.user.id,
        message_type: 'system',
        metadata: {
          event: 'member_left',
          user_id: userId,
        },
      });

    return true;
  }, { minDelay: 1000 });

  return result ?? false;
}

/**
 * Leave a team
 */
export async function leaveTeam(teamId: string): Promise<boolean> {
  const result = await safeCall<boolean>(`leave-team-${teamId}`, async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) throw new Error('Not authenticated');

    return removeMember(teamId, session.session.user.id);
  }, { minDelay: 1000 });

  return result ?? false;
}

// ====================================
// MESSAGES
// ====================================

/**
 * Get messages for a team (paginated)
 */
export async function getTeamMessages(
  teamId: string,
  limit = 50,
  before?: string
): Promise<TeamMessage[]> {
  const result = await safeCall<TeamMessage[]>(`get-messages-${teamId}`, async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return [];

    let query = supabase
      .from('team_messages')
      .select(`
        id,
        team_id,
        sender_id,
        content,
        message_type,
        metadata,
        created_at,
        updated_at,
        is_deleted,
        parent_message_id,
        profiles:sender_id (
          id,
          email,
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('team_id', teamId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Map and reverse (newest last)
    return ((data ?? []) as any[])
      .map((msg) => ({
        ...msg,
        sender: msg.profiles,
        profiles: undefined,
        isOwn: msg.sender_id === session.session?.user.id,
      }))
      .reverse();
  }, { minDelay: 1500 });

  return result ?? [];
}

/**
 * Send a message
 */
export async function sendMessage(teamId: string, req: SendMessageRequest): Promise<TeamMessage | null> {
  return safeCall<TeamMessage | null>(`send-message-${teamId}`, async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('team_messages')
      .insert({
        team_id: teamId,
        sender_id: session.session.user.id,
        content: req.content,
        message_type: req.message_type ?? 'text',
        metadata: req.metadata ?? {},
        parent_message_id: req.parent_message_id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }, { minDelay: 500 }); // Lower cooldown for chat
}

/**
 * Mark all messages in a team as read
 */
export async function markMessagesRead(teamId: string): Promise<boolean> {
  const result = await safeCall<boolean>(`mark-read-${teamId}`, async () => {
    const { error } = await supabase.rpc('mark_team_messages_read', {
      p_team_id: teamId,
    });

    if (error) throw error;
    return true;
  }, { minDelay: 1000 });

  return result ?? false;
}

// ====================================
// SHARED NOTES
// ====================================

/**
 * Share a note in a team
 */
export async function shareNote(teamId: string, req: ShareNoteRequest): Promise<SharedNote | null> {
  return safeCall<SharedNote | null>(`share-note-${teamId}`, async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) throw new Error('Not authenticated');

    // Create shared note record
    const { data: sharedNote, error: shareError } = await supabase
      .from('shared_notes')
      .insert({
        team_id: teamId,
        note_id: req.note_id,
        shared_by: session.session.user.id,
        permission: req.permission ?? 'read',
      })
      .select()
      .single();

    if (shareError) throw shareError;

    // Create a message for the share
    const { data: message } = await supabase
      .from('team_messages')
      .insert({
        team_id: teamId,
        sender_id: session.session.user.id,
        message_type: 'note_share',
        metadata: {
          note_id: req.note_id,
          permission: req.permission ?? 'read',
        },
      })
      .select()
      .single();

    // Update shared note with message ID
    if (message && sharedNote) {
      await supabase
        .from('shared_notes')
        .update({ message_id: message.id })
        .eq('id', sharedNote.id);
    }

    return sharedNote;
  }, { minDelay: 1000 });
}

/**
 * Get shared notes for a team
 */
export async function getSharedNotes(teamId: string): Promise<SharedNote[]> {
  const result = await safeCall<SharedNote[]>(`get-shared-notes-${teamId}`, async () => {
    const { data, error } = await supabase
      .from('shared_notes')
      .select(`
        id,
        team_id,
        note_id,
        shared_by,
        message_id,
        permission,
        shared_at,
        notes:note_id (
          id,
          title,
          content,
          owner_id,
          updated_at,
          is_favorite
        ),
        profiles:shared_by (
          id,
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('team_id', teamId)
      .order('shared_at', { ascending: false });

    if (error) throw error;

    return ((data ?? []) as any[]).map((sn) => ({
      ...sn,
      note: sn.notes,
      sharer: sn.profiles,
      notes: undefined,
      profiles: undefined,
    }));
  }, { minDelay: 1500 });

  return result ?? [];
}

/**
 * Update shared note permission
 */
export async function updateSharedNote(
  sharedNoteId: string,
  req: UpdateSharedNoteRequest
): Promise<SharedNote | null> {
  return safeCall<SharedNote | null>(`update-shared-note-${sharedNoteId}`, async () => {
    const { data, error } = await supabase
      .from('shared_notes')
      .update({ permission: req.permission })
      .eq('id', sharedNoteId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }, { minDelay: 1000 });
}

/**
 * Unshare a note
 */
export async function unshareNote(sharedNoteId: string): Promise<boolean> {
  const result = await safeCall<boolean>(`unshare-note-${sharedNoteId}`, async () => {
    const { error } = await supabase
      .from('shared_notes')
      .delete()
      .eq('id', sharedNoteId);

    if (error) throw error;
    return true;
  }, { minDelay: 1000 });

  return result ?? false;
}

// ====================================
// STATS
// ====================================

/**
 * Get team statistics
 */
export async function getTeamStats(teamId: string): Promise<TeamStats | null> {
  return safeCall<TeamStats | null>(`get-team-stats-${teamId}`, async () => {
    const [messagesRes, membersRes, notesRes, teamRes] = await Promise.all([
      supabase.from('team_messages').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('team_members').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('shared_notes').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('teams').select('created_at').eq('id', teamId).single(),
    ]);

    return {
      total_messages: messagesRes.count ?? 0,
      total_members: membersRes.count ?? 0,
      shared_notes: notesRes.count ?? 0,
      created_at: teamRes.data?.created_at ?? new Date().toISOString(),
    };
  }, { minDelay: 2000 });
}

/**
 * Upload an image for a team
 */
export async function uploadTeamImage(teamId: string, file: File): Promise<string | null> {
  return safeCall<string | null>(`upload-team-image-${teamId}`, async () => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${teamId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `images/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('team-assets')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Get public URL
    const { data } = supabase.storage
      .from('team-assets')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }, { minDelay: 500 });
}

// ====================================
// EXPORTS
// ====================================

export default {
  // Teams
  createTeam,
  getMyTeams,
  getTeam,
  updateTeam,
  deleteTeam,

  // Members
  getTeamMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  leaveTeam,

  // Messages
  getTeamMessages,
  sendMessage,
  uploadTeamImage,
  markMessagesRead,

  // Shared Notes
  shareNote,
  getSharedNotes,
  updateSharedNote,
  unshareNote,

  // Stats
  getTeamStats,
};
