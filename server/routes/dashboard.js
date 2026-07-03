const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const dashboardController = require("../controllers/dashboardController");

// Require authentication for all dashboard routes
router.use(requireAuth);

router.get("/notes/layout", dashboardController.getLayout);
router.put("/notes/layout", dashboardController.updateLayout);
router.get("/notes/stats", dashboardController.getStats);
router.get("/notes/recent", dashboardController.getRecent);
router.get("/notes/categories", dashboardController.getCategories);
router.get("/notes/activity", dashboardController.getActivity);
router.get("/notes/calendar", dashboardController.getCalendar);
router.get("/notes/suggestions", dashboardController.getSuggestions);

module.exports = router;
