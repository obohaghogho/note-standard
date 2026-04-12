const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
const axios = require('axios');
const supabase = require('../config/database');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * Universal Audio Processor
 * Converts various audio formats to .m4a (AAC) for cross-platform compatibility.
 */
class AudioProcessor {
    /**
     * Process an audio file from Supabase Storage
     * @param {string} storagePath - The path in the 'chat-media' bucket
     * @param {string} conversationId - The conversation ID for organization
     * @returns {Promise<{ fileName: string, storagePath: string, mimeType: string, size: number }>}
     */
    async convertToM4A(storagePath, conversationId) {
        const tempId = Math.random().toString(36).substring(7);
        const tmpDir = path.join(__dirname, '..', 'tmp', 'audio');
        const inputPath = path.join(tmpDir, `${tempId}_input`);
        const outputPath = path.join(tmpDir, `${tempId}_output.m4a`);
        
        // Ensure tmp/audio directory exists
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        try {
            console.log(`[AudioProcessor] Processing: ${storagePath}`);
            
            // 1. Get Signed URL to download
            const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                .from('chat-media')
                .createSignedUrl(storagePath, 60);

            if (signedUrlError) throw signedUrlError;

            // 2. Download file
            const response = await axios({
                method: 'get',
                url: signedUrlData.signedUrl,
                responseType: 'stream'
            });

            await pipeline(response.data, fs.createWriteStream(inputPath));

            // 3. Convert using FFmpeg
            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .audioCodec('aac')
                    .audioBitrate('128k')
                    .toFormat('mp4')
                    .on('start', (cmd) => console.log('[FFmpeg] Command:', cmd))
                    .on('error', (err) => reject(err))
                    .on('end', () => resolve())
                    .save(outputPath);
            });

            // 4. Upload converted file back to Supabase
            const fileName = `voice_${Date.now()}.m4a`;
            const finalPath = `${conversationId}/${fileName}`;
            const fileBuffer = fs.readFileSync(outputPath);

            const { error: uploadError } = await supabase.storage
                .from('chat-media')
                .upload(finalPath, fileBuffer, {
                    contentType: 'audio/mp4',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            // 5. Cleanup temp files (async)
            this.cleanup([inputPath, outputPath]);

            return {
                fileName,
                storagePath: finalPath,
                mimeType: 'audio/mp4',
                size: fileBuffer.length
            };

        } catch (err) {
            console.error('[AudioProcessor] Error:', err.message);
            this.cleanup([inputPath, outputPath]);
            throw err;
        }
    }

    cleanup(paths) {
        paths.forEach(p => {
            if (fs.existsSync(p)) {
                fs.unlink(p, () => {});
            }
        });
    }
}

module.exports = new AudioProcessor();
