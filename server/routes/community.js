const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { 
  createCommunityPost, addComment, toggleLike, getFeed, getComments,
  toggleBookmark, deletePost, editPost, deleteComment, editComment,
  toggleFollow, reportItem, reportUser, votePollOption, getReels, createReel, sharePost, getPostById
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
router.get("/post/:postId", getPostById);
router.put("/post/:postId", editPost);
router.delete("/post/:postId", deletePost);
router.post("/post/:postId/bookmark", toggleBookmark);
router.post("/post/:postId/share", sharePost);
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
    const isSelf = userId === targetProfileId;

    // Always query total active non-trashed notes created by target user
    const notesCountQuery = supabase
      .from('notes')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', targetProfileId)
      .is('deleted_at', null);

    // Check follow status & dynamic counts
    const [
      { data: follows }, 
      { count: followersCount }, 
      { count: followingCount }, 
      { count: postsCount }, 
      { count: notesCount },
      { data: blockData }, 
      { data: muteData }
    ] = await Promise.all([
      supabase.from('community_follows').select('id').eq('follower_id', userId).eq('following_id', targetProfileId).maybeSingle(),
      supabase.from('community_follows').select('*', { count: 'exact', head: true }).eq('following_id', targetProfileId),
      supabase.from('community_follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetProfileId),
      supabase.from('community_posts').select('*', { count: 'exact', head: true }).eq('author_id', targetProfileId).eq('status', 'public'),
      notesCountQuery,
      supabase.from('user_blocks').select('id').eq('blocker_id', userId).eq('blocked_id', targetProfileId).maybeSingle(),
      supabase.from('status_mutes').select('id').eq('user_id', userId).eq('muted_user_id', targetProfileId).maybeSingle(),
    ]);

    // Compute total likes received on user's posts
    const { data: authorPosts } = await supabase
      .from('community_posts')
      .select('id')
      .eq('author_id', targetProfileId);

    const authorPostIds = (authorPosts || []).map(p => p.id);
    let totalLikesReceived = 0;
    if (authorPostIds.length > 0) {
      const { count: likesCount } = await supabase
        .from('community_likes')
        .select('*', { count: 'exact', head: true })
        .in('post_id', authorPostIds);
      totalLikesReceived = likesCount || 0;
    }

    const profile = {
      ...profileData,
      followers_count: followersCount || 0,
      following_count: followingCount || 0,
      posts_count: postsCount || 0,
      notes_count: notesCount ?? profileData.note_count ?? 0,
      likes_count: totalLikesReceived
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
        is_liked: (post.community_likes || []).some(l => l.user_id === userId),
        media_url: Array.isArray(post.media_urls) && post.media_urls.length > 0 ? post.media_urls[0] : (post.media_url || null),
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

// Followers list
router.get("/profile/:profileId/followers", async (req, res, next) => {
  try {
    const { profileId } = req.params;
    const { data: follows } = await supabase
      .from('community_follows')
      .select('follower_id')
      .eq('following_id', profileId);

    const followerIds = (follows || []).map(f => f.follower_id);
    if (followerIds.length === 0) return res.json([]);

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, is_verified, bio')
      .in('id', followerIds);

    if (error) throw error;
    res.json(profiles || []);
  } catch (err) { next(err); }
});

// Following list
router.get("/profile/:profileId/following", async (req, res, next) => {
  try {
    const { profileId } = req.params;
    const { data: follows } = await supabase
      .from('community_follows')
      .select('following_id')
      .eq('follower_id', profileId);

    const followingIds = (follows || []).map(f => f.following_id);
    if (followingIds.length === 0) return res.json([]);

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, is_verified, bio')
      .in('id', followingIds);

    if (error) throw error;
    res.json(profiles || []);
  } catch (err) { next(err); }
});

// Notes list for profile
router.get("/profile/:profileId/notes", async (req, res, next) => {
  try {
    const { profileId } = req.params;
    const userId = req.user.id;
    const isSelf = userId === profileId;

    let query = supabase
      .from('notes')
      .select('id, title, content, created_at, owner_id, is_private')
      .eq('owner_id', profileId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!isSelf) {
      query = query.eq('is_private', false);
    }

    const { data: publicNotes, error } = await query;
    if (error && error.code !== '42P01') throw error;

    const { count: totalActiveCount } = await supabase
      .from('notes')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', profileId)
      .is('deleted_at', null);

    const notesList = publicNotes || [];
    const total = totalActiveCount || notesList.length;
    const privateCount = Math.max(0, total - notesList.length);

    res.json({
      notes: notesList,
      totalCount: total,
      publicCount: notesList.length,
      privateCount: isSelf ? 0 : privateCount
    });
  } catch (err) { next(err); }
});

// Liked posts list for profile
router.get("/profile/:profileId/likes", async (req, res, next) => {
  try {
    const { profileId } = req.params;
    const { data: likes } = await supabase
      .from('community_likes')
      .select('post_id')
      .eq('user_id', profileId);

    const postIds = (likes || []).map(l => l.post_id);
    if (postIds.length === 0) return res.json([]);

    const { data: posts, error } = await supabase
      .from('community_posts')
      .select('*, profiles!author_id(id, username, full_name, avatar_url, is_verified), community_likes(user_id), community_bookmarks(user_id), community_comments(id)')
      .in('id', postIds)
      .eq('status', 'public')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (posts || []).map(post => ({
      ...post,
      comments_count: post.community_comments?.length || 0,
      likes_count: post.community_likes?.length || 0,
      is_liked: (post.community_likes || []).some(l => l.user_id === req.user.id),
      media_url: Array.isArray(post.media_urls) && post.media_urls.length > 0 ? post.media_urls[0] : (post.media_url || null),
    }));

    res.json(formatted);
  } catch (err) { next(err); }
});

// Spaces
router.get("/spaces", spaceController.getSpaces);
router.get("/spaces/:spaceId", spaceController.getSpaceById);
router.post("/spaces", spaceController.createSpace);
router.post("/spaces/:spaceId/join", spaceController.joinSpace);
router.post("/spaces/:spaceId/ask", spaceAiController.askSpaceAi);
// AI Tutor: client AiTutorPanel.tsx posts to /community/spaces/:spaceId/tutor
router.post("/spaces/:spaceId/tutor", aiTutorController.tutorChat);

module.exports = router;

