// ─── Netlify Dedicated Function: Chat ────────────────────────
// Specifically handles all /api/chat/* routes.
// Wraps the existing Express chat routes for serverless deployment.

const express = require("express");
const serverless = require("serverless-http");
const cors = require("cors");
const path = require("path");

// Initialize Mini-Express App
const app = express();

// Load Shared CORS Logic
const { corsOptions } = require("../../server/utils/cors");

// Mock Socket.IO 'io' object to prevent crashes in serverless
// (Functions are stateless and don't support persistent WebSockets)
const ioMock = {
  to: () => ({ emit: () => {} }),
  emit: () => {},
  in: () => ({ emit: () => {} }),
  join: () => {},
  leave: () => {},
};
app.set("io", ioMock);

// Middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// Mount the Existing Chat Routes
// Note: We mount it at /api/chat because netlify.toml redirects /api/chat/* here
const chatRoutes = require("../../server/routes/chat");
app.use("/api/chat", chatRoutes);

// Export the Serverless Handler
module.exports.handler = serverless(app);
