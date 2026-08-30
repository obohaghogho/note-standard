const supabase = require("../config/database");
const { createNotification, broadcastNotification } = require(
  "../services/notificationService",
);
const activityService = require('../services/activityService');
const feedRetrievalService = require('../services/feed/FeedRetrievalService');
const logger = require('../utils/logger');

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
        link_url,
        code_language
      }])
      .select('*, profiles!author_id(username, avatar_url)')
      .single();

    if (postError) throw postError;

    // Handle Polls
    if (post_type === 'poll' && Array.isArray(poll_options) && poll_options.length >= 2) {
      const { data: poll } = await supabase
        .from('community_polls')
        .insert([{ post_id: post.id, question: title || content || 'Poll' }])
        .select('id')
        .single();
        
      if (poll) {
        const optionInserts = poll_options.map(opt => ({
          poll_id: poll.id,
          option_text: opt.option_text || opt,
          votes_count: 0
        }));
        await supabase.from('community_poll_options').insert(optionInserts);
        
        // Attach back to post so UI gets it immediately
        const { data: optionsData } = await supabase.from('community_poll_options').select('*').eq('poll_id', poll.id);
        post.poll_options = optionsData;
      }
    }

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

    // Notify post owner (via activity bus so the event-driven notification service handles it)
    const { data: post } = await supabase
      .from("community_posts")
      .select("author_id, title")
      .eq("id", postId)
      .single();

    const snippet = content.substring(0, 80);

    // Comment notification (or reply notification if parentId is set)
    if (parentId) {
      // Notify the parent comment author
      const { data: parentComment } = await supabase
        .from("community_comments")
        .select("author_id")
        .eq("id", parentId)
        .single();

      if (parentComment && parentComment.author_id !== userId) {
        await activityService.logActivity({
          userId,
          actionType: 'replied_comment',
          entityType: 'community_comment',
          entityId: comment.id,
          metadata: {
            comment_owner_id: parentComment.author_id,
            post_id: postId,
            snippet,
          }
        });
      }
    } else if (post && post.author_id !== userId) {
      await activityService.logActivity({
        userId,
        actionType: 'commented_post',
        entityType: 'community_post',
        entityId: postId,
        metadata: { post_owner_id: post.author_id, snippet }
      });
    }

    // Extract @mentions from content and notify each mentioned user
    const mentions = [...content.matchAll(/@(\w+)/g)].map(m => m[1]);
    if (mentions.length > 0) {
      const { data: mentionedProfiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('username', mentions);

      for (const mp of (mentionedProfiles || [])) {
        if (mp.id !== userId) {
          await activityService.logActivity({
            userId,
            actionType: 'mentioned_user',
            entityType: 'community_post',
            entityId: postId,
            metadata: { mentioned_user_id: mp.id, snippet }
          });
        }
      }
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
        .upsert(
          [{ post_id: postId, user_id: userId, reaction: reaction || 'like' }],
          { onConflict: 'post_id,user_id' }
        );
      
      if (insertError && insertError.code !== '23505') {
        throw insertError;
      }

      // Log activity which triggers notification via EventBus
      const { data: post } = await supabase
        .from("community_posts")
        .select("author_id")
        .eq("id", postId)
        .maybeSingle();

      if (post) {
        await activityService.logActivity({
          userId,
          actionType: 'liked_post',
          entityType: 'community_post',
          entityId: postId,
          metadata: { post_owner_id: post.author_id }
        }).catch(err => logger.warn('[Community] Activity log failed:', err.message));
      }

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
        const { tab = 'latest', limit = 20, cursor, category, sort, search } = req.query;
        
        const feedResult = await feedRetrievalService.getFeed({
          userId: req.user.id,
          tab,
          limit: parseInt(limit),
          cursor,
          category,
          sort,
          search,
        });

        res.json(feedResult);
    } catch (err) {
        next(err);
    }
}

const toggleBookmark = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { postId } = req.params;
    const { data: existing } = await supabase.from('community_bookmarks').select('id').eq('post_id', postId).eq('user_id', userId).maybeSingle();
    if (existing) {
      await supabase.from('community_bookmarks').delete().eq('id', existing.id);
      return res.json({ bookmarked: false });
    } else {
      await supabase.from('community_bookmarks').insert([{ post_id: postId, user_id: userId }]);
      return res.json({ bookmarked: true });
    }
  } catch (err) { next(err); }
};

