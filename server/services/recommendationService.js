const supabase = require('../config/database');

/**
 * Base Recommendation Service
 * In Phase 0, this uses simple heuristics based on the user's activity log.
 * In Phase 3, this will be upgraded to integrate with Groq AI for deep personalization.
 */

exports.getRecommendedTags = async (userId) => {
    try {
        // Simple heuristic: get recent tags the user interacted with
        const { data, error } = await supabase
            .from('user_activity_log')
            .select('metadata')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            if (error.code === '42P01') return []; // table not migrated yet
            throw error;
        }

        const tagCounts = {};
        data.forEach(activity => {
            if (activity.metadata && Array.isArray(activity.metadata.tags)) {
                activity.metadata.tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });

        // Sort by frequency
        return Object.keys(tagCounts)
            .sort((a, b) => tagCounts[b] - tagCounts[a])
            .slice(0, 10);

    } catch (error) {
        console.error('[RecommendationService] Error getting recommended tags:', error);
        return [];
    }
};

exports.getRecommendedPosts = async (userId, limit = 10) => {
    try {
        // Phase 0: Just return recent trending posts (e.g. most viewed/liked)
        const { data, error } = await supabase
            .from('community_posts')
            .select('*, profiles!author_id(username, avatar_url)')
            .eq('visibility', 'public')
            .order('views_count', { ascending: false })
            .limit(limit);

        if (error) {
            if (error.code === '42P01') return []; // table not migrated yet
            throw error;
        }

        return data;
    } catch (error) {
        console.error('[RecommendationService] Error getting recommended posts:', error);
        return [];
    }
};
