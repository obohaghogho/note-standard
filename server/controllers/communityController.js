const supabase = require("../config/database");
const { createNotification, broadcastNotification } = require(
  "../services/notificationService",
);
const activityService = require('../services/activityService');
const feedRetrievalService = require('../services/feed/FeedRetrievalService');

/**
 * Creates a community post
 */
const createCommunityPost = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { title, content, post_type, category, tags, status, space_id, poll_options, link_url, code_language } = req.body;

    if (!title && !content) {
      return res.status(400).json({ error: "Title or content is required" });
    }

    const { data: post, error: postError } = await supabase
      .from("community_posts")
      .insert([{
        author_id: userId,
        space_id: space_id || null,
        title,
        content,
        post_type: post_type || 'text',
        category: category || 'General',
        tags: tags || [],
        status: status || 'public',
        poll_options,
        link_url,
        code_language
      }])
      .select('*, profiles!author_id(username, avatar_url)')
      .single();

    if (postError) throw postError;

    // Log activity
    await activityService.logActivity({
      userId,
      actionType: 'created_post',
      entityType: 'community_post',
      entityId: post.id
    });

    if (status === 'public') {
        // Broadcast a generic event, though we might want to let the feed handle this
        await broadcastNotification({
          senderId: userId,
          type: "community_post",
          title: "New Community Post",
          message: title || content?.substring(0, 50),
          link: `/dashboard/community/post/${post.id}`,
        });
    }

    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
};

/**
 * Adds a comment to a post
 */
const addComment = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { postId, content, parentId } = req.body;

    if (!postId || !content) {
      return res.status(400).json({
        error: "Post ID and content are required",
      });
    }

    const { data: comment, error: commentError } = await supabase
      .from("community_comments")
      .insert([{
        post_id: postId,
        author_id: userId,
        parent_id: parentId || null,
        content,
      }])
      .select("*, profiles!author_id(username, avatar_url)")
      .single();

    if (commentError) throw commentError;

    // Notify post owner
    const { data: post } = await supabase
      .from("community_posts")
      .select("author_id, title")
      .eq("id", postId)
      .single();

    if (post && post.author_id !== userId) {
      await createNotification({
        receiverId: post.author_id,
        senderId: userId,
        type: "comment",
        title: "New Comment on your post",
        message: content.substring(0, 50),
        link: `/dashboard/community/post/${postId}`,
      });
    }

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
};

/**
 * Toggles a like on a post
 */
const toggleLike = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { postId, reaction } = req.body;

    if (!postId) {
      return res.status(400).json({ error: "Post ID is required" });
    }

    const { data: existingLike } = await supabase
      .from("community_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingLike) {
      const { error: deleteError } = await supabase
        .from("community_likes")
        .delete()
        .eq("id", existingLike.id);
      if (deleteError) throw deleteError;
      return res.json({ liked: false });
    } else {
      const { error: insertError } = await supabase
        .from("community_likes")
        .insert([{ post_id: postId, user_id: userId, reaction: reaction || 'like' }]);
      if (insertError) throw insertError;

      // Log activity which triggers notification via EventBus
      const { data: post } = await supabase
        .from("community_posts")
        .select("author_id")
        .eq("id", postId)
        .single();

      await activityService.logActivity({
        userId,
        actionType: 'liked_post',
        entityType: 'community_post',
        entityId: postId,
        metadata: { post_owner_id: post?.author_id }
      });

      return res.json({ liked: true });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Get feed posts (V1 API)
 */
const getFeed = async (req, res, next) => {
    try {
        const { tab = 'latest', limit = 20, cursor } = req.query;
        
        const feedResult = await feedRetrievalService.getFeed({
          userId: req.user.id,
          tab,
          limit: parseInt(limit),
          cursor
        });

        res.json(feedResult);
    } catch (err) {
        next(err);
    }
}

module.exports = {
  createCommunityPost,
  addComment,
  toggleLike,
  getFeed
};
