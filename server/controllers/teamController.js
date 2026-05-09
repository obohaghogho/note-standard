const supabase = require("../config/database");

exports.getMyTeams = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get teams the user is a member of
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
      return teamObj ? {
        ...teamObj,
        my_role: m.role
      } : null;
    }).filter(Boolean);

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
        profiles:sender_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('team_id', teamId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data.reverse());
  } catch (err) {
    next(err);
  }
};
exports.sendTeamMessage = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { content } = req.body;
    const senderId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
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
        content: content.trim(),
        is_deleted: false,
      })
      .select(`
        *,
        profiles:sender_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};
