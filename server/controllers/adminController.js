const path = require("path");
const supabase = require(path.join(__dirname, "..", "config", "supabase"));
const { Parser } = require("json2csv");
const PDFDocument = require("pdfkit");
const { createNotification, broadcastNotification } = require(
  "../services/notificationService",
);
const { createClient } = require("@supabase/supabase-js");

// Create a Supabase client with service role for admin operations
const getServiceSupabase = () => {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  );
};

const os = require("os");

/**
 * Helper to log admin actions
 */
const logAdminAction = async (
  req,
  action,
  targetType,
  targetId,
  details = {},
) => {
  try {
    const adminId = req.user.id;
    const ipAddress = req.ip || req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress;

    await supabase
      .from("admin_audit_logs")
      .insert([{
        admin_id: adminId,
        action,
        target_type: targetType,
        target_id: targetId,
        details,
        ip_address: ipAddress,
      }]);
  } catch (err) {
    console.error("Failed to log admin action:", err.message);
  }
};

// GET /api/admin/stats - Dashboard analytics
exports.getStats = async (req, res) => {
  try {
    const serviceSupabase = getServiceSupabase();

    // Parallelize initial simple counts
    const [
      { count: totalUsers },
      { count: totalNotes },
      { count: openChats },
      { count: pendingChats },
      { count: onlineUsers },
    ] = await Promise.all([
      serviceSupabase.from("profiles").select("*", {
        count: "exact",
        head: true,
      }),
      serviceSupabase.from("notes").select("*", { count: "exact", head: true }),
      serviceSupabase.from("conversations").select("*", {
        count: "exact",
        head: true,
      }).eq("chat_type", "support").eq("support_status", "open"),
      serviceSupabase.from("conversations").select("*", {
        count: "exact",
        head: true,
      }).eq("chat_type", "support").eq("support_status", "pending"),
      serviceSupabase.from("profiles").select("*", {
        count: "exact",
        head: true,
      }).eq("is_online", true),
    ]);

    // Active users (24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString();
    const { count: activeUsers } = await serviceSupabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .or(`is_online.eq.true,last_seen.gte.${twentyFourHoursAgo}`);

    // --- NEW: Top Creators (Real Data) ---
    // Fetch all note owner_ids to aggregate (scalable enough for MVP)
    const { data: allNotes } = await serviceSupabase.from("notes").select(
      "owner_id",
    );
    const noteCounts = {};
    allNotes.forEach((n) => {
      noteCounts[n.owner_id] = (noteCounts[n.owner_id] || 0) + 1;
    });

    const topCreatorIds = Object.entries(noteCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([id]) => id);

    let topCreators = [];
    if (topCreatorIds.length > 0) {
      const { data: creators } = await serviceSupabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", topCreatorIds);

      topCreators = topCreatorIds.map((id) => {
        const profile = creators.find((c) => c.id === id);
        return {
          id,
          name: profile?.username || "Unknown",
          avatar: profile?.avatar_url,
          count: noteCounts[id],
        };
      });
    }

    // --- NEW: Usage Trends (Last 7 Days) ---
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data: recentNotes } = await serviceSupabase
      .from("notes")
      .select("created_at")
      .gte("created_at", sevenDaysAgo.toISOString());

    const { data: recentUsers } = await serviceSupabase
      .from("profiles")
      .select("created_at")
      .gte("created_at", sevenDaysAgo.toISOString());

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const usageTrends = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i)); // Go back from today
      const dayName = days[date.getDay()];
      const dateStr = date.toISOString().split("T")[0];

      const notesCount = recentNotes.filter((n) =>
        n.created_at.startsWith(dateStr)
      ).length;
      const usersCount = recentUsers.filter((u) =>
        u.created_at.startsWith(dateStr)
      ).length;

      usageTrends.push({ day: dayName, notes: notesCount, users: usersCount });
    }

    // --- NEW: System Load ---
    const cpuLoad = os.loadavg()[0]; // 1 min avg
    const cpuCount = os.cpus().length;
    const cpuPercent = Math.min(Math.round((cpuLoad / cpuCount) * 100), 100);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

    const responseData = {
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      totalNotes: totalNotes || 0,
      openChats: openChats || 0,
      pendingChats: pendingChats || 0,
      onlineUsers: onlineUsers || 0,
      serverStatus: "healthy",
      topCreators,
      usageTrends,
      systemLoad: {
        cpu: cpuPercent,
        memory: memPercent,
      },
    };

    // --- NEW: Growth & Metrics (Real Data) ---
    const today = new Date();
    const sevenDaysAgoDate = new Date(today);
    sevenDaysAgoDate.setDate(today.getDate() - 7);
    const fourteenDaysAgoDate = new Date(today);
    fourteenDaysAgoDate.setDate(today.getDate() - 14);

    // Parallelize growth queries
    try {
      const [
        { count: usersLast7 },
        { count: usersPrior7 },
        { count: notesLast7 },
        { count: notesPrior7 },
        { count: resolvedChats },
        { count: totalSupportChats },
      ] = await Promise.all([
        serviceSupabase.from("profiles").select("*", {
          count: "exact",
          head: true,
        }).gte("created_at", sevenDaysAgoDate.toISOString()),
        serviceSupabase.from("profiles").select("*", {
          count: "exact",
          head: true,
        }).gte("created_at", fourteenDaysAgoDate.toISOString()).lt(
          "created_at",
          sevenDaysAgoDate.toISOString(),
        ),
        serviceSupabase.from("notes").select("*", {
          count: "exact",
          head: true,
        }).gte("created_at", sevenDaysAgoDate.toISOString()),
        serviceSupabase.from("notes").select("*", {
          count: "exact",
          head: true,
        }).gte("created_at", fourteenDaysAgoDate.toISOString()).lt(
          "created_at",
          sevenDaysAgoDate.toISOString(),
        ),
        serviceSupabase.from("conversations").select("*", {
          count: "exact",
          head: true,
        }).eq("chat_type", "support").eq("support_status", "resolved"),
        serviceSupabase.from("conversations").select("*", {
          count: "exact",
          head: true,
        }).eq("chat_type", "support"),
      ]);

      const calculateGrowth = (current, previous) => {
        if (!previous || previous === 0) return current > 0 ? "+100%" : "0%";
        const growth = ((current - previous) / previous) * 100;
        return (growth > 0 ? "+" : "") + growth.toFixed(1) + "%";
      };

      responseData.growthRate = calculateGrowth(
        usersLast7 || 0,
        usersPrior7 || 0,
      );
      responseData.noteGrowth = calculateGrowth(
        notesLast7 || 0,
        notesPrior7 || 0,
      );
      responseData.chatRetention = (totalSupportChats
        ? Math.round((resolvedChats / totalSupportChats) * 100)
        : 0) + "%";
    } catch (e) {
      console.error("Growth stats error:", e);
      // Non-blocking, metrics will be missing
    }

    res.json(responseData);
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};

