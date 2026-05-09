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
