const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { requireAuth } = require('../middleware/authMiddleware');

// Search users by username or full_name
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    const requestingUserId = req.user.id;

    if (!q || q.trim().length < 1) {
      return res.json([]);
    }

    const query = q.trim().toLowerCase();

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, plan_tier, is_verified')
      .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
      .neq('id', requestingUserId) // exclude self
      .limit(20);

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error('[Users] Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
