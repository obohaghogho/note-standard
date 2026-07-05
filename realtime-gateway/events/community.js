/**
 * Community Event Handler — NoteStandard Realtime Gateway
 *
 * Handles real-time events for the Community module:
 *  - community:join            — join a community feed or specific post room
 *  - community:leave           — leave a room
 *  - community:post_created    — relay new post
 *  - community:post_deleted    — relay post deletion
 *  - community:post_edited     — relay post edit
 *  - community:comment_added   — relay new comment
 *  - community:comment_deleted — relay comment deletion
 *  - community:like_toggled    — relay like/unlike action
 */

module.exports = (io, socket) => {
  const userId = socket.userId;

  // ── Room Management ──────────────────────────────────────────────────────

  // Join the global community feed room
  socket.on('community:join_feed', () => {
    socket.join('community_feed');
    console.log(`[Community] User ${userId} joined community_feed`);
  });

  socket.on('community:leave_feed', () => {
    socket.leave('community_feed');
    console.log(`[Community] User ${userId} left community_feed`);
  });

  // Join a specific post room (for real-time comments/likes on detail view)
  socket.on('community:join_post', (postId) => {
    if (!postId) return;
    socket.join(`community_post:${postId}`);
    console.log(`[Community] User ${userId} joined post: ${postId}`);
  });

  socket.on('community:leave_post', (postId) => {
    if (!postId) return;
    socket.leave(`community_post:${postId}`);
    console.log(`[Community] User ${userId} left post: ${postId}`);
  });

  // ── Event Relays ─────────────────────────────────────────────────────────

  socket.on('community:post_created', (data) => {
    const { post } = data || {};
    if (!post) return;
    
    // Relay to global feed
    socket.to('community_feed').emit('community:post_created', {
      userId,
      post,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('community:post_deleted', (data) => {
    const { postId } = data || {};
    if (!postId) return;
    
    socket.to('community_feed').emit('community:post_deleted', { postId });
    socket.to(`community_post:${postId}`).emit('community:post_deleted', { postId });
  });

  socket.on('community:post_edited', (data) => {
    const { postId, updates } = data || {};
    if (!postId || !updates) return;
    
    socket.to('community_feed').emit('community:post_edited', { postId, updates });
    socket.to(`community_post:${postId}`).emit('community:post_edited', { postId, updates });
  });

  socket.on('community:comment_added', (data) => {
    const { postId, comment } = data || {};
    if (!postId || !comment) return;
    
    // Notify users viewing this post
    socket.to(`community_post:${postId}`).emit('community:comment_added', {
      userId,
      postId,
      comment
    });

    // Also notify users on the global feed of the count update
    socket.to('community_feed').emit('community:comment_count_updated', {
      postId,
      type: 'add'
    });
  });

  socket.on('community:comment_deleted', (data) => {
    const { postId, commentId } = data || {};
    if (!postId || !commentId) return;
    
    socket.to(`community_post:${postId}`).emit('community:comment_deleted', {
      postId,
      commentId
    });

    // Also notify users on the global feed of the count update
    socket.to('community_feed').emit('community:comment_count_updated', {
      postId,
      type: 'delete'
    });
  });

  socket.on('community:like_toggled', (data) => {
    const { postId, isLiked, count } = data || {};
    if (!postId) return;
    
    const payload = { userId, postId, isLiked, count };
    
    // Update people on the feed
    socket.to('community_feed').emit('community:like_toggled', payload);
    // Update people viewing the specific post
    socket.to(`community_post:${postId}`).emit('community:like_toggled', payload);
  });
};
