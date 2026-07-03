const logger = require("../utils/logger");
const pool = require("../config/pgPool");

// Helper: Calculate streak from array of unique dates
function calculateStreak(dates) {
  if (!dates || dates.length === 0) return 0;
  let streak = 0;
  let today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parse dates to local date strings for comparison
  const uniqueDates = Array.from(new Set(dates.map(d => {
    const dateObj = new Date(d);
    return dateObj.toDateString();
  })));

  let checkDate = new Date(today);
  
  // Check if today or yesterday was active to start the streak
  let hasActivityToday = uniqueDates.includes(checkDate.toDateString());
  if (!hasActivityToday) {
    checkDate.setDate(checkDate.getDate() - 1);
    if (!uniqueDates.includes(checkDate.toDateString())) {
      return 0; // Streak is broken
    }
  }

  // Iterate backward and count consecutive days
  while (true) {
    if (uniqueDates.includes(checkDate.toDateString())) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// 1. GET /api/dashboard/notes/layout
const getLayout = async (req, res) => {
  try {
    const { id: userId } = req.user;
    
    const { rows } = await pool.query(
      "SELECT widget, position, visible, width FROM dashboard_layout WHERE user_id = $1 ORDER BY position ASC",
      [userId]
    );

    if (rows.length === 0) {
      // Seed default layouts
      const defaultWidgets = [
        { widget: 'welcome', position: 1, visible: true, width: 'full' },
        { widget: 'stats', position: 2, visible: true, width: 'full' },
        { widget: 'actions', position: 3, visible: true, width: 'full' },
        { widget: 'recent', position: 4, visible: true, width: 'half' },
        { widget: 'categories', position: 5, visible: true, width: 'half' },
        { widget: 'chart', position: 6, visible: true, width: 'half' },
        { widget: 'calendar', position: 7, visible: true, width: 'half' },
        { widget: 'timeline', position: 8, visible: true, width: 'half' },
        { widget: 'suggestions', position: 9, visible: true, width: 'half' },
        { widget: 'shared', position: 10, visible: true, width: 'full' }
      ];

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const w of defaultWidgets) {
          await client.query(
            "INSERT INTO dashboard_layout (user_id, widget, position, visible, width) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, position) DO NOTHING",
            [userId, w.widget, w.position, w.visible, w.width]
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      return res.json(defaultWidgets);
    }

    res.json(rows);
  } catch (err) {
    logger.error("[DashboardController] getLayout error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// 2. PUT /api/dashboard/notes/layout
const updateLayout = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const layouts = req.body; // Expect array of { widget, position, visible, width }

    if (!Array.isArray(layouts)) {
      return res.status(400).json({ error: "Invalid layout body" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM dashboard_layout WHERE user_id = $1", [userId]);
      
      for (const w of layouts) {
        await client.query(
          "INSERT INTO dashboard_layout (user_id, widget, position, visible, width) VALUES ($1, $2, $3, $4, $5)",
          [userId, w.widget, w.position, w.visible || false, w.width || 'full']
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, message: "Layout updated successfully" });
  } catch (err) {
    logger.error("[DashboardController] updateLayout error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// 3. GET /api/dashboard/notes/stats
const getStats = async (req, res) => {
  try {
    const { id: userId } = req.user;

    const queries = {
      total: pool.query("SELECT COUNT(*) FROM notes WHERE owner_id = $1 AND deleted_at IS NULL AND is_archived = false", [userId]),
      favorites: pool.query("SELECT COUNT(*) FROM favorite_notes WHERE user_id = $1", [userId]),
      pinned: pool.query("SELECT COUNT(*) FROM notes WHERE owner_id = $1 AND is_pinned = true AND deleted_at IS NULL", [userId]),
      archived: pool.query("SELECT COUNT(*) FROM notes WHERE owner_id = $1 AND is_archived = true AND deleted_at IS NULL", [userId]),
      checklists: pool.query("SELECT COUNT(*) FROM notes WHERE owner_id = $1 AND note_type = 'checklist' AND deleted_at IS NULL", [userId]),
      voice: pool.query("SELECT COUNT(*) FROM notes WHERE owner_id = $1 AND note_type = 'voice' AND deleted_at IS NULL", [userId]),
      image: pool.query("SELECT COUNT(*) FROM notes WHERE owner_id = $1 AND note_type = 'image' AND deleted_at IS NULL", [userId]),
      shared: pool.query("SELECT COUNT(*) FROM shared_notes WHERE shared_with_user_id = $1 OR shared_by = $1", [userId]),
      attachments_count: pool.query("SELECT COUNT(*) FROM note_files f JOIN notes n ON f.note_id = n.id WHERE n.owner_id = $1", [userId]),
      attachments_size: pool.query("SELECT COALESCE(SUM(file_size), 0) FROM note_files f JOIN notes n ON f.note_id = n.id WHERE n.owner_id = $1", [userId])
    };

    const results = await Promise.all(Object.values(queries));
    const keys = Object.keys(queries);
    const stats = {};

    keys.forEach((key, idx) => {
      stats[key] = parseInt(results[idx].rows[0].count || results[idx].rows[0].coalesce || 0);
    });

    res.json(stats);
  } catch (err) {
    logger.error("[DashboardController] getStats error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// 4. GET /api/dashboard/notes/recent
const getRecent = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { rows } = await pool.query(
      "SELECT id, title, content, note_type, last_opened_at, cover_image, color, word_count, reading_time, is_pinned, is_archived FROM notes WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY last_opened_at DESC LIMIT 10",
      [userId]
    );
    res.json(rows);
  } catch (err) {
    logger.error("[DashboardController] getRecent error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// 5. GET /api/dashboard/notes/categories
const getCategories = async (req, res) => {
  try {
    const { id: userId } = req.user;
    
    // Auto-create default categories if user has none
    const existing = await pool.query("SELECT id FROM note_categories WHERE user_id = $1 LIMIT 1", [userId]);
    if (existing.rows.length === 0) {
      const defaultCats = [
        { name: "Work", color: "#3B82F6", icon: "briefcase" },
        { name: "Personal", color: "#10B981", icon: "user" },
        { name: "Finance", color: "#F59E0B", icon: "dollar-sign" },
        { name: "School", color: "#8B5CF6", icon: "book-open" },
        { name: "Ideas", color: "#EC4899", icon: "lightbulb" }
      ];
      for (const cat of defaultCats) {
        await pool.query(
          "INSERT INTO note_categories (user_id, name, color, icon) VALUES ($1, $2, $3, $4)",
          [userId, cat.name, cat.color, cat.icon]
        );
      }
    }

    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.color, c.icon, 
              COUNT(n.id) as note_count, 
              MAX(n.updated_at) as last_updated 
       FROM note_categories c 
       LEFT JOIN notes n ON c.id = n.category_id AND n.deleted_at IS NULL 
       WHERE c.user_id = $1 
       GROUP BY c.id, c.name, c.color, c.icon 
       ORDER BY c.name ASC`,
      [userId]
    );

    res.json(rows.map(r => ({
      ...r,
      note_count: parseInt(r.note_count),
      last_updated: r.last_updated ? r.last_updated.toISOString() : null
    })));
  } catch (err) {
    logger.error("[DashboardController] getCategories error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// 6. GET /api/dashboard/notes/activity
const getActivity = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const limit = parseInt(req.query.limit) || 15;
    const cursor = req.query.cursor; // ISO timestamp string

    let timelineQuery = `
      SELECT a.id, a.action_type, a.created_at, a.details, 
             n.title as note_title, n.note_type 
      FROM note_activities a 
      LEFT JOIN notes n ON a.note_id = n.id 
      WHERE a.user_id = $1
    `;
    
    const params = [userId];
    if (cursor) {
      timelineQuery += " AND a.created_at < $2 ORDER BY a.created_at DESC LIMIT $3";
      params.push(cursor, limit);
    } else {
      timelineQuery += " ORDER BY a.created_at DESC LIMIT $2";
      params.push(limit);
    }

    const { rows: timeline } = await pool.query(timelineQuery, params);

    // Fetch last 7 days metrics for chart
    const { rows: chartStats } = await pool.query(
      `SELECT created_at::date as date, action_type, COUNT(*) as count 
       FROM note_activities 
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 DAYS' 
       GROUP BY created_at::date, action_type 
       ORDER BY created_at::date ASC`,
      [userId]
    );

    // Group chart stats by date
    const chartMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      chartMap[dateStr] = { date: dateStr, created: 0, edited: 0, completed: 0 };
    }

    chartStats.forEach(stat => {
      const dateStr = new Date(stat.date).toISOString().split("T")[0];
      if (chartMap[dateStr]) {
        if (stat.action_type === "created") chartMap[dateStr].created += parseInt(stat.count);
        if (stat.action_type === "edited") chartMap[dateStr].edited += parseInt(stat.count);
        if (stat.action_type === "restored") chartMap[dateStr].created += parseInt(stat.count);
      }
    });

    res.json({
      timeline,
      chart: Object.values(chartMap),
      nextCursor: timeline.length === limit ? timeline[timeline.length - 1].created_at : null
    });
  } catch (err) {
    logger.error("[DashboardController] getActivity error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// 7. GET /api/dashboard/notes/calendar
const getCalendar = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { month } = req.query; // Format: YYYY-MM
    
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "Invalid month parameter, expected YYYY-MM" });
    }

    const start = `${month}-01 00:00:00Z`;
    // Find last day of month
    const year = parseInt(month.split("-")[0]);
    const monthNum = parseInt(month.split("-")[1]);
    const lastDay = new Date(year, monthNum, 0).getDate();
    const end = `${month}-${lastDay} 23:59:59Z`;

    const { rows } = await pool.query(
      `SELECT id, title, note_type, created_at, cover_image, color 
       FROM notes 
       WHERE owner_id = $1 AND deleted_at IS NULL AND created_at >= $2 AND created_at <= $3`,
      [userId, start, end]
    );

    // Group in JS
    const calendar = {};
    rows.forEach(note => {
      const dateStr = new Date(note.created_at).toISOString().split("T")[0];
      if (!calendar[dateStr]) calendar[dateStr] = [];
      calendar[dateStr].push(note);
    });

    res.json(calendar);
  } catch (err) {
    logger.error("[DashboardController] getCalendar error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// 8. GET /api/dashboard/notes/suggestions
const getSuggestions = async (req, res) => {
  try {
    const { id: userId } = req.user;

    // A. Idle notes suggestion (no edits in 14 days)
    const idleNotes = await pool.query(
      `SELECT id, title, last_opened_at 
       FROM notes 
       WHERE owner_id = $1 AND deleted_at IS NULL AND is_archived = false AND last_opened_at < NOW() - INTERVAL '14 DAYS' 
       ORDER BY last_opened_at ASC LIMIT 2`,
      [userId]
    );

    // B. Large categories suggestion
    const largeCategories = await pool.query(
      `SELECT c.id, c.name, COUNT(n.id) as cnt 
       FROM notes n 
       JOIN note_categories c ON n.category_id = c.id 
       WHERE n.owner_id = $1 AND n.deleted_at IS NULL 
       GROUP BY c.id, c.name 
       HAVING COUNT(n.id) > 10 LIMIT 1`,
      [userId]
    );

    // C. Streaks & writing statistics
    const activeDatesQuery = await pool.query(
      `SELECT DISTINCT created_at::date as active_date 
       FROM note_activities 
       WHERE user_id = $1 AND action_type IN ('created', 'edited') 
       ORDER BY active_date DESC`,
      [userId]
    );
    const activeDates = activeDatesQuery.rows.map(r => r.active_date);
    const streak = calculateStreak(activeDates);

    const suggestions = [];
    idleNotes.rows.forEach(note => {
      const days = Math.floor((Date.now() - new Date(note.last_opened_at)) / (1000 * 60 * 60 * 24));
      suggestions.push({
        id: `idle-${note.id}`,
        type: "archive_suggestion",
        title: "Idle Note Recommendation",
        message: `You haven't opened "${note.title || 'Untitled note'}" in ${days} days. Consider archiving it to tidy your feed.`,
        targetId: note.id,
      });
    });

    largeCategories.rows.forEach(cat => {
      suggestions.push({
        id: `cat-${cat.id}`,
        type: "category_cleanup",
        title: "Category growth warning",
        message: `Your folder "${cat.name}" is becoming large (${cat.cnt} notes). Create subcategories or archive older items.`,
        targetId: cat.id,
      });
    });

    res.json({
      suggestions,
      streak,
      activeDaysThisMonth: activeDates.filter(d => new Date(d).getMonth() === new Date().getMonth()).length,
    });
  } catch (err) {
    logger.error("[DashboardController] getSuggestions error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getLayout,
  updateLayout,
  getStats,
  getRecent,
  getCategories,
  getActivity,
  getCalendar,
  getSuggestions,
};
