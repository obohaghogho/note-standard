const express = require("express");
const router = express.Router();
const path = require("path");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const analyticsService = require("../services/analyticsService");

// Public: Get aggregated stats (Transparency)
router.get("/", async (req, res) => {
  try {
    const stats = await analyticsService.getLatestStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

router.get("/realtime", async (req, res) => {
  try {
    const stats = await analyticsService.getRealtimeStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching realtime analytics:", error);
    res.status(500).json({ error: "Failed to fetch realtime stats" });
  }
});

// Admin: Trigger aggregation manually
router.post("/trigger", requireAdmin, async (req, res) => {
  try {
    const stats = await analyticsService.aggregateDailyStats();
    res.json({ message: "Aggregation success", stats });
  } catch (error) {
    console.error("Error triggering aggregation:", error);
    res.status(500).json({ error: "Failed to aggregate stats" });
  }
});

module.exports = router;
