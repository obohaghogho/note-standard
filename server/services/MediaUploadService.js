const supabase = require('../config/database');
const logger = require('../utils/logger');
const path = require('path');

/**
 * MediaUploadService (B-06, B-08, B-09)
 * Centralized service managing secure media, file, and voice-note uploads to Supabase Storage.
 */
class MediaUploadService {
  /**
   * Upload an image file (Community posts, Chat images)
   */
  static async uploadImage({ file, userId, bucket = 'community_media' }) {
    if (!file || !file.buffer) {
      throw new Error('No image buffer provided');
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new Error(`Invalid image MIME type: ${file.mimetype}`);
    }

    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      logger.error('[MediaUploadService] Image upload error:', error);
      throw error;
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filename);

    return {
      url: publicUrlData.publicUrl,
      key: filename,
      mime: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Upload a general document/file attachment (Chat PDF, Docs)
   */
  static async uploadFile({ file, userId, bucket = 'chat_attachments' }) {
    if (!file || !file.buffer) {
      throw new Error('No file buffer provided');
    }

    const maxSizeBytes = 25 * 1024 * 1024; // 25MB
    if (file.size > maxSizeBytes) {
      throw new Error('File size exceeds 25MB limit');
    }

    const ext = path.extname(file.originalname) || '.bin';
    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filename, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      logger.error('[MediaUploadService] File upload error:', error);
      throw error;
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filename);

    return {
      url: publicUrlData.publicUrl,
      key: filename,
      name: file.originalname,
      mime: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Upload a voice-note audio recording (B-08 Dedicated Audio Pipeline)
   */
  static async uploadAudio({ file, userId, bucket = 'voice_notes' }) {
    if (!file || !file.buffer) {
      throw new Error('No audio buffer provided');
    }

    const allowedMimes = [
      'audio/m4a',
      'audio/mp4',
      'audio/aac',
      'audio/wav',
      'audio/webm',
      'audio/mpeg',
      'audio/x-m4a',
      'audio/ogg',
    ];

    const isAudioMime = allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('audio/');
    if (!isAudioMime) {
      throw new Error(`Invalid audio MIME type: ${file.mimetype}`);
    }

    const ext = path.extname(file.originalname) || '.m4a';
    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      logger.error('[MediaUploadService] Audio upload error:', error);
      throw error;
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filename);

    return {
      url: publicUrlData.publicUrl,
      key: filename,
      mime: file.mimetype,
      size: file.size,
    };
  }
}

module.exports = MediaUploadService;
