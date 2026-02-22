const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { createCommunityPost, addComment, toggleLike } = require(
  "../controllers/communityController",
);

router.use(requireAuth);

router.post("/post", createCommunityPost);
router.post("/comment", addComment);
router.post("/like", toggleLike);

module.exports = router;
