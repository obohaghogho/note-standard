const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { 
  createCommunityPost, addComment, toggleLike, getFeed, getComments,
  toggleBookmark, deletePost, editPost, deleteComment, editComment,
  toggleFollow, reportItem, reportUser, votePollOption, getReels, createReel
} = require("../controllers/communityController");
const spaceController = require("../controllers/spaceController");
const spaceAiController = require("../controllers/spaceAiController");
const aiTutorController = require("../controllers/aiTutorController");
const supabase = require("../config/database");
const { followLimiter, reportLimiter, profileViewLimiter } = require("../middleware/rateLimiter");
const logger = require("../utils/logger");

router.use(requireAuth);

router.get("/feed", getFeed);
router.get("/reels", getReels);
router.post("/reels", createReel);
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

router.post("/report", reportLimiter, reportItem);
router.post("/report-user", reportLimiter, reportUser);
router.post("/profile/:profileId/follow", followLimiter, toggleFollow);

// ── Suggested creators / user search ────────────────────────────
router.get("/suggested-creators", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 5;
    const searchTerm = req.query.search ? req.query.search.trim() : '';

    let query = supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, is_verified, bio');

    if (searchTerm) {
      query = query
        .or(`username.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
        .neq('id', userId);
    } else {
      const { data: following } = await supabase
        .from('community_follows')
        .select('following_id')
        .eq('follower_id', userId);
      const followingIds = (following || []).map(f => f.following_id).concat([userId]);

      query = query.not('id', 'in', `(${followingIds.join(',')})`);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (error.code === '42P01') return res.json([]);
      throw error;
    }

    // Dynamic followers count aggregation & follow status
    const creatorsWithCounts = await Promise.all((data || []).map(async (profile) => {
      const [{ count }, { data: follow }] = await Promise.all([
        supabase.from('community_follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
        supabase.from('community_follows').select('id').eq('follower_id', userId).eq('following_id', profile.id).maybeSingle()
      ]);
      return {
        ...profile,
        followers_count: count || 0,
        is_following: !!follow
      };
    }));

    res.json(creatorsWithCounts);
  } catch (err) { next(err); }
});

// ── User community profile ────────────────────────────────────────────────
const getProfileHandler = async (req, res, next, isUsername = false) => {
  try {
    const { identifier } = req.params;
    const userId = req.user.id;

    let query = supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, cover_url, bio, website, country_code, is_verified, kyc_level, created_at');

    if (isUsername) {
      query = query.ilike('username', identifier);
    } else {
      query = query.eq('id', identifier);
    }

    const { data: profileData, error: profileErr } = await query.maybeSingle();

    if (profileErr || !profileData) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const targetProfileId = profileData.id;

    // Check follow status & dynamic counts
    const [{ data: follows }, { count: followersCount }, { count: followingCount }, { count: postsCount }, { data: blockData }, { data: muteData }] = await Promise.all([
      supabase.from('community_follows').select('id').eq('follower_id', userId).eq('following_id', targetProfileId).maybeSingle(),
      supabase.from('community_follows').select('*', { count: 'exact', head: true }).eq('following_id', targetProfileId),
      supabase.from('community_follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetProfileId),
      supabase.from('community_posts').select('*', { count: 'exact', head: true }).eq('author_id', targetProfileId).eq('status', 'public'),
      supabase.from('user_blocks').select('id').eq('blocker_id', userId).eq('blocked_id', targetProfileId).maybeSingle(),
      supabase.from('status_mutes').select('id').eq('user_id', userId).eq('muted_user_id', targetProfileId).maybeSingle(),
    ]);

    const profile = {
      ...profileData,
      followers_count: followersCount || 0,
      following_count: followingCount || 0,
      posts_count: postsCount || 0
    };

    const { data: posts } = await supabase
      .from('community_posts')
      .select('*, profiles!author_id(id, username, full_name, avatar_url, is_verified), community_likes(user_id), community_bookmarks(user_id), community_comments(id)')
      .eq('author_id', targetProfileId)
      .eq('status', 'public')
      .order('created_at', { ascending: false })
      .limit(20);

    const postsWithCommentCount = (posts || []).map(post => {
      const clean = {
        ...post,
        comments_count: post.community_comments?.length || 0,
        likes_count: post.community_likes?.length || 0,
        is_liked: (post.community_likes || []).some(l => l.user_id === userId)
      };
      delete clean.community_comments;
      delete clean.community_likes;
      delete clean.community_bookmarks;
      return clean;
    });

    logger.info('Profile viewed', { event: 'profile_viewed', user_id: userId, target_user_id: targetProfileId });

    res.json({ 
      profile, 
      posts: postsWithCommentCount, 
      isFollowing: !!follows,
      isBlocked: !!blockData,
      isMuted: !!muteData
    });
  } catch (err) { next(err); }
};

router.get("/profile/username/:identifier", profileViewLimiter, (req, res, next) => getProfileHandler(req, res, next, true));
router.get("/profile/:identifier", profileViewLimiter, (req, res, next) => getProfileHandler(req, res, next, false));

// Spaces
router.get("/spaces", spaceController.getSpaces);
router.get("/spaces/:spaceId", spaceController.getSpaceById);
router.post("/spaces", spaceController.createSpace);
router.post("/spaces/:spaceId/join", spaceController.joinSpace);
router.post("/spaces/:spaceId/ask", spaceAiController.askSpaceAi);
// AI Tutor: client AiTutorPanel.tsx posts to /community/spaces/:spaceId/tutor
router.post("/spaces/:spaceId/tutor", aiTutorController.tutorChat);

module.exports = router;

