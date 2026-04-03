const express = require("express");
const router = express.Router();
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { createNotification } = require("../services/notificationService");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

// Get user's own limit requests
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("limit_requests")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Error fetching user limit requests:", err);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// Submit a new limit request
router.post("/", async (req, res) => {
  try {
    const { requested_limit, reason } = req.body;

    if (!requested_limit || isNaN(requested_limit) || requested_limit <= 0) {
      return res.status(400).json({ error: "Invalid requested limit" });
    }

    // Check for existing pending request
    const { data: existing, error: checkError } = await supabase
      .from("limit_requests")
      .select("id")
      .eq("user_id", req.user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: "You already have a pending limit increase request." });
    }

    const { data, error } = await supabase
      .from("limit_requests")
      .insert([
        {
          user_id: req.user.id,
          requested_limit,
          reason,
          status: "pending"
        }
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, request: data });
  } catch (err) {
    console.error("Error submitting limit request:", err);
    res.status(500).json({ error: "Failed to submit request" });
  }
});

module.exports = router;
