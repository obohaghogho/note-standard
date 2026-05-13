const supabase = require("../config/database");
const realtime = require("../services/realtimeService");

exports.getMyTeams = async (req, res, next) => {
  try {
    const userId = req.user.id;

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

    const teams = (memberships || []).map(m => {
      const teamObj = Array.isArray(m.teams) ? m.teams[0] : m.teams;
      return teamObj ? { ...teamObj, my_role: m.role } : null;
    }).filter(Boolean).filter(t => t.name !== "Support Chat" && !(t.name && t.name.toLowerCase().includes("support team")));

    res.json(teams);
  } catch (err) {
    next(err);
  }
};

exports.getTeamMessages = async (req, res, next) => {
  try {
    const { teamId } = req.params;

    const { data, error } = await supabase
      .from('team_messages')
      .select(`
        *,
        attachment:media_attachments(*),
        reply_to:team_messages!reply_to_id(id, content, sender_id, created_at),
        profiles:sender_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      if (error.code === '42703') {
        const { data: retryData, error: retryError } = await supabase
          .from('team_messages')
          .select('*, profiles:sender_id(id, username, full_name, avatar_url)')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(50);
        if (retryError) throw retryError;
        return res.json((retryData || []).reverse());
      }
      throw error;
    }
    res.json((data || []).reverse());
  } catch (err) {
    next(err);
  }
};

exports.sendTeamMessage = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { content, replyToId } = req.body;
    const senderId = req.user.id;

    if (!content && !req.body.attachmentId) {
      return res.status(400).json({ error: 'Message content or attachment is required' });
    }

    // Verify user is a member of this team
    const { data: membership, error: memberError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', senderId)
      .single();

    if (memberError || !membership) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    const { data, error } = await supabase
      .from('team_messages')
      .insert({
        team_id: teamId,
        sender_id: senderId,
        content: content ? content.trim() : '',
        attachment_id: req.body.attachmentId || null,
        reply_to_id: replyToId || null,
      })
      .select(`
        *,
        attachment:media_attachments(*),
        reply_to:team_messages!reply_to_id(id, content, sender_id, created_at),
        profiles:sender_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      // Fallback for missing column (e.g. attachment_id / reply_to_id)
      if (error.code === '42703') {
        const { data: retryData, error: retryError } = await supabase
          .from('team_messages')
          .insert({
            team_id: teamId,
            sender_id: senderId,
            content: content ? content.trim() : '',
          })
          .select('*, profiles:sender_id(*)')
          .single();
        if (retryError) throw retryError;
        try { await realtime.emit('to_room', teamId, 'team_message', retryData); } catch (e) { console.warn(e); }
        return res.status(201).json(retryData);
      }
      throw error;
    }

    try { await realtime.emit('to_room', teamId, 'team_message', data); } catch (e) { console.warn(e); }
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

exports.editTeamMessage = async (req, res, next) => {
  try {
    const { teamId, messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Try with is_edited flag first
    const { data, error } = await supabase
      .from('team_messages')
      .update({ content: content.trim(), is_edited: true })
      .eq('id', messageId)
      .eq('sender_id', userId)
      .select(`
        *,
        attachment:media_attachments(*),
        reply_to:team_messages!reply_to_id(id, content, sender_id, created_at),
        profiles:sender_id (id, username, full_name, avatar_url)
      `)
      .single();

    if (error) {
      // Fallback if is_edited column is missing
      if (error.code === '42703') {
        const { data: retryData, error: retryError } = await supabase
          .from('team_messages')
          .update({ content: content.trim() })
          .eq('id', messageId)
          .eq('sender_id', userId)
          .select('*, profiles:sender_id(*)')
          .single();
        if (retryError) throw retryError;
        try { await realtime.emit('to_room', teamId, 'team_message_edited', retryData); } catch (e) { console.warn(e); }
        return res.json(retryData);
      }
      throw error;
    }

    try { await realtime.emit('to_room', teamId, 'team_message_edited', data); } catch (e) { console.warn(e); }
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.deleteTeamMessage = async (req, res, next) => {
  try {
    const { teamId, messageId } = req.params;
    const userId = req.user.id;

    // Fetch to verify ownership
    const { data: message, error: fetchError } = await supabase
      .from('team_messages')
      .select('sender_id')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.sender_id !== userId) {
      // Allow team owner to delete too
      const { data: team } = await supabase
        .from('teams')
        .select('owner_id')
        .eq('id', teamId)
        .single();

      if (team?.owner_id !== userId) {
        return res.status(403).json({ error: 'Permission denied' });
      }
    }

    // Soft-delete with fallback to hard-delete
    const { error: deleteError } = await supabase
      .from('team_messages')
      .update({ is_deleted: true, content: 'This message was deleted' })
      .eq('id', messageId);

    if (deleteError) {
      if (deleteError.code === '42703') {
        // is_deleted column missing — hard delete
        const { error: hardErr } = await supabase
          .from('team_messages')
          .delete()
          .eq('id', messageId);
        if (hardErr) throw hardErr;
      } else {
        throw deleteError;
      }
    }

    try { await realtime.emit('to_room', teamId, 'team_message_deleted', { messageId, teamId }); } catch (e) { console.warn(e); }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
