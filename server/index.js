// ─── Backend Server ──────────────────────────────────────────
// This file is the main entry point for the backend.
// It imports the Express app from app.js and adds:
//   - Socket.IO (WebSockets)
//   - server.listen()
//
// Render starts this file using: node server/index.js

const path = require("path");
const logger = require("./utils/logger");

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: path.join(__dirname, ".env.development") });
}
require("dotenv").config();

const app = require("./app");
const http = require("http");
const { Server } = require("socket.io");
const supabase = require(path.join(__dirname, "config", "supabase"));
const { whitelist } = require("./utils/cors");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: whitelist,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.set("io", io);

const PORT = process.env.PORT || 5000;

// Socket.io Middleware for Authentication
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.split(" ")[1];
    if (!token) {
      console.warn("[Socket Auth] Missing token in handshake");
      return next(new Error("Authentication error: Missing token"));
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      token,
    );
    if (authError || !user) {
      console.error(
        "[Socket Auth] Invalid token:",
        authError?.message || "User not found",
      );
      return next(new Error("Authentication error: Invalid session"));
    }

    // Get user profile with role - but with timeout to avoid hanging handshake
    const profilePromise = supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .single();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Profile fetch timeout")), 3000)
    );

    let profile = null;
    try {
      const { data } = await Promise.race([profilePromise, timeoutPromise]);
      profile = data;
    } catch (profileErr) {
      console.warn(
        "[Socket Auth] Profile fetch failed or timed out:",
        profileErr.message,
      );
    }

    socket.user = user;
    socket.userProfile = profile;
    next();
  } catch (err) {
    console.error("[Socket Auth] Unexpected error:", err.message);
    next(new Error("Authentication error: Internal server error"));
  }
});

// Track online users (handle multiple tabs)
const userSockets = new Map(); // userId -> Set(socketIds)

