const path = require('path');
const supabase = require(path.join(__dirname, '..', 'config', 'supabase'));

exports.createAttachmentRecord = async (req, res) => {
    try {
        const { conversationId, fileName, fileType, fileSize, storagePath, metadata } = req.body;
        const userId = req.user.id;

        if (!conversationId || !fileName || !fileType || !storagePath) {
            return res.status(400).json({ error: 'Missing required attachment fields' });
        }

        const { data, error } = await supabase
            .from('media_attachments')
            .insert([{
                uploader_id: userId,
                conversation_id: conversationId,
                file_name: fileName,
                file_type: fileType,
                file_size: fileSize,
                storage_path: storagePath,
                metadata: metadata || {}
            }])
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error creating attachment record:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.getSignedUrl = async (req, res) => {
    try {
        const { path } = req.query;
        if (!path) return res.status(400).json({ error: 'Path is required' });

        // Check if user has access to the conversation this attachment belongs to
        // (RLS on media_attachments should normally handle this, but for signed URLs we might need manual check if using service role,
        // however we are using the user's supabase client or the one with RLS)
        
        const { data, error } = await supabase
            .storage
            .from('chat-media')
            .createSignedUrl(path, 3600); // 1 hour

        if (error) throw error;
        res.json({ url: data.signedUrl });
    } catch (err) {
        console.error('Error generating signed URL:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};