// GET /api/admin/users - List all users with pagination
exports.getUsers = async (req, res) => {
  try {
    const serviceSupabase = getServiceSupabase();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const status = req.query.status; // 'active', 'suspended', or undefined for all

    const offset = (page - 1) * limit;

    let query = serviceSupabase
      .from("profiles")
      .select(
        "id, username, email, full_name, avatar_url, role, status, is_online, last_seen, created_at",
        { count: "exact" },
      );

    // Search filter
    if (search) {
      query = query.or(
        `username.ilike.%${search}%,email.ilike.%${search}%,full_name.ilike.%${search}%`,
      );
    }

    // Status filter
    if (status) {
      query = query.eq("status", status);
    }

    // Pagination
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: users, error, count } = await query;

    if (error) throw error;

    // Get notes count per user
    const userIds = users.map((u) => u.id);
    const { data: noteCounts } = await serviceSupabase
      .from("notes")
      .select("owner_id")
      .in("owner_id", userIds);

    // Count notes per user
    const noteCountMap = {};
    if (noteCounts) {
      noteCounts.forEach((note) => {
        noteCountMap[note.owner_id] = (noteCountMap[note.owner_id] || 0) + 1;
      });
    }

    // Attach note counts to users
    const usersWithNotes = users.map((user) => ({
      ...user,
      notesCount: noteCountMap[user.id] || 0,
    }));

    res.json({
      users: usersWithNotes,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// PUT /api/admin/users/:id/status - Suspend or reactivate user
exports.updateUserStatus = async (req, res) => {
  try {
    const serviceSupabase = getServiceSupabase();
    const { id } = req.params;
    const { status } = req.body; // 'active' or 'suspended'

    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be "active" or "suspended"',
      });
    }

    // Prevent admins from suspending themselves
    if (id === req.user.id) {
      return res.status(400).json({ error: "Cannot change your own status" });
    }

    // Check if target user is an admin (prevent suspending other admins unless superadmin)
    const { data: targetProfile } = await serviceSupabase
      .from("profiles")
      .select("role")
      .eq("id", id)
      .single();

    if (targetProfile?.role === "admin" && req.userProfile.role !== "admin") {
      return res.status(403).json({ error: "Cannot modify admin accounts" });
    }

    const { data, error } = await serviceSupabase
      .from("profiles")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Log the action
    await logAdminAction(req, "update_user_status", "user", id, { status });

    // Notify user of status change
    const io = req.app.get("io");
    if (io) {
      await createNotification({
        receiverId: id,
        type: "account_status",
        title: status === "active"
          ? "Account Reactivated"
          : "Account Suspended",
        message: status === "active"
          ? "Your account has been reactivated. You can now access all features."
          : "Your account has been suspended by an administrator.",
        link: "/dashboard",
        io,
      });
    }

    res.json({ message: `User ${status} successfully` });
  } catch (err) {
    console.error("Error updating user status:", err);
    res.status(500).json({ error: "Failed to update user status" });
  }
};

