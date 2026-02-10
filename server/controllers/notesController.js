const supabase = require('../config/supabase');
const { createNotification, broadcastNotification } = require('../services/notificationService');
require('dotenv').config();

// Get all notes for the authenticated user
const getNotes = async (req, res) => {
    try {
        const { id } = req.user;
        const { data, error } = await supabase
            .from('notes')
            .select('*')
            .eq('owner_id', id)
            .order('created_at', { ascending: false });

        if (error) throw error;
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
            .from('notes')
            .insert([
                { owner_id: id, title, content, is_private: is_private ?? true }
            ])
            .select();

        if (error) throw error;
        const newNote = data[0];
        res.status(201).json(newNote);

        // --- Community Post Notification ---
        if (is_private === false) {
            const io = req.app.get('io');
            try {
                const { data: author } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', id)
                    .single();

                await broadcastNotification({
                    senderId: id,
                    type: 'community_post',
                    title: 'New Community Post',
                    message: `${author?.username || 'Someone'} shared a new note: ${newNote.title}`,
                    link: `/dashboard/feed`,
                    io
                });
            } catch (communityErr) {
                console.error('Failed to send community notification:', communityErr);
            }
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Update a note
const updateNote = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { id: noteId } = req.params;
        const { title, content, is_private } = req.body;

        // Fetch current note state to check if it's being made public
        const { data: currentNote } = await supabase
            .from('notes')
            .select('is_private')
            .eq('id', noteId)
            .single();

        const { data, error } = await supabase
            .from('notes')
            .update({ title, content, is_private })
            .eq('id', noteId)
            .eq('owner_id', userId) // Security: ensure ownership
            .select();

        if (error) throw error;
        if (data.length === 0) return res.status(404).json({ error: 'Note not found' });

        const updatedNote = data[0];
        res.json(updatedNote);

        // --- Notification Logic for Shared Note Edits ---
        const io = req.app.get('io');
        try {
            // Find who this note is shared with
            const { data: shares } = await supabase
                .from('shared_notes')
                .select('shared_with_user_id')
                .eq('note_id', noteId);

            if (shares && shares.length > 0) {
                // Fetch editor info
                const { data: editor } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', userId)
                    .single();

                for (const share of shares) {
                    await createNotification({
                        receiverId: share.shared_with_user_id,
                        senderId: userId,
                        type: 'note_edit',
                        title: 'Shared Note Updated',
                        message: `${editor?.username || 'Someone'} updated the note: ${updatedNote.title || 'Untitled'}`,
                        link: `/notes/${noteId}`,
                        io
                    });
                }
            }
        } catch (notifErr) {
            console.error('Failed to send edit notification:', notifErr);
        }

        // --- Community Post Notification ---
        if (currentNote?.is_private === true && is_private === false) {
            try {
                const { data: author } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', userId)
                    .single();

                await broadcastNotification({
                    senderId: userId,
                    type: 'community_post',
                    title: 'New Community Post',
                    message: `${author?.username || 'Someone'} shared a note with the community: ${updatedNote.title}`,
                    link: `/dashboard/feed`,
                    io
                });
            } catch (communityErr) {
                console.error('Failed to send community notification:', communityErr);
            }
        }
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
            .from('notes')
            .delete()
            .eq('id', noteId)
            .eq('owner_id', userId);

        if (error) throw error;
        res.json({ message: 'Note deleted successfully' });
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
            .from('profiles')
            .select('id, username')
            .eq('email', targetEmail)
            .single();

        if (profileError || !targetProfile) {
            return res.status(404).json({ error: 'User not found' });
        }

        const targetUserId = targetProfile.id;

        // 2. Security: Verify ownership
        const { data: note, error: noteError } = await supabase
            .from('notes')
            .select('title')
            .eq('id', noteId)
            .eq('owner_id', ownerId)
            .single();

        if (noteError || !note) {
            return res.status(403).json({ error: 'Unauthorized or note not found' });
        }

        // 3. Create share record
        const { error: shareError } = await supabase
            .from('shared_notes')
            .insert({
                note_id: noteId,
                shared_with_user_id: targetUserId,
                permission: permission || 'read'
            });

        if (shareError) throw shareError;

        res.json({ message: 'Note shared successfully' });

        // 4. Trigger Notification
        const io = req.app.get('io');
        const { data: owner } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', ownerId)
            .single();

        await createNotification({
            receiverId: targetUserId,
            senderId: ownerId,
            type: 'note_share',
            title: 'New Shared Note',
            message: `${owner?.username || 'Someone'} shared a note with you: ${note.title}`,
            link: `/notes/${noteId}`,
            io
        });

    } catch (err) {
        console.error('Error sharing note:', err.message);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getNotes,
    createNote,
    updateNote,
    deleteNote,
    shareNote
};
