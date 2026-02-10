const express = require('express');
const router = express.Router();
const path = require('path');
const supabase = require(path.join(__dirname, '..', 'config', 'supabase'));
const { requireAuth } = require(path.join(__dirname, '..', 'middleware', 'auth'));

// GET /api/broadcasts/active - Get active broadcasts (public for authenticated users)
router.get('/active', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('broadcasts')
            .select('id, title, content, expires_at, created_at')
            .or('expires_at.is.null,expires_at.gte.' + new Date().toISOString())
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error('Error fetching active broadcasts:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