const deletePost = async (req, res, next) => {
  try {
    const { id: userId, role } = req.user;
    const { postId } = req.params;

    let query = supabase.from('community_posts').delete().eq('id', postId);
    if (role !== 'admin' && role !== 'superadmin') {
      query = query.eq('author_id', userId);
    }

    const { error } = await query;
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
};

const editPost = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { postId } = req.params;
    const { title, content } = req.body;
    const { data, error } = await supabase.from('community_posts').update({ title, content, updated_at: new Date() }).eq('id', postId).eq('author_id', userId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const deleteComment = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { commentId } = req.params;
    const { error } = await supabase.from('community_comments').delete().eq('id', commentId).eq('author_id', userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
};

const editComment = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { commentId } = req.params;
    const { content } = req.body;
    const { data, error } = await supabase.from('community_comments').update({ content, is_edited: true }).eq('id', commentId).eq('author_id', userId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const toggleFollow = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { profileId } = req.params;
    const { data: existing } = await supabase.from('community_follows').select('id').eq('follower_id', userId).eq('following_id', profileId).maybeSingle();
    if (existing) {
      await supabase.from('community_follows').delete().eq('id', existing.id);
      logger.info('User unfollowed profile', { event: 'user_unfollowed', user_id: userId, target_user_id: profileId });
      return res.json({ following: false });
    } else {
      await supabase.from('community_follows').insert([{ follower_id: userId, following_id: profileId }]);
      // Fire follow notification via activity bus
      await activityService.logActivity({
        userId,
        actionType: 'followed_user',
        entityType: 'profile',
        entityId: profileId,
        metadata: { followed_user_id: profileId }
      });
      logger.info('User followed profile', { event: 'user_followed', user_id: userId, target_user_id: profileId });
      return res.json({ following: true });
    }
  } catch (err) { next(err); }
};

const reportItem = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { postId, commentId, reason } = req.body;
    const { data, error } = await supabase.from('community_reports').insert([{ reporter_id: userId, post_id: postId || null, comment_id: commentId || null, reason }]).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const reportUser = async (req, res, next) => {
  try {
    const { id: reporterId } = req.user;
    const { reportedId, reason, description } = req.body;
    if (!reportedId || !reason) {
      return res.status(400).json({ error: 'Reported user ID and reason are required' });
    }
    const { data, error } = await supabase.from('user_reports').insert([{ 
      reporter_id: reporterId, 
      reported_user_id: reportedId, 
      reason,
      description
    }]).select().single();
    
    if (error) {
        if (error.code === '23505') {
            return res.json({ success: true, message: 'User already reported' });
        }
        throw error;
    }
    
    logger.info('User reported another user', { event: 'user_reported', user_id: reporterId, target_user_id: reportedId, reason });
    res.json(data);
  } catch (err) { next(err); }
};

const votePollOption = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { postId, optionId } = req.params;

    // Verify poll option belongs to this post
    const { data: option } = await supabase
      .from('community_poll_options')
      .select('id, poll_id, community_polls!inner(post_id)')
      .eq('id', optionId)
      .eq('community_polls.post_id', postId)
      .single();

    if (!option) return res.status(404).json({ error: 'Poll option not found' });

    // Enforce one vote per user per poll (UNIQUE constraint also enforces this at DB level)
    const { data: existing } = await supabase
      .from('community_poll_votes')
      .select('id')
      .eq('poll_id', option.poll_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) return res.status(400).json({ error: 'Already voted' });

    // Insert vote — DB trigger (migration 229) atomically increments votes_count
    const { error: voteError } = await supabase.from('community_poll_votes').insert([{
      poll_id: option.poll_id,
      option_id: optionId,
      user_id: userId
    }]);

    if (voteError) throw voteError;

    // Read the trigger-updated count to return to the client
    const { data: updatedOpt } = await supabase
      .from('community_poll_options')
      .select('votes_count')
      .eq('id', optionId)
      .single();

    const newCount = updatedOpt?.votes_count ?? 0;

    // Broadcast real-time poll update to all clients viewing this post
    try {
      const realtime = require('../services/realtimeService');
      realtime.broadcast('community_event', { type: 'poll_voted', postId, optionId, newCount });
    } catch {
      // Realtime broadcast is non-critical — vote was still recorded
    }

    res.json({ success: true, optionId, votes_count: newCount });
  } catch (err) { next(err); }
};

