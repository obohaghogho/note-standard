const express = require("express");
const router = express.Router();
const teamController = require("../controllers/teamController");
const { requireAuth } = require("../middleware/authMiddleware");

router.use(requireAuth);

router.get("/my-teams", teamController.getMyTeams);
router.get("/:teamId/messages", teamController.getTeamMessages);
router.post("/:teamId/messages", teamController.sendTeamMessage);

module.exports = router;