// GET /api/admin/users/:id/notes - Get user's notes metadata (not full content)
exports.getUserNotes = async (req, res) => {
  try {
    const serviceSupabase = getServiceSupabase();
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { data: notes, error, count } = await serviceSupabase
      .from("notes")
      .select(
        "id, title, is_private, is_favorite, tags, created_at, updated_at",
        { count: "exact" },
      )
      .eq("owner_id", id)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      notes,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching user notes:", err);
    res.status(500).json({ error: "Failed to fetch user notes" });
  }
};

// GET /api/admin/support-chats - Get all support conversations
exports.getSupportChats = async (req, res) => {
  try {
    const serviceSupabase = getServiceSupabase();
    const status = req.query.status; // 'open', 'pending', 'resolved', or undefined for all

    let query = serviceSupabase
      .from("conversations")
      .select(`
                id,
                name,
                support_status,
                chat_type,
                updated_at,
                created_at,
                members:conversation_members (
                    user_id,
                    role,
                    status,
                    profile:profiles (
                        username,
                        full_name,
                        avatar_url,
                        is_online
                    )
                )
            `)
      .eq("chat_type", "support")
      .order("updated_at", { ascending: false });

    if (status) {
      query = query.eq("support_status", status);
    }

    const { data: chats, error } = await query;

    if (error) throw error;

    // Get last message for each chat
    const chatIds = chats.map((c) => c.id);
    const { data: lastMessages } = await serviceSupabase
      .from("messages")
      .select("conversation_id, content, created_at, sender_id")
      .in("conversation_id", chatIds)
      .order("created_at", { ascending: false });

    // Group last messages by conversation
    const lastMessageMap = {};
    if (lastMessages) {
      lastMessages.forEach((msg) => {
        if (!lastMessageMap[msg.conversation_id]) {
          lastMessageMap[msg.conversation_id] = msg;
        }
      });
    }

    // Attach last message to chats
    const chatsWithLastMessage = chats.map((chat) => ({
      ...chat,
      lastMessage: lastMessageMap[chat.id] || null,
    }));

    res.json(chatsWithLastMessage);
  } catch (err) {
    console.error("Error fetching support chats:", err);
    res.status(500).json({ error: "Failed to fetch support chats" });
  }
};

