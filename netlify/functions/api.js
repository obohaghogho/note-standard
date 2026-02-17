// ─── Netlify Serverless Function: API ────────────────────────
// Wraps the entire Express app as a single Netlify Function.
// All /api/* and /webhook/* requests are routed here via netlify.toml redirects.
//
// How it works:
//   1. netlify.toml redirects /api/* → /.netlify/functions/api/api/*
//   2. serverless-http converts the Lambda event into an Express req/res
//   3. Express routes handle everything exactly like a normal server

const serverless = require("serverless-http");
const app = require("../../server/app");

// Export the handler for Netlify
module.exports.handler = serverless(app);
