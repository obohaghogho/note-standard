const path = require("path");
const supabase = require(path.join(__dirname, "..", "config", "supabaseAdmin"));

const analyticsService = {
  async aggregateDailyStats() {
    try {
      const today = new Date().toISOString().split("T")[0];

      // 1. Get IDs of users who have user_consent enabled
      const { data: users, error: userError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_consent", true);

      if (userError) throw userError;

      const userIds = (users || []).map((u) => u.id);

      // 2. Calculate Stats
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startOfDayISO = startOfDay.toISOString();

      let activeCount = 0;
      let notesCount = 0;
      let topTags = {};

      if (userIds.length > 0) {
        // A. Count active users (last_active_at >= startOfDay OR last_seen >= startOfDay)
        const { count, error: activeError } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .in("id", userIds)
          .or(
            `last_active_at.gte.${startOfDayISO},last_seen.gte.${startOfDayISO}`,
          );

        if (activeError) throw activeError;
        activeCount = count || 0;

        // B. Count notes created today by these users
        const { data: notes, error: notesError } = await supabase
          .from("notes")
          .select("tags")
          .in("owner_id", userIds)
          .gte("created_at", startOfDayISO);

        if (notesError) throw notesError;

        notesCount = notes ? notes.length : 0;

        // C. Aggregate tags
        const tagCounts = {};
        notes?.forEach((note) => {
          if (note.tags && Array.isArray(note.tags)) {
            note.tags.forEach((tag) => {
              const t = tag.toLowerCase().trim();
              if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
            });
          }
        });

        // Get top 10 tags
        topTags = Object.entries(tagCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {});
      }

      // 3. Upsert into daily_stats
      const { data: stats, error: statsError } = await supabase
        .from("daily_stats")
        .upsert({
          date: today,
          total_active_users: activeCount,
          total_notes_created: notesCount,
          top_tags: topTags,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (statsError) throw statsError;

      return stats;
    } catch (error) {
      console.error("Aggregation failed:", error);
      throw error;
    }
  },

  async getLatestStats() {
    try {
      const { data, error } = await supabase
        .from("daily_stats")
        .select("*")
        .order("date", { ascending: false })
        .limit(7);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error("Error fetching latest stats:", err);
      return [];
    }
  },

  async getRealtimeStats() {
    try {
      // 1. Get IDs of users who have user_consent enabled
      const { data: users, error: userError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_consent", true);

      if (userError || !users) return null;
      const userIds = users.map((u) => u.id);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startOfDayISO = startOfDay.toISOString();

      let activeCount = 0;
      let notesCount = 0;
      let topTags = {};

      if (userIds.length > 0) {
        // A. Count active users
        const { count } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .in("id", userIds)
          .or(
            `last_active_at.gte.${startOfDayISO},last_seen.gte.${startOfDayISO}`,
          );
        activeCount = count || 0;

        // B. Count notes created today
        const { data: notes } = await supabase
          .from("notes")
          .select("tags")
          .in("owner_id", userIds)
          .gte("created_at", startOfDayISO);

        notesCount = notes ? notes.length : 0;

        // C. Aggregate tags
        const tagCounts = {};
        notes?.forEach((note) => {
          if (note.tags && Array.isArray(note.tags)) {
            note.tags.forEach((tag) => {
              const t = tag.toLowerCase().trim();
              if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
            });
          }
        });

        topTags = Object.entries(tagCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {});
      }

      return {
        date: new Date().toISOString().split("T")[0],
        total_active_users: activeCount,
        total_notes_created: notesCount,
        top_tags: topTags,
        is_realtime: true,
      };
    } catch (error) {
      console.error("Realtime stats fetch failed:", error);
      return null;
    }
  },
};

module.exports = analyticsService;
