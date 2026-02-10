const path = require('path');
const supabase = require(path.join(__dirname, '..', 'config', 'supabaseAdmin'));

const analyticsService = {
    async aggregateDailyStats() {
        try {
            const today = new Date().toISOString().split('T')[0];

            // 1. Get IDs of users who opted IN to analytics
            const { data: users, error: userError } = await supabase
                .from('profiles')
                .select('id')
                .eq('preferences->>analytics', 'true');

            if (userError) throw userError;

            const userIds = users.map(u => u.id);

            if (userIds.length === 0) {
                console.log('No users opted into analytics.');
                return null;
            }

            // 2. Calculate Stats for these users only
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const startOfDayISO = startOfDay.toISOString();

            // A. Count active users (last_seen >= startOfDay)
            const { count: activeCount, error: activeError } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .in('id', userIds)
                .gte('last_seen', startOfDayISO);

            if (activeError) throw activeError;

            // B. Count notes created today by these users
            const { data: notes, error: notesError } = await supabase
                .from('notes')
                .select('tags')
                .in('owner_id', userIds)
                .gte('created_at', startOfDayISO);

            if (notesError) throw notesError;

            const notesCount = notes.length;

            // C. Aggregate tags
            const tagCounts = {};
            notes.forEach(note => {
                if (note.tags && Array.isArray(note.tags)) {
                    note.tags.forEach(tag => {
                        const t = tag.toLowerCase().trim();
                        if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
                    });
                }
            });

            // Get top 5 tags
            const topTags = Object.entries(tagCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {});

            // 3. Upsert into daily_stats
            const { data: stats, error: statsError } = await supabase
                .from('daily_stats')
                .upsert({
                    date: today,
                    total_active_users: activeCount || 0,
                    total_notes_created: notesCount || 0,
                    top_tags: topTags,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (statsError) throw statsError;

            return stats;

        } catch (error) {
            console.error('Aggregation failed:', error);
            throw error;
        }
    },

    async getLatestStats() {
        const { data, error } = await supabase
            .from('daily_stats')
            .select('*')
            .order('date', { ascending: false })
            .limit(7); // Last 7 days

        if (error) throw error;
        return data;
    }
};

module.exports = analyticsService;
