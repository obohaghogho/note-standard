const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { 
  createCommunityPost, addComment, toggleLike, getFeed, getComments,
  toggleBookmark, deletePost, editPost, deleteComment, editComment,
  toggleFollow, reportItem, votePollOption
} = require("../controllers/communityController");
const spaceController = require("../controllers/spaceController");
const spaceAiController = require("../controllers/spaceAiController");
const aiTutorController = require("../controllers/aiTutorController");
const supabase = require("../config/database");

router.use(requireAuth);

router.get("/feed", getFeed);
router.post("/post", createCommunityPost);
router.put("/post/:postId", editPost);
router.delete("/post/:postId", deletePost);
router.post("/post/:postId/bookmark", toggleBookmark);
router.post("/post/:postId/poll/:optionId/vote", votePollOption);
router.get("/post/:postId/comments", getComments);

router.post("/comment", addComment);
router.put("/comment/:commentId", editComment);
router.delete("/comment/:commentId", deleteComment);

router.post("/like", toggleLike);

router.post("/report", reportItem);
router.post("/profile/:profileId/follow", toggleFollow);

// ── Suggested creators (users not yet followed) ────────────────────────────
router.get("/suggested-creators", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 5;

    // Get IDs the current user already follows
    const { data: following } = await supabase
      .from('community_follows')
      .select('following_id')
      .eq('follower_id', userId);
    const followingIds = (following || []).map(f => f.following_id).concat([userId]);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, is_verified')
      .not('id', 'in', `(${followingIds.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (error.code === '42P01') return res.json([]);
      throw error;
    }

    // Dynamic followers count aggregation
    const creatorsWithCounts = await Promise.all((data || []).map(async (profile) => {
      const { count } = await supabase
        .from('community_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profile.id);
      return {
        ...profile,
        followers_count: count || 0
      };
    }));

    res.json(creatorsWithCounts);
  } catch (err) { next(err); }
});

// ── User community profile ────────────────────────────────────────────────
router.get("/profile/:profileId", async (req, res, next) => {
  try {
    const { profileId } = req.params;
    const userId = req.user.id;

    const [{ data: profileData }, { data: follows }] = await Promise.all([
      supabase.from('profiles').select('id, username, avatar_url, is_verified, bio').eq('id', profileId).single(),
      supabase.from('community_follows').select('id').eq('follower_id', userId).eq('following_id', profileId).maybeSingle(),
    ]);

    if (!profileData) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Dynamic counts from follows table
    const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
      supabase.from('community_follows').select('*', { count: 'exact', head: true }).eq('following_id', profileId),
      supabase.from('community_follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileId),
    ]);

    const profile = {
      ...profileData,
      followers_count: followersCount || 0,
      following_count: followingCount || 0
    };

    const { data: posts } = await supabase
      .from('community_posts')
      .select('*, profiles!author_id(id, username, avatar_url, is_verified), community_likes(user_id), community_bookmarks(user_id), community_comments(id)')
      .eq('author_id', profileId)
      .eq('status', 'public')
      .order('created_at', { ascending: false })
      .limit(20);

    const postsWithCommentCount = (posts || []).map(post => {
      const clean = {
        ...post,
        comments_count: post.community_comments?.length || 0
      };
      delete clean.community_comments;
      return clean;
    });

    res.json({ profile, posts: postsWithCommentCount, isFollowing: !!follows });
  } catch (err) { next(err); }
});

// Spaces
router.get("/spaces", spaceController.getSpaces);
router.post("/spaces", spaceController.createSpace);
router.post("/spaces/:spaceId/join", spaceController.joinSpace);
router.post("/spaces/:spaceId/ask", spaceAiController.askSpaceAi);
// AI Tutor: client AiTutorPanel.tsx posts to /community/spaces/:spaceId/tutor
router.post("/spaces/:spaceId/tutor", aiTutorController.tutorChat);

module.exports = router;

