const express = require('express');
const router = express.Router();
const path = require('path');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const supabase = require(path.join(__dirname, '..', 'config', 'supabase'));

// Original POST / route removed in favor of payment-integrated version below

// Get Ads (Public - Approved and Active only)
router.get('/', async (req, res) => {
    try {
        const { tags } = req.query;
        const now = new Date().toISOString();

        // Start with basic query
        let query = supabase
            .from('ads')
            .select('id, title, content, media_url, destination_url, status, tags, start_date, end_date, created_at')
            .eq('status', 'approved');

        const { data: ads, error } = await query;

        if (error) {
            console.error('Database error fetching ads:', error);
            // Return empty array instead of 500 if the error is just missing columns (during migration)
            if (error.code === '42703') {
                return res.json([]);
            }
            throw error;
        }

        if (!ads) return res.json([]);

        // Filter by date window in memory for robustness and simplicity
        const activeAds = ads.filter(ad => {
            const start = ad.start_date ? new Date(ad.start_date) : null;
            const end = ad.end_date ? new Date(ad.end_date) : null;
            const current = new Date();
            
            const isStarted = !start || start <= current;
            const isNotEnded = !end || end >= current;
            
            return isStarted && isNotEnded;
        });

        // Filter by tags if provided
        let filteredAds = activeAds;
        if (tags) {
            const tagArray = tags.split(',').map(t => t.trim().toLowerCase());
            filteredAds = activeAds.filter(ad => {
                if (!ad.tags || !Array.isArray(ad.tags)) return false;
                return ad.tags.some(tag => tagArray.includes(tag.toLowerCase()));
            });
        }

        // Return most recent first
        filteredAds.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json(filteredAds);
    } catch (error) {
        console.error('Critical error in /api/ads:', error);
        res.status(500).json({ error: 'Failed to fetch ads', details: error.message });
    }
});

// Get Test Ad (Development/Testing) - DISABLED FOR PRODUCTION
// router.get('/test-ad', async (req, res) => {
//     try {
//         // Return a hardcoded test ad
//         const testAd = {
//             id: 'test-ad-001',
//             user_id: 'system',
//             title: '🚀 Test Advertisement',
//             content: 'This is a test ad for development. Click here to learn more about our amazing product!',
//             image_url: 'https://via.placeholder.com/150/6366f1/ffffff?text=Test+Ad',
//             link_url: 'https://example.com',
//             status: 'approved',
//             tags: ['test', 'development', 'demo'],
//             target_category: 'general',
//             views: 0,
//             clicks: 0,
//             created_at: new Date().toISOString()
//         };
//
//         res.json([testAd]);
//     } catch (error) {
//         console.error('Error returning test ad:', error);
//         res.status(500).json({ error: 'Failed to return test ad' });
//     }
// });

// Get My Ads (Authenticated User)
router.get('/my-ads', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { data, error } = await supabase
            .from('ads')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Error fetching my ads:', error);
        res.status(500).json({ error: 'Failed to fetch your ads' });
    }
});

// Admin: Get All Ads (For Moderation)
// Admin: Get All Ads (For Moderation)
router.get('/admin', requireAdmin, async (req, res) => {
    try {
        const { status } = req.query;

        let query = supabase
            .from('ads')
            .select('*')
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data: ads, error: adsError } = await query;

        if (adsError) throw adsError;

        if (!ads || ads.length === 0) {
            return res.json([]);
        }

        // Manually fetch profiles to avoid missing FK relationship issues
        const userIds = [...new Set(ads.map(ad => ad.user_id))];

        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', userIds);

        if (profilesError) {
            console.warn('Failed to fetch profiles for ads:', profilesError);
            // Return ads without profiles if profiles fetch fails
            return res.json(ads.map(ad => ({ ...ad, profiles: null })));
        }

        // Merge profiles into ads
        const adsWithProfiles = ads.map(ad => {
            const profile = profiles.find(p => p.id === ad.user_id);
            return {
                ...ad,
                profiles: profile || null
            };
        });

        res.json(adsWithProfiles);

    } catch (error) {
        console.error('Error fetching admin ads:', error);
        res.status(500).json({ error: 'Failed to fetch ads for admin' });
    }
});


// Admin: Update Status (Approve/Reject)
router.patch('/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['approved', 'rejected', 'pending', 'paused'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const { data, error } = await supabase
            .from('ads')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error updating ad status:', error);
        res.status(500).json({ error: 'Failed to update ad status' });
    }
});

const subscriptionController = require('../controllers/subscriptionController');

// Create Ad (Pro Only) -> Now starts as pending_payment
router.post('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { title, content, image_url, link_url, media_url, destination_url, tags, start_date, end_date } = req.body;

        // Check if user is Pro
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select('plan_tier, status')
            .eq('user_id', userId)
            .maybeSingle();

        // Allow if plan is pro and status is active
        const isPro = subscription && subscription.plan_tier === 'pro' && subscription.status === 'active';

        if (!isPro) {
            return res.status(403).json({ error: 'Only Pro users can create advertisements.' });
        }

        // Create Ad with status 'pending_payment'
        const { data, error } = await supabase
            .from('ads')
            .insert({
                user_id: userId,
                title,
                content,
                image_url: image_url || media_url, // Legacy + New
                link_url: link_url || destination_url, // Legacy + New
                media_url: media_url || image_url,
                destination_url: destination_url || link_url,
                start_date: start_date || new Date().toISOString(),
                end_date,
                tags: tags || [],
                status: 'pending_payment'
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating ad:', error);
        res.status(500).json({ error: 'Failed to create ad' });
    }
});

// Create Payment Session for Ad
router.post('/pay', requireAuth, subscriptionController.createAdCheckoutSession);

// Sync Payment Status (Manual fallback)
router.post('/sync-payment', requireAuth, subscriptionController.syncAdPayment);

module.exports = router;