// PUT /api/admin/support-chats/:id/status - Update support chat status
exports.updateChatStatus = async (req, res) => {
  try {
    const serviceSupabase = getServiceSupabase();
    const { id } = req.params;
    const { support_status } = req.body;

    if (!["open", "pending", "resolved"].includes(support_status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const { data, error } = await serviceSupabase
      .from("conversations")
      .update({ support_status })
      .eq("id", id)
      .eq("chat_type", "support")
      .select()
      .single();

    if (error) throw error;

    // Log the action
    await logAdminAction(req, "update_support_status", "conversation", id, {
      status: support_status,
    });

    // Notify user if resolved
    if (support_status === "resolved") {
      const io = req.app.get("io");
      if (io) {
        // Find the user in the conversation
        const { data: member } = await serviceSupabase
          .from("conversation_members")
          .select("user_id")
          .eq("conversation_id", id)
          .neq("role", "admin")
          .maybeSingle();

        if (member) {
          await createNotification({
            receiverId: member.user_id,
            type: "support_resolved",
            title: "Support Session Resolved",
            message:
              "Your support session has been marked as resolved. We hope we could help!",
            link: `/dashboard/chat?id=${id}`,
            io,
          });
        }
      }
    }

    res.json({ success: true, conversation: data });
  } catch (err) {
    console.error("Error updating chat status:", err);
    res.status(500).json({ error: "Failed to update chat status" });
  }
};

// POST /api/admin/support-chats/:id/join - Admin joins a support chat
exports.joinSupportChat = async (req, res) => {
  try {
    const serviceSupabase = getServiceSupabase();
    const { id } = req.params;
    const adminId = req.user.id;

    // Check if already a member
    const { data: existingMember } = await serviceSupabase
      .from("conversation_members")
      .select("*")
      .eq("conversation_id", id)
      .eq("user_id", adminId)
      .single();

    if (existingMember) {
      return res.json({ success: true, message: "Already a member" });
    }

    // Add admin as member
    const { error } = await serviceSupabase
      .from("conversation_members")
      .insert({
        conversation_id: id,
        user_id: adminId,
        role: "admin",
        status: "accepted",
      });

    if (error) throw error;

    // Update chat status to pending (being handled)
    await serviceSupabase
      .from("conversations")
      .update({ support_status: "pending" })
      .eq("id", id);

    // Log the action
    await logAdminAction(req, "join_support_chat", "conversation", id, {
      role: "admin",
    });

    // Notify user that admin joined
    const io = req.app.get("io");
    if (io) {
      const { data: member } = await serviceSupabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", id)
        .neq("user_id", adminId)
        .maybeSingle();

      if (member) {
        const { data: admin } = await serviceSupabase.from("profiles").select(
          "username",
        ).eq("id", adminId).single();
        await createNotification({
          receiverId: member.user_id,
          senderId: adminId,
          type: "support_joined",
          title: "Support Agent Joined",
          message: `Support agent ${
            admin?.username || "assigned"
          } has joined the chat to assist you.`,
          link: `/dashboard/chat?id=${id}`,
          io,
        });
      }
    }

    res.json({ success: true, message: "Joined support chat" });
  } catch (err) {
    console.error("Error joining support chat:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

/**
 * Export chat transcript
 */
exports.exportChatTranscript = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = "csv" } = req.query;

    // 1. Fetch conversation details
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select(`
                *,
                members:conversation_members (
                    user_id,
                    role,
                    profile:profiles (username, full_name)
                )
            `)
      .eq("id", id)
      .single();

    if (convError || !conversation) throw new Error("Conversation not found");

    // 2. Fetch all messages
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select(`
                *,
                sender:profiles!sender_id (username)
            `)
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (msgError) throw msgError;

    const fileName = `transcript-${id.slice(0, 8)}-${
      new Date().toISOString().split("T")[0]
    }`;

    // 3. Export based on format
    if (format === "csv") {
      const fields = [
        { label: "Time", value: "created_at" },
        { label: "Sender", value: "sender.username" },
        { label: "Message", value: "content" },
        { label: "Type", value: "type" },
      ];
      const parser = new Parser({ fields });
      const csv = parser.parse(messages);

      res.header("Content-Type", "text/csv");
      res.attachment(`${fileName}.csv`);
      return res.send(csv);
    }

    if (format === "pdf") {
      const doc = new PDFDocument();
      res.header("Content-Type", "application/pdf");
      res.attachment(`${fileName}.pdf`);
      doc.pipe(res);

      // PDF Header
      doc.fontSize(20).text("Chat Transcript", { align: "center" });
      doc.moveDown();
      doc.fontSize(12).text(`Conversation ID: ${id}`);
      doc.text(`Exported On: ${new Date().toLocaleString()}`);
      doc.text(
        `Participants: ${
          conversation.members.map((m) => m.profile.username).join(", ")
        }`,
      );
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();

      // Messages
      messages.forEach((msg) => {
        const time = new Date(msg.created_at).toLocaleString();
        doc.fontSize(10).fillColor("gray").text(
          `${time} - ${msg.sender.username}:`,
          { continued: true },
        );
        doc.fillColor("black").text(` ${msg.content}`);
        doc.moveDown(0.5);
      });

      doc.end();
      return;
    }

    res.status(400).json({ error: "Invalid format" });
  } catch (err) {
    console.error("Error exporting transcript:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

/**
 * Get audit logs
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const { action, admin_id, target_type, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("admin_audit_logs")
      .select(
        `
                *,
                admin:profiles!admin_id (username, full_name, avatar_url)
            `,
        { count: "exact" },
      );

    if (action) query = query.eq("action", action);
    if (admin_id) query = query.eq("admin_id", admin_id);
    if (target_type) query = query.eq("target_type", target_type);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    res.json({
      logs: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching audit logs:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// GET /api/admin/me - Get current admin profile
exports.getAdminProfile = async (req, res) => {
  try {
    const serviceSupabase = getServiceSupabase();

    const { data: profile, error } = await serviceSupabase
      .from("profiles")
      .select("*")
      .eq("id", req.user.id)
      .single();

    if (error) throw error;

    res.json(profile);
  } catch (err) {
    console.error("Error fetching admin profile:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
};

/**
 * Get auto-reply settings
 */
exports.getAutoReplySettings = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("auto_reply_settings")
      .select("*")
      .single();

    if (error && error.code !== "PGRST116") throw error;
    res.json(
      data ||
        {
          enabled: false,
          message: "",
          start_hour: "18:00",
          end_hour: "09:00",
          timezone: "UTC",
        },
    );
  } catch (err) {
    console.error("Error fetching auto-reply settings:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

/**
 * Update auto-reply settings
 */
exports.updateAutoReplySettings = async (req, res) => {
  try {
    const { id, enabled, message, start_hour, end_hour, timezone } = req.body;

    const { data, error } = await supabase
      .from("auto_reply_settings")
      .upsert([{
        id: id || "00000000-0000-0000-0000-000000000000", // Single row
        enabled,
        message,
        start_hour,
        end_hour,
        timezone,
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;

    await logAdminAction(req, "update_auto_reply", "settings", data.id, {
      enabled,
    });

    res.json(data);
  } catch (err) {
    console.error("Error updating auto-reply settings:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

/**
 * Get all broadcasts
 */
exports.getBroadcasts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("broadcasts")
      .select(`
                *,
                admin:profiles!admin_id (username, full_name, avatar_url)
            `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Error fetching broadcasts:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

/**
 * Create a new broadcast
 */
exports.createBroadcast = async (req, res) => {
  try {
    const { title, content, target_audience, expires_at } = req.body;
    const adminId = req.user.id;

    const { data, error } = await supabase
      .from("broadcasts")
      .insert([{
        admin_id: adminId,
        title,
        content,
        target_audience,
        expires_at,
      }])
      .select()
      .single();

    if (error) throw error;

    // Log the action
    await logAdminAction(req, "create_broadcast", "broadcast", data.id, {
      title,
    });

    // Notify all clients via Socket.io and Notification System
    const io = req.app.get("io");
    if (io) {
      io.emit("new_broadcast", data);
      await broadcastNotification({
        senderId: adminId,
        type: "system_broadcast",
        title: "New System Announcement",
        message: title,
        link: "/dashboard",
        io,
      });
    }

    res.json(data);
  } catch (err) {
    console.error("Error creating broadcast:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

/**
 * Delete a broadcast
 */
exports.deleteBroadcast = async (req, res) => {
  try {
    const { id } = req.params;

    // Get info for logging before deletion
    const { data: broadcast } = await supabase
      .from("broadcasts")
      .select("title")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("broadcasts")
      .delete()
      .eq("id", id);

    if (error) throw error;

    // Log the action
    if (broadcast) {
      await logAdminAction(req, "delete_broadcast", "broadcast", id, {
        title: broadcast.title,
      });
    }

    res.json({ success: true, message: "Broadcast deleted" });
  } catch (err) {
    console.error("Error deleting broadcast:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

/**
 * Get system settings
 */
exports.getSystemSettings = async (req, res) => {
  try {
    const serviceSupabase = getServiceSupabase();
    const { data, error } = await serviceSupabase
      .from("system_settings")
      .select("*")
      .single();

    // Handle missing table error (42P01 is Postgres code for undefined_table)
    // PostgREST might return it as a 404 or specific code depending on version
    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "System settings not found" });
      }

      // If table doesn't exist, return defaults to allow admin UI to load
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        console.warn(
          "[Admin] system_settings table missing, returning defaults",
        );
        return res.json({
          system_name: "Note Standard",
          maintenance_mode: false,
          registration_status: "public",
          admin_2fa_enabled: false,
        });
      }

      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: "System settings not found" });
    }

    res.json(data);
  } catch (err) {
    console.error("Error fetching system settings:", err);
    res.status(404).json({ error: "Failed to retrieve system settings" });
  }
};

/**
 * Update system settings
 */
exports.updateSystemSettings = async (req, res) => {
  try {
    const serviceSupabase = getServiceSupabase();
    const {
      system_name,
      maintenance_mode,
      registration_status,
      admin_2fa_enabled,
    } = req.body;

    // Validation
    if (!system_name) {
      return res.status(400).json({ error: "System name is required" });
    }

    const { data, error } = await serviceSupabase
      .from("system_settings")
      .upsert([{
        id: "00000000-0000-0000-0000-000000000000", // Single row
        system_name,
        maintenance_mode: !!maintenance_mode,
        registration_status: registration_status || "public",
        admin_2fa_enabled: !!admin_2fa_enabled,
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) {
      console.error("Error updating system settings in DB:", error.message);
      return res.status(400).json({
        error: "Failed to update settings: " + error.message,
      });
    }

    await logAdminAction(req, "update_system_settings", "settings", data.id, {
      system_name,
      maintenance_mode,
      registration_status,
    });

    res.json(data);
  } catch (err) {
    console.error("CRITICAL: Error updating system settings:", err.message);
    res.status(400).json({
      error: "System error during update: " + err.message,
    });
  }
};

/**
 * Get Monetization Analytics
 */
exports.getMonetizationStats = async (req, res) => {
  try {
    const serviceSupabase = getServiceSupabase();

    // Total Revenue by Type
    const { data: revenueByType, error: revError } = await serviceSupabase
      .from("revenue_logs")
      .select("revenue_type, amount, currency");

    if (revError) throw revError;

    // Monthly revenue trend
    const { data: trendData } = await serviceSupabase
      .rpc("get_revenue_trend"); // We might need to add this SQL function

    res.json({
      revenueByType: revenueByType || [],
      trends: trendData || [],
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch monetization stats" });
  }
};

/**
 * Get Admin settings (Spread, Fees, etc)
 */
exports.getMonetizationSettings = async (req, res) => {
  try {
    const { data, error } = await supabase.from("admin_settings").select("*");
    if (error) throw error;

    // Format as key-value pairs
    const settings = {};
    data.forEach((item) => {
      settings[item.key] = item.value;
    });

    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
};

/**
 * Update Admin Settings
 */
exports.updateMonetizationSettings = async (req, res) => {
  try {
    const settings = req.body; // { spread_percentage: 1.0, withdrawal_fee: { flat: 5, percentage: 1 } }

    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("admin_settings").upsert(updates);
    if (error) throw error;

    await logAdminAction(
      req,
      "update_monetization_settings",
      "settings",
      "global",
      settings,
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update settings" });
  }
};

/**
 * Get Affiliate stats
 */
exports.getAffiliateStats = async (req, res) => {
  try {
    const { data: referrals, error } = await supabase
      .from("affiliate_referrals")
      .select(`
        *,
        referrer:profiles!referrer_user_id(username, email),
        referred:profiles!referred_user_id(username, email)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(referrals);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch affiliate stats" });
  }
};
