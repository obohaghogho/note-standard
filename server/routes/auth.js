const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// Signup/Login handled by Supabase Client on Frontend mostly.
// Backend might handle profile syncing or custom claims.

router.post('/sync-profile', (req, res) => {
    // Logic to sync user profile if needed
    res.json({ message: 'Profile sync endpoint' });
});

// Accept terms endpoint for post-OAuth signup
router.post('/accept-terms', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];

        // Verify the user's JWT token
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid authentication token' });
        }

        // Update the user's profile with terms acceptance timestamp
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ terms_accepted_at: new Date().toISOString() })
            .eq('id', user.id);

        if (updateError) {
            console.error('Error updating terms acceptance:', updateError);
            return res.status(500).json({ error: 'Failed to update terms acceptance' });
        }

        res.json({
            success: true,
            message: 'Terms accepted successfully',
            terms_accepted_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('Error in accept-terms endpoint:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

