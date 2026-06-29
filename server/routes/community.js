const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { createCommunityPost, addComment, toggleLike, getFeed } = require(
  "../controllers/communityController",
);
const spaceController = require("../controllers/spaceController");
const spaceAiController = require("../controllers/spaceAiController");

router.use(requireAuth);

router.get("/feed", getFeed);
router.post("/post", createCommunityPost);
router.post("/comment", addComment);
router.post("/like", toggleLike);

// Spaces
router.get("/spaces", spaceController.getSpaces);
router.post("/spaces", spaceController.createSpace);
router.post("/spaces/:spaceId/join", spaceController.joinSpace);
router.post("/spaces/:spaceId/ask", spaceAiController.askSpaceAi);

module.exports = router;