const getComments = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { data, error } = await supabase
      .from('community_comments')
      .select('*, profiles!author_id(id, username, avatar_url, is_verified)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

const getReels = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { limit = 20, cursor } = req.query;
    const limitNum = parseInt(limit, 10) || 20;

    let query = supabase
      .from('community_posts')
      .select('*, author:profiles!community_posts_author_id_fkey(id, username, full_name, avatar_url)')
      .or('post_type.eq.video,post_type.eq.reel,is_reel.eq.true')
      .order('created_at', { ascending: false })
      .limit(limitNum + 1);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    let { data: posts, error } = await query;
    let targetPosts = posts || [];

    if (error || !targetPosts.length) {
      logger.warn(`[CommunityController] getReels primary query empty/failed (${error?.message}), querying posts with video media.`);
      const { data: fallbackPosts } = await supabase
        .from('community_posts')
        .select('*, author:profiles(id, username, full_name, avatar_url)')
        .not('media_urls', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limitNum + 1);
      targetPosts = fallbackPosts || [];
    }

    // Filter out posts that do not contain video media URLs
    targetPosts = targetPosts.filter(p => Array.isArray(p.media_urls) && p.media_urls.length > 0);

    const postIds = targetPosts.map(p => p.id);
    const authorIds = [...new Set(targetPosts.map(p => p.author_id).filter(Boolean))];

    // Hydrate author profiles if missing
    let authorMap = {};
    if (authorIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', authorIds);

      (profilesData || []).forEach(prof => {
        authorMap[prof.id] = prof;
      });
    }

    // Fetch user's likes & bookmarks for these posts if authenticated
    const userLikedPostIds = new Set();
    const userBookmarkedPostIds = new Set();
    const likesCountMap = {};
    const commentsCountMap = {};

    if (postIds.length > 0) {
      // 1. Fetch likes count & user likes
      const { data: likesData } = await supabase
        .from('community_likes')
        .select('post_id, user_id')
        .in('post_id', postIds);

      (likesData || []).forEach(l => {
        likesCountMap[l.post_id] = (likesCountMap[l.post_id] || 0) + 1;
        if (userId && l.user_id === userId) {
          userLikedPostIds.add(l.post_id);
        }
      });

      // 2. Fetch user bookmarks
      if (userId) {
        const { data: bookmarksData } = await supabase
          .from('community_bookmarks')
          .select('post_id')
          .eq('user_id', userId)
          .in('post_id', postIds);

        (bookmarksData || []).forEach(b => {
          userBookmarkedPostIds.add(b.post_id);
        });
      }

      // 3. Fetch comments count
      const { data: commentsData } = await supabase
        .from('community_comments')
        .select('post_id')
        .in('post_id', postIds);

      (commentsData || []).forEach(c => {
        commentsCountMap[c.post_id] = (commentsCountMap[c.post_id] || 0) + 1;
      });
    }

    const formatted = targetPosts.map(p => ({
      ...p,
      author: p.author || authorMap[p.author_id] || null,
      media_url: Array.isArray(p.media_urls) ? p.media_urls[0] : (p.media_urls || null),
      user_has_liked: userLikedPostIds.has(p.id),
      user_has_bookmarked: userBookmarkedPostIds.has(p.id),
      likes_count: likesCountMap[p.id] !== undefined ? likesCountMap[p.id] : (p.likes_count || 0),
      comments_count: commentsCountMap[p.id] !== undefined ? commentsCountMap[p.id] : (p.comments_count || 0),
    }));

    const hasMore = formatted.length > limitNum;
    const reelsList = formatted.slice(0, limitNum);
    const nextCursor = hasMore && reelsList.length > 0 ? reelsList[reelsList.length - 1].created_at : null;

    res.json({ reels: reelsList, hasMore, nextCursor });
  } catch (err) {
    logger.error('[CommunityController] getReels error:', err.message);
    res.status(200).json({ reels: [], hasMore: false, nextCursor: null });
  }
};

const createReel = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { content, videoUrl, thumbnailUrl, duration = 30, tags = [] } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ error: "videoUrl is required for Reels" });
    }

    // Automatically clamp duration to 90 seconds max for all Reels
    const clampedDuration = Math.min(Math.max(Math.round(Number(duration) || 30), 1), 90);

    let post;
    let { data, error } = await supabase
      .from('community_posts')
      .insert([{
        author_id: userId,
        content: content || '',
        post_type: 'reel',
        media_urls: [videoUrl],
        tags: Array.isArray(tags) ? tags : [],
        created_at: new Date().toISOString(),
      }])
      .select('*')
      .single();

    if (error) {
      logger.warn(`[CommunityController] Reel insert with post_type 'reel' failed (${error.message}), retrying with post_type 'video'.`);
      const retry = await supabase
        .from('community_posts')
        .insert([{
          author_id: userId,
          content: content || '',
          post_type: 'video',
          category: 'reel',
          media_urls: [videoUrl],
          tags: Array.isArray(tags) ? [...tags, 'reel'] : ['reel'],
          created_at: new Date().toISOString(),
        }])
        .select('*')
        .single();

      if (retry.error) throw retry.error;
      post = retry.data;
    } else {
      post = data;
    }

    res.status(201).json({
      success: true,
      reel: {
        ...post,
        media_url: videoUrl,
        thumbnail_url: thumbnailUrl || null,
        video_duration: clampedDuration,
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createCommunityPost,
  addComment,
  toggleLike,
  getFeed,
  getComments,
  toggleBookmark,
  deletePost,
  editPost,
  deleteComment,
  editComment,
  toggleFollow,
  reportItem,
  reportUser,
  votePollOption,
  getReels,
  createReel
};
