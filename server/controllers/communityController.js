const supabase = require("../config/supabase");
const { createNotification, broadcastNotification } = require(
  "../services/notificationService",
);

/**
 * Creates a community post and notifies everyone
 */
const createCommunityPost = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { title, message, link } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    const io = req.app.get("io");

    await broadcastNotification({
      senderId: userId,
      type: "community_post",
      title: title,
      message: message,
      link: link || "/dashboard/feed",
      io,
    });

    res.json({ message: "Community post created and broadcasted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Adds a comment to a note and notifies the owner
 */
const addComment = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { noteId, content } = req.body;

    if (!noteId || !content) {
      return res.status(400).json({
        error: "Note ID and content are required",
      });
    }

    // 1. Insert comment
    const { data: comment, error: commentError } = await supabase
      .from("comments")
      .insert([{
        note_id: noteId,
        user_id: userId,
        content,
      }])
      .select("*")
      .single();

    if (commentError) throw commentError;

    // 2. Notify Note Owner
    try {
      const { data: note } = await supabase
        .from("notes")
        .select("owner_id, title")
        .eq("id", noteId)
        .single();

      if (note && note.owner_id !== userId) {
        const { data: commenter } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", userId)
          .single();

        const io = req.app.get("io");
        await createNotification({
          receiverId: note.owner_id,
          senderId: userId,
          type: "comment",
          title: "New Comment",
          message: `${
            commenter?.username || "Someone"
          } commented on your note: "${content.substring(0, 50)}${
            content.length > 50 ? "..." : ""
          }"`,
          link: `/dashboard/feed`, // Or link to the specific note view if exists
          io,
        });
      }
    } catch (notifErr) {
      console.error(
        "[Community] Failed to send comment notification:",
        notifErr.message,
      );
    }

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
};

/**
 * Toggles a like on a note and notifies the owner if liked
 */
const toggleLike = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { noteId } = req.body;

    if (!noteId) {
      return res.status(400).json({ error: "Note ID is required" });
    }

    // 1. Check if already liked
    const { data: existingLike } = await supabase
      .from("likes")
      .select("id")
      .eq("note_id", noteId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingLike) {
      // Remove Like
      const { error: deleteError } = await supabase
        .from("likes")
        .delete()
        .eq("id", existingLike.id);
      if (deleteError) throw deleteError;
      return res.json({ liked: false });
    } else {
      // Add Like
      const { error: insertError } = await supabase
        .from("likes")
        .insert([{ note_id: noteId, user_id: userId }]);
      if (insertError) throw insertError;

      // 2. Notify Note Owner
      try {
        const { data: note } = await supabase
          .from("notes")
          .select("owner_id, title")
          .eq("id", noteId)
          .single();

        if (note && note.owner_id !== userId) {
          const { data: liker } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .single();

          const io = req.app.get("io");
          await createNotification({
            receiverId: note.owner_id,
            senderId: userId,
            type: "like",
            title: "Note Liked",
            message: `${
              liker?.username || "Someone"
            } liked your public note: ${note.title}`,
            link: `/dashboard/feed`,
            io,
          });
        }
      } catch (notifErr) {
        console.error(
          "[Community] Failed to send like notification:",
          notifErr.message,
        );
      }

      return res.json({ liked: true });
    }
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createCommunityPost,
  addComment,
  toggleLike,
};
