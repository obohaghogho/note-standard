const express = require("express");
const logger = require("./utils/logger");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cloudinary = require("cloudinary").v2;
const Sentiment = require("sentiment");
const sentimentAnalyzer = new Sentiment();
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: path.join(__dirname, ".env.development") });
}
require("dotenv").config(); // Load .env as fallback or for production

const supabase = require(path.join(__dirname, "config", "supabase"));

// Configure Cloudinary from CLOUDINARY_URL env variable
if (process.env.CLOUDINARY_URL) {
  cloudinary.config();
  logger.info("Cloudinary configured successfully");
}

const app = express();
const http = require("http");
const { Server } = require("socket.io");

const whitelist = [
  "https://www.notestandard.com",
  "https://notestandard.com",
  "http://localhost:5173",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      console.warn(`Blocked by CORS: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
  ],
  optionsSuccessStatus: 200,
};

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

// Middleware
app.use(helmet());

// Apply CORS globally before other middleware
app.use(cors(corsOptions));

// Enable pre-flight requests for all routes
app.options("*", cors(corsOptions));

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(morgan("dev"));

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
      // We proceed even if profile fails, user object is enough for basic connection
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
    const threshold = new Date(Date.now() - 60000).toISOString(); // 60 seconds ago

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
}, 60000); // Run every minute

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

app.get("/", (req, res) => {
  res.json({ message: "Note Standard API is running 🚀" });
});

// Import Routes
const notesRoutes = require(path.join(__dirname, "routes", "notes"));
const authRoutes = require(path.join(__dirname, "routes", "auth"));
const chatRoutes = require(path.join(__dirname, "routes", "chat"));
const uploadRoutes = require(path.join(__dirname, "routes", "upload"));
const subscriptionRoutes = require(
  path.join(__dirname, "routes", "subscription"),
);
const adminRoutes = require(path.join(__dirname, "routes", "admin"));
const notificationRoutes = require(
  path.join(__dirname, "routes", "notifications"),
);
const communityRoutes = require(path.join(__dirname, "routes", "community"));
const adsRoutes = require(path.join(__dirname, "routes", "ads"));
const broadcastsRoutes = require(path.join(__dirname, "routes", "broadcasts"));
const analyticsRoutes = require(path.join(__dirname, "routes", "analytics"));

app.use("/api/auth", authRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/ads", adsRoutes);
app.use("/api/broadcasts", broadcastsRoutes);
app.use("/api/analytics", analyticsRoutes);

app.use("/api/wallet", require(path.join(__dirname, "routes", "wallet")));
app.use(
  "/api/paystack",
  require(path.join(__dirname, "routes", "paystackRoutes")),
); // Mount Paystack routes
app.use("/api/webhooks", require(path.join(__dirname, "routes", "webhooks")));
app.use("/webhook", require(path.join(__dirname, "routes", "webhooks"))); // Alias for singular root webhook
app.use("/api/payment", require(path.join(__dirname, "routes", "payment")));
app.use("/api/media", require(path.join(__dirname, "routes", "media")));

server.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server running on 0.0.0.0:${PORT}`);
});
