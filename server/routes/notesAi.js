const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const notesAiController = require("../controllers/notesAiController");

// Require authentication for all AI routes
router.use(requireAuth);

router.post("/assist", notesAiController.handleAiAssist);
router.get("/trends-briefing", notesAiController.handleTrendsBriefing);

module.exports = router;
