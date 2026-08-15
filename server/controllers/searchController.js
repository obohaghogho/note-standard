const supabase = require('../config/database');
const logger = require('../utils/logger');

/**
 * Global Search Controller (B-02)
 * Searches across user's accessible notes, profiles, teams, and chat conversations.
 */
exports.globalSearch = async (req, res) => {
  try {
    const userId = req.user.id;
    const query = (req.query.q || req.query.query || '').trim();

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters long' });
    }

    const searchPattern = `%${query}%`;

    // 1. Search Notes (User's own notes or shared notes)
    const { data: notes, error: notesErr } = await supabase
      .from('notes')
      .select('id, title, content, updated_at')
      .or(`user_id.eq.${userId},is_public.eq.true`)
      .or(`title.ilike.${searchPattern},content.ilike.${searchPattern}`)
      .limit(10);

    if (notesErr) {
      logger.warn('[Search] Notes query warning:', notesErr.message);
    }

    // 2. Search Public Profiles / Users
    const { data: users, error: usersErr } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .neq('id', userId)
      .or(`username.ilike.${searchPattern},full_name.ilike.${searchPattern}`)
      .limit(10);

    if (usersErr) {
      logger.warn('[Search] Profiles query warning:', usersErr.message);
    }

    // 3. Search Teams / Workspaces
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('id, name, description')
      .or(`name.ilike.${searchPattern},description.ilike.${searchPattern}`)
      .limit(5);

    if (teamsErr) {
      logger.warn('[Search] Teams query warning:', teamsErr.message);
    }

    res.json({
      success: true,
      query,
      notes: notes || [],
      users: users || [],
      teams: teams || [],
      chats: [],
    });
  } catch (err) {
    logger.error('[Search] Global search error:', err);
    res.status(500).json({ error: 'Global search failed', message: err.message });
  }
};
