const path = require('path');
const supabase = require(path.join(__dirname, '..', 'config', 'supabase'));
const audioProcessor = require('../services/audioProcessor');

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

exports.processAudio = async (req, res) => {
    try {
        const { storagePath, conversationId } = req.body;
        const userId = req.user.id;

        if (!storagePath || !conversationId) {
            return res.status(400).json({ error: 'Storage path and conversation ID are required' });
        }

        // 1. Process and convert the audio
        const processed = await audioProcessor.convertToM4A(storagePath, conversationId);

        // 2. Create Attachment Record
        const { data, error } = await supabase
            .from('media_attachments')
            .insert([{
                uploader_id: userId,
                conversation_id: conversationId,
                file_name: processed.fileName,
                file_type: processed.mimeType,
                file_size: processed.size,
                storage_path: processed.storagePath,
                metadata: { 
                    original_path: storagePath,
                    converted: true,
                    mimeType: processed.mimeType
                }
            }])
            .select()
            .single();

        if (error) throw error;

        // 3. Delete the original (optional but recommended for storage management)
        // We do it async to not block the response
        supabase.storage.from('chat-media').remove([storagePath]).catch(e => console.error('Cleanup error:', e));

        res.json(data);
    } catch (err) {
        console.error('[MediaController] ProcessAudio Error:', err.message);
        res.status(500).json({ error: err.message || 'Processing failed' });
    }
};

exports.getSignedUrl = async (req, res) => {
    try {
        const { path } = req.query;
        if (!path) return res.status(400).json({ error: 'Path is required' });

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
