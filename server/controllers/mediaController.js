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
        const { storagePath, conversationId, mimeType, fileSize } = req.body;
        const userId = req.user.id;

        if (!storagePath || !conversationId) {
            return res.status(400).json({ error: 'Storage path and conversation ID are required' });
        }

        const normalizedMime = (mimeType || '').toLowerCase();
        const isNativeMp4 = normalizedMime.includes('mp4') || normalizedMime.includes('m4a') || normalizedMime.includes('aac') || storagePath.endsWith('.m4a') || storagePath.endsWith('.mp4');

        if (isNativeMp4) {
            const timestamp = Date.now();
            const finalFileName = `voice_${timestamp}.m4a`;
            const finalPath = `${conversationId}/${finalFileName}`;

            // Move the storage object from temp/raw_... to final conversation folder
            const { error: moveError } = await supabase.storage
                .from('chat-media')
                .move(storagePath, finalPath);

            const activePath = moveError ? storagePath : finalPath;
            const activeName = moveError ? path.basename(storagePath) : finalFileName;

            const { data, error } = await supabase
                .from('media_attachments')
                .insert([{
                    uploader_id: userId,
                    conversation_id: conversationId,
                    file_name: activeName,
                    file_type: 'audio/mp4',
                    file_size: fileSize || 0,
                    storage_path: activePath,
                    metadata: {
                        original_path: storagePath,
                        passthrough: true,
                        mimeType: 'audio/mp4'
                    }
                }])
                .select()
                .single();

            if (error) throw error;
            return res.json(data);
        }

        // Convert WebM/OGG to .m4a via FFmpeg (Strict: fail explicitly on transcode error)
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

        // 3. Delete original raw temp file after successful conversion
        if (storagePath !== processed.storagePath) {
            supabase.storage.from('chat-media').remove([storagePath]).catch(e => console.error('Cleanup error:', e));
        }

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

        // Reject non-storage paths (blob:, http:, data:) — these are local URLs,
        // not Supabase storage paths, and will always fail.
        if (path.startsWith('blob:') || path.startsWith('http:') || path.startsWith('https:') || path.startsWith('data:')) {
            return res.status(400).json({ error: 'Invalid storage path — only Supabase storage paths are accepted.' });
        }

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