// Background cleanup job for "ghost" users (online but inactive)
setInterval(async () => {
  try {
    const threshold = new Date(Date.now() - 60000).toISOString();

    const { data: ghosts, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_online", true)
      .lt("last_active_at", threshold);

    if (error) throw error;

    if (ghosts && ghosts.length > 0) {
      const ghostIds = ghosts.map((g) => g.id);
      logger.debug(`[Presence] Cleaning up ${ghostIds.length} ghost users`);

      await supabase
        .from("profiles")
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .in("id", ghostIds);

      ghostIds.forEach((id) => {
        io.emit("user_online", {
          userId: id,
          online: false,
          lastSeen: new Date().toISOString(),
        });
        userSockets.delete(id);
      });
    }
  } catch (err) {
    console.error("[Presence] Cleanup job error:", err.message);
  }
}, 60000);

// Background job for real-time Trends
const analyticsService = require("./services/analyticsService");

// 1. Immediate aggregation on startup
(async () => {
  try {
    console.log("[Trends] Running initial aggregation...");
    await analyticsService.aggregateDailyStats();
    console.log("[Trends] Initial aggregation complete.");
  } catch (err) {
    console.error("[Trends] Initial aggregation failed:", err.message);
  }
})();

// 2. Real-time broadcast (Every 60s)
setInterval(async () => {
  try {
    const stats = await analyticsService.getRealtimeStats();
    if (stats) {
      io.emit("stats_updated", stats);
    }
  } catch (err) {
    console.error("[Trends] Interval broadcast failed:", err.message);
  }
}, 60000);

// 3. Periodic persistence (Every 6 hours)
setInterval(async () => {
  try {
    console.log("[Trends] Running scheduled persistence...");
    await analyticsService.aggregateDailyStats();
  } catch (err) {
    console.error("[Trends] Scheduled persistence failed:", err.message);
  }
}, 6 * 60 * 60 * 1000);

io.on("connection", async (socket) => {
  const userId = socket.user.id;
  logger.info(`[Socket] Connected: ${userId} ${socket.id}`);

  // Track user sockets
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socket.id);

  // Mark online if first connection
  if (userSockets.get(userId).size === 1) {
    await supabase
      .from("profiles")
      .update({
        is_online: true,
        last_active_at: new Date().toISOString(),
      })
      .eq("id", userId);

    io.emit("user_online", { userId, online: true });
  }

  // Send currently online users to the new client
  const onlineUserIds = Array.from(userSockets.keys());
  socket.emit("presence:initial", onlineUserIds);

  socket.join(userId);

  // Heartbeat from client
  socket.on("presence:heartbeat", async () => {
    await supabase
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", userId);
  });

  // Explicit offline signal (tab close)
  socket.on("presence:offline", async () => {
    userSockets.get(userId)?.delete(socket.id);
    if (!userSockets.get(userId) || userSockets.get(userId).size === 0) {
      userSockets.delete(userId);
      await supabase
        .from("profiles")
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .eq("id", userId);

      io.emit("user_online", {
        userId,
        online: false,
        lastSeen: new Date().toISOString(),
      });
    }
  });

  // If user is admin/support, join admin room for notifications
  if (
    socket.userProfile?.role === "admin" ||
    socket.userProfile?.role === "support"
  ) {
    socket.join("admin_room");
  }

  // Join a conversation room
  socket.on("join_room", async (conversationId) => {
    try {
      const { data: membership } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .single();

      if (membership) {
        socket.join(conversationId);
      } else if (
        socket.userProfile?.role === "admin" ||
        socket.userProfile?.role === "support"
      ) {
        const { data: conv } = await supabase
          .from("conversations")
          .select("chat_type")
          .eq("id", conversationId)
          .single();

        if (conv?.chat_type === "support") {
          socket.join(conversationId);
        }
      }
    } catch (err) {
      console.error("Error joining room:", err);
    }
  });

  // Typing indicator
  socket.on("typing", ({ conversationId, isTyping }) => {
    socket.to(conversationId).emit("user_typing", {
      conversationId,
      userId,
      isTyping,
    });
  });

  // Read receipt
  socket.on("mark_read", async ({ conversationId, messageId }) => {
    socket.to(conversationId).emit("message_read", {
      conversationId,
      messageId,
      readBy: userId,
    });
  });

  // --- Admin Presence & Collaboration ---
  socket.on("admin_viewing_chat", ({ conversationId, adminName }) => {
    socket.currentChatId = conversationId;
    socket.adminName = adminName;
    socket.to(conversationId).emit("admin_presence_update", {
      conversationId,
      adminId: userId,
      adminName,
      status: "viewing",
    });
  });

  socket.on("admin_leaving_chat", ({ conversationId }) => {
    socket.to(conversationId).emit("admin_presence_update", {
      conversationId,
      adminId: userId,
      status: "left",
    });
    socket.currentChatId = null;
  });

  // --- WebRTC Signaling ---
  socket.on("call:init", ({ to, type, conversationId }) => {
    logger.info(`[WebRTC] Call Init from ${userId} to ${to} (${type})`);
    io.to(to).emit("call:incoming", { from: userId, type, conversationId });
  });

  socket.on("call:ready", ({ to }) => {
    logger.debug(`[WebRTC] Recipient ${userId} is ready for offer to ${to}`);
    io.to(to).emit("call:ready", { from: userId });
  });

  socket.on("call:offer", ({ to, offer }) => {
    io.to(to).emit("call:offer", { from: userId, offer });
  });

  socket.on("call:answer", ({ to, answer }) => {
    io.to(to).emit("call:answer", { from: userId, answer });
  });

  socket.on("call:ice", ({ to, candidate }) => {
    io.to(to).emit("call:ice", { from: userId, candidate });
  });

  socket.on("call:end", ({ to, conversationId }) => {
    io.to(to).emit("call:ended", { from: userId, conversationId });
  });

  // New support chat notification to admins
  socket.on("new_support_chat", (conversation) => {
    io.to("admin_room").emit("new_support_chat", conversation);
  });

  socket.on("disconnect", async () => {
    logger.info(`[Socket] Disconnected: ${userId} ${socket.id}`);

    userSockets.get(userId)?.delete(socket.id);

    if (socket.currentChatId && socket.adminName) {
      io.to(socket.currentChatId).emit("admin_presence_update", {
        conversationId: socket.currentChatId,
        adminId: userId,
        status: "left",
      });
    }

    // Only mark offline if NO other sockets remain
    if (!userSockets.get(userId) || userSockets.get(userId).size === 0) {
      userSockets.delete(userId);

      await supabase
        .from("profiles")
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .eq("id", userId);

      io.emit("user_online", {
        userId,
        online: false,
        lastSeen: new Date().toISOString(),
      });
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server running on port ${PORT}`);
});
