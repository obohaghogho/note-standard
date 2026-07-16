const supabase = require('../config/database');
const eventBus = require('./eventBus');

/**
 * Log a user activity
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.actionType (e.g. 'liked_post', 'joined_space', 'created_note', 'earned_badge')
 * @param {string} [params.entityType]
 * @param {string} [params.entityId]
 * @param {Object} [params.metadata]
 */
exports.logActivity = async ({ userId, actionType, entityType = null, entityId = null, metadata = {} }) => {
    try {
        if (!userId || !actionType) {
            console.warn('[ActivityService] Missing userId or actionType');
            return null;
        }

        const { data, error } = await supabase
            .from('user_activity_log')
            .insert({
                user_id: userId,
                action_type: actionType,
                entity_type: entityType,
                entity_id: entityId,
                metadata: metadata
            })
            .select()
            .single();

        if (error) {
            // Check if it's because the table doesn't exist yet (migration not run)
            if (error.code === '42P01') {
                console.warn('[ActivityService] user_activity_log table does not exist. Please run migrations.');
                return null;
            }
            console.error('[ActivityService] Failed to log activity:', error);
            return null;
        }

        // Emit event for notification service or others to pick up
        eventBus.emit('activity_logged', data);

        return data;
    } catch (err) {
        console.error('[ActivityService] Error logging activity:', err);
        return null;
    }
};

/**
 * Get recent activity for a user
 */
exports.getUserActivity = async (userId, limit = 50) => {
    try {
        const { data, error } = await supabase
            .from('user_activity_log')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            if (error.code === '42P01') return [];
            throw error;
        }
        return data;
    } catch (err) {
        console.error('[ActivityService] Error getting user activity:', err);
        return [];
    }
};
