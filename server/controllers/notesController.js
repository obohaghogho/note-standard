const supabase = require("../config/database");
const { createNotification, broadcastNotification } = require(
  "../services/notificationService",
);
const analyticsService = require("../services/analyticsService");
const realtime = require("../services/realtimeService");
const pool = require("../config/pgPool");
const exportService = require("../services/exportService");

async function broadcastTrendUpdate(app) {
  try {
    const stats = await analyticsService.getRealtimeStats();
    if (stats) {
      realtime.broadcast("stats_updated", stats);
    }
  } catch (err) {
    console.error("[Trends] Broadcast failed:", err.message);
  }
}

// Get all notes for the authenticated user
const getNotes = async (req, res) => {
  try {
    const { id } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { data, error } = await supabase
      .from("notes")
      .select("id, title, content, is_private, is_favorite, tags, created_at, updated_at")
      .eq("owner_id", id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get a single note by ID
const getNote = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;

    const { data, error } = await supabase
      .from("notes")
      .select("id, title, content, is_private, is_favorite, tags, created_at, updated_at")
      .eq("id", noteId)
      .eq("owner_id", userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Note not found" });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create a new note
const createNote = async (req, res) => {
  try {
    const { id } = req.user;
    const { title, content, is_private } = req.body;

    const { data, error } = await supabase
      .from("notes")
      .insert([
        { owner_id: id, title, content, is_private: is_private ?? true },
      ])
      .select();

    if (error) throw error;
    const newNote = data[0];
    res.status(201).json(newNote);

    // --- Community Post Notification ---
    if (is_private === false) {
      try {
        const { data: author } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", id)
          .single();

        await broadcastNotification({
          senderId: id,
          type: "community_post",
          title: "New Community Post",
          message: `${
            author?.username || "Someone"
          } shared a new note: ${newNote.title}`,
          link: `/dashboard/feed`,
        });
      } catch (communityErr) {
        console.error("Failed to send community notification:", communityErr);
      }
    }

    // --- Trigger Trend Update ---
    broadcastTrendUpdate(req.app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update a note
const updateNote = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;
    
    const { 
      title, content, is_private, is_archived, is_favorite, is_pinned, 
      category_id, tags, cover_image, color, reminder_at, reminder_completed, repeat_type,
      metadata, note_type, version, word_count, reading_time
    } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (is_private !== undefined) updateData.is_private = is_private;
    if (is_archived !== undefined) updateData.is_archived = is_archived;
    if (is_favorite !== undefined) updateData.is_favorite = is_favorite;
    if (is_pinned !== undefined) updateData.is_pinned = is_pinned;
    if (category_id !== undefined) updateData.category_id = category_id;
    if (tags !== undefined) updateData.tags = tags;
    if (cover_image !== undefined) updateData.cover_image = cover_image;
    if (color !== undefined) updateData.color = color;
    if (reminder_at !== undefined) updateData.reminder_at = reminder_at;
    if (reminder_completed !== undefined) updateData.reminder_completed = reminder_completed;
    if (repeat_type !== undefined) updateData.repeat_type = repeat_type;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (note_type !== undefined) updateData.note_type = note_type;
    if (version !== undefined) updateData.version = version;
    if (word_count !== undefined) updateData.word_count = word_count;
    if (reading_time !== undefined) updateData.reading_time = reading_time;

    // Fetch current note state to check if it's being made public
    const { data: currentNote } = await supabase
      .from("notes")
      .select("is_private")
      .eq("id", noteId)
      .single();

    const { data, error } = await supabase
      .from("notes")
      .update(updateData)
      .eq("id", noteId)
      .eq("owner_id", userId) // Security: ensure ownership
      .select();

    if (error) throw error;
    if (data.length === 0) {
      return res.status(404).json({ error: "Note not found" });
    }

    const updatedNote = data[0];
    res.json(updatedNote);

    // --- Notification Logic for Shared Note Edits ---
    try {
      // Find who this note is shared with
      const { data: shares } = await supabase
        .from("shared_notes")
        .select("shared_with_user_id")
        .eq("note_id", noteId);

      if (shares && shares.length > 0) {
        // Fetch editor info
        const { data: editor } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", userId)
          .single();

        for (const share of shares) {
          await createNotification({
            receiverId: share.shared_with_user_id,
            senderId: userId,
            type: "note_edit",
            title: "Shared Note Updated",
            message: `${editor?.username || "Someone"} updated the note: ${
              updatedNote.title || "Untitled"
            }`,
            link: `/notes/${noteId}`,
          });

          // Notify in real-time
          await realtime.emitToUser(share.shared_with_user_id, "note_updated", {
            noteId,
            updatedBy: userId,
            note: updatedNote
          });
        }
      }
    } catch (notifErr) {
      console.error("Failed to send edit notification:", notifErr);
    }

    // --- Community Post Notification ---
    if (currentNote?.is_private === true && is_private === false) {
      try {
        const { data: author } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", userId)
          .single();

        await broadcastNotification({
          senderId: userId,
          type: "community_post",
          title: "New Community Post",
          message: `${
            author?.username || "Someone"
          } shared a note with the community: ${updatedNote.title}`,
          link: `/dashboard/feed`,
        });
      } catch (communityErr) {
        console.error("Failed to send community notification:", communityErr);
      }
    }

    // --- Trigger Trend Update ---
    broadcastTrendUpdate(req.app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a note
const deleteNote = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;

    const { error } = await supabase
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("owner_id", userId);

    if (error) throw error;
    res.json({ message: "Note deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Share a note with another user
const shareNote = async (req, res) => {
  try {
    const { id: ownerId } = req.user;
    const { noteId, targetEmail, permission } = req.body;

    // 1. Resolve target email to user ID
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("email", targetEmail)
      .single();

    if (profileError || !targetProfile) {
      return res.status(404).json({ error: "User not found" });
    }

    const targetUserId = targetProfile.id;

    // 2. Security: Verify ownership
    const { data: note, error: noteError } = await supabase
      .from("notes")
      .select("title")
      .eq("id", noteId)
      .eq("owner_id", ownerId)
      .single();

    if (noteError || !note) {
      return res.status(403).json({ error: "Unauthorized or note not found" });
    }

    // 3. Create share record
    const { error: shareError } = await supabase
      .from("shared_notes")
      .insert({
        note_id: noteId,
        shared_with_user_id: targetUserId,
        shared_by: ownerId,
        permission: permission || "read",
      });

    if (shareError) throw shareError;

    res.json({ message: "Note shared successfully" });

    // 4. Trigger Notification
    const { data: owner } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", ownerId)
      .single();

    await createNotification({
      receiverId: targetUserId,
      senderId: ownerId,
      type: "note_share",
      title: "New Shared Note",
      message: `${
        owner?.username || "Someone"
      } shared a note with you: ${note.title}`,
      link: `/notes/${noteId}`,
    });

    // Notify in real-time
    await realtime.emitToUser(targetUserId, "shared_note_received", {
      noteId,
      sharedBy: ownerId,
      noteTitle: note.title
    });
  } catch (err) {
    console.error("Error sharing note:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Full-Text Search across notes
const searchNotes = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.json([]);
    }

    // Format query for plainto_tsquery or to_tsquery
    // Replace non-alphanumeric words with space, split, join with & for prefix match
    const keywords = q.trim().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
    if (keywords.length === 0) {
      return res.json([]);
    }
    
    // Create query string: 'word1:* & word2:*' (supports prefix matching)
    const cleanQuery = keywords.map(kw => `${kw}:*`).join(" & ");

    const { rows } = await pool.query(
      `SELECT id, title, content, note_type, cover_image, color, word_count, reading_time, is_pinned, is_archived, created_at, updated_at,
              ts_rank(search_vector, to_tsquery('english', $2)) as rank
       FROM notes
       WHERE owner_id = $1 AND deleted_at IS NULL AND search_vector @@ to_tsquery('english', $2)
       ORDER BY rank DESC`,
      [userId, cleanQuery]
    );

    res.json(rows);
  } catch (err) {
    console.error("[NotesController] searchNotes error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Export note into different formats
const exportNote = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;
    const { format } = req.query;

    const result = await exportService.exportNote(noteId, userId, format);

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (err) {
    console.error("[NotesController] exportNote error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Get soft-deleted trash notes
const getTrashNotes = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { rows } = await pool.query(
      "SELECT id, title, note_type, deleted_at, cover_image, color FROM notes WHERE owner_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("[NotesController] getTrashNotes error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Restore a soft-deleted note
const restoreNote = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;
    const { rows } = await pool.query(
      "UPDATE notes SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 AND owner_id = $2 RETURNING *",
      [noteId, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Note not found in trash" });
    }
    res.json({ message: "Note restored successfully", note: rows[0] });
  } catch (err) {
    console.error("[NotesController] restoreNote error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Permanently delete a note
const deleteNotePermanently = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;
    const { rows } = await pool.query(
      "DELETE FROM notes WHERE id = $1 AND owner_id = $2 RETURNING *",
      [noteId, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Note not found" });
    }
    res.json({ message: "Note permanently deleted" });
  } catch (err) {
    console.error("[NotesController] deleteNotePermanently error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Get shared note permissions
const getNotePermissions = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;
    
    // Verify ownership
    const ownership = await pool.query("SELECT id FROM notes WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL", [noteId, userId]);
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: "Only note owners can view permissions" });
    }

    const { rows } = await pool.query(
      `SELECT p.id, p.role, pr.email, pr.username 
       FROM note_permissions p 
       JOIN profiles pr ON p.user_id = pr.id 
       WHERE p.note_id = $1`,
      [noteId]
    );
    res.json(rows);
  } catch (err) {
    console.error("[NotesController] getNotePermissions error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Update/upsert sharing permission role
const updateNotePermission = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;
    const { email, role } = req.body;

    // Verify ownership
    const ownership = await pool.query("SELECT id FROM notes WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL", [noteId, userId]);
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: "Only note owners can change permissions" });
    }

    // Resolve email to user
    const userRes = await pool.query("SELECT id FROM profiles WHERE email = $1 LIMIT 1", [email]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const targetUserId = userRes.rows[0].id;

    if (targetUserId === userId) {
      return res.status(400).json({ error: "Cannot alter owner permission" });
    }

    const { rows } = await pool.query(
      `INSERT INTO note_permissions (note_id, user_id, role) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (note_id, user_id) 
       DO UPDATE SET role = EXCLUDED.role 
       RETURNING *`,
      [noteId, targetUserId, role]
    );

    res.json({ message: "Permissions updated successfully", permission: rows[0] });
  } catch (err) {
    console.error("[NotesController] updateNotePermission error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Create threaded comment on a note
const createNoteComment = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;
    const { comment, parentCommentId } = req.body;

    // Access check
    const access = await pool.query(
      `SELECT n.id FROM notes n
       LEFT JOIN note_permissions p ON n.id = p.note_id AND p.user_id = $2
       WHERE n.id = $1 AND n.deleted_at IS NULL AND (n.owner_id = $2 OR p.id IS NOT NULL OR n.is_private = false)
       LIMIT 1`,
      [noteId, userId]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { rows } = await pool.query(
      `INSERT INTO note_comments (note_id, user_id, comment, parent_comment_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [noteId, userId, comment, parentCommentId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("[NotesController] createNoteComment error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Get comments list
const getNoteComments = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;

    // Access check
    const access = await pool.query(
      `SELECT n.id FROM notes n
       LEFT JOIN note_permissions p ON n.id = p.note_id AND p.user_id = $2
       WHERE n.id = $1 AND n.deleted_at IS NULL AND (n.owner_id = $2 OR p.id IS NOT NULL OR n.is_private = false)
       LIMIT 1`,
      [noteId, userId]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { rows } = await pool.query(
      `SELECT c.id, c.comment, c.parent_comment_id, c.created_at, pr.username, pr.avatar_url 
       FROM note_comments c 
       JOIN profiles pr ON c.user_id = pr.id 
       WHERE c.note_id = $1 
       ORDER BY c.created_at ASC`,
      [noteId]
    );
    res.json(rows);
  } catch (err) {
    console.error("[NotesController] getNoteComments error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Delete/revoke a note permission record
const deleteNotePermission = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId, userPermissionId } = req.params;

    // Verify ownership
    const ownership = await pool.query("SELECT id FROM notes WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL", [noteId, userId]);
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: "Only note owners can delete permissions" });
    }

    await pool.query("DELETE FROM note_permissions WHERE note_id = $1 AND user_id = $2", [noteId, userPermissionId]);
    res.json({ message: "Permission revoked successfully" });
  } catch (err) {
    console.error("[NotesController] deleteNotePermission error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

const getNoteFiles = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;

    // 1. Verify access (owner or shared)
    const access = await pool.query(
      `SELECT n.id FROM notes n
       LEFT JOIN note_permissions p ON n.id = p.note_id AND p.user_id = $2
       WHERE n.id = $1 AND n.deleted_at IS NULL AND (n.owner_id = $2 OR p.id IS NOT NULL OR n.is_private = false)
       LIMIT 1`,
      [noteId, userId]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    // 2. Fetch files from note_files
    const { rows } = await pool.query(
      "SELECT id, file_name, mime_type, file_size, storage_key, created_at FROM note_files WHERE note_id = $1 ORDER BY created_at DESC",
      [noteId]
    );

    res.json(rows);
  } catch (err) {
    console.error("[notesController] getNoteFiles error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

const uploadNoteFile = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // 1. Verify access (owner or editor permission)
    const access = await pool.query(
      `SELECT n.id, n.owner_id FROM notes n
       LEFT JOIN note_permissions p ON n.id = p.note_id AND p.user_id = $2
       WHERE n.id = $1 AND n.deleted_at IS NULL AND (n.owner_id = $2 OR (p.id IS NOT NULL AND p.role IN ('owner', 'editor')) OR n.is_private = false)
       LIMIT 1`,
      [noteId, userId]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: "Access denied or editor role required to add attachments" });
    }

    const file = req.file;
    const storageKey = `notes/${noteId}/${Date.now()}_${file.originalname}`;

    // 2. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(storageKey, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 3. Insert record in note_files
    const { rows } = await pool.query(
      `INSERT INTO note_files (note_id, file_name, mime_type, file_size, storage_provider, storage_key) 
       VALUES ($1, $2, $3, $4, 'supabase', $5) 
       RETURNING *`,
      [noteId, file.originalname, file.mimetype, file.size, storageKey]
    );

    // 4. Log Activity
    await pool.query(
      `INSERT INTO note_activities (note_id, user_id, action_type, details) 
       VALUES ($1, $2, 'edited', $3)`,
      [noteId, userId, JSON.stringify({ action: "uploaded_attachment", file_name: file.originalname })]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("[notesController] uploadNoteFile error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

const downloadNoteFile = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId, fileId } = req.params;

    // 1. Verify access
    const access = await pool.query(
      `SELECT n.id FROM notes n
       LEFT JOIN note_permissions p ON n.id = p.note_id AND p.user_id = $2
       WHERE n.id = $1 AND n.deleted_at IS NULL AND (n.owner_id = $2 OR p.id IS NOT NULL OR n.is_private = false)
       LIMIT 1`,
      [noteId, userId]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    // 2. Fetch file details
    const fileRes = await pool.query(
      "SELECT storage_key, file_name FROM note_files WHERE id = $1 AND note_id = $2 LIMIT 1",
      [fileId, noteId]
    );
    if (fileRes.rows.length === 0) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    const { storage_key, file_name } = fileRes.rows[0];

    // 3. Create signed URL for downloading
    const { data, error } = await supabase.storage
      .from('chat-media')
      .createSignedUrl(storage_key, 3600, {
        download: file_name
      });

    if (error) throw error;
    res.json({ url: data.signedUrl });
  } catch (err) {
    console.error("[notesController] downloadNoteFile error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

const deleteNoteFile = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id: noteId, fileId } = req.params;

    // 1. Verify editor access
    const access = await pool.query(
      `SELECT n.id FROM notes n
       LEFT JOIN note_permissions p ON n.id = p.note_id AND p.user_id = $2
       WHERE n.id = $1 AND n.deleted_at IS NULL AND (n.owner_id = $2 OR (p.id IS NOT NULL AND p.role IN ('owner', 'editor')) OR n.is_private = false)
       LIMIT 1`,
      [noteId, userId]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: "Access denied or editor role required to delete attachments" });
    }

    // 2. Fetch file details
    const fileRes = await pool.query(
      "SELECT storage_key, file_name FROM note_files WHERE id = $1 AND note_id = $2 LIMIT 1",
      [fileId, noteId]
    );
    if (fileRes.rows.length === 0) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    const { storage_key, file_name } = fileRes.rows[0];

    // 3. Delete from Supabase storage
    await supabase.storage
      .from('chat-media')
      .remove([storage_key]);

    // 4. Delete from database
    await pool.query(
      "DELETE FROM note_files WHERE id = $1 AND note_id = $2",
      [fileId, noteId]
    );

    // 5. Log Activity
    await pool.query(
      `INSERT INTO note_activities (note_id, user_id, action_type, details) 
       VALUES ($1, $2, 'edited', $3)`,
      [noteId, userId, JSON.stringify({ action: "deleted_attachment", file_name })]
    );

    res.json({ message: "Attachment deleted successfully" });
  } catch (err) {
    console.error("[notesController] deleteNoteFile error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  shareNote,
  searchNotes,
  exportNote,
  getTrashNotes,
  restoreNote,
  deleteNotePermanently,
  getNotePermissions,
  updateNotePermission,
  createNoteComment,
  getNoteComments,
  deleteNotePermission,
  getNoteFiles,
  uploadNoteFile,
  downloadNoteFile,
  deleteNoteFile,
};
