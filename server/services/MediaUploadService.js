const supabase = require('../config/database');
const logger = require('../utils/logger');
const path = require('path');

/**
 * MediaUploadService (B-06, B-08, B-09)
 * Centralized service managing secure media, file, and voice-note uploads to Supabase Storage.
 * Features a self-healing bucket fallback mechanism that automatically redirects any upload 
 * request to the active 'chat-media' bucket if the primary requested bucket returns NoSuchBucket.
 */
class MediaUploadService {
  /**
   * Helper: Performs storage upload with automatic bucket fallback to 'chat-media'
   * if the primary requested bucket does not exist.
   */
  static async executeStorageUpload(filename, fileBuffer, contentType, requestedBucket = 'chat-media') {
    let targetBucket = requestedBucket || 'chat-media';

    let { data, error } = await supabase.storage
      .from(targetBucket)
      .upload(filename, fileBuffer, {
        contentType,
        upsert: false,
      });

    // Fallback to 'chat-media' if requested bucket does not exist
    if (error && (error.code === 'NoSuchBucket' || error.statusCode === '404' || error.message?.includes('not found') || error.message?.includes('NoSuchBucket'))) {
      logger.warn(`[MediaUploadService] Bucket '${targetBucket}' not found on Supabase. Falling back to 'chat-media'.`);
      targetBucket = 'chat-media';
      const retry = await supabase.storage
        .from(targetBucket)
        .upload(filename, fileBuffer, {
          contentType,
          upsert: false,
        });

      data = retry.data;
      error = retry.error;
    }

    if (error) {
      logger.error(`[MediaUploadService] Storage upload error on bucket '${targetBucket}':`, error);
      throw error;
    }

    const { data: signedData } = await supabase.storage
      .from(targetBucket)
      .createSignedUrl(filename, 60 * 60 * 24 * 365);

    const { data: publicUrlData } = supabase.storage
      .from(targetBucket)
      .getPublicUrl(filename);

    const finalUrl = signedData?.signedUrl || publicUrlData?.publicUrl;

    return {
      url: finalUrl,
      secure_url: finalUrl,
      key: filename,
      bucket: targetBucket
    };
  }

  /**
   * Upload an image file (Community posts, Chat images, Avatar)
   */
  static async uploadImage({ file, userId, bucket = 'chat-media' }) {
    if (!file || !file.buffer) {
      throw new Error('No image buffer provided');
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/svg+xml'];
    const isImageMime = allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('image/');
    if (!isImageMime) {
      throw new Error(`Invalid image MIME type: ${file.mimetype}`);
    }

    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;

    const uploadRes = await this.executeStorageUpload(filename, file.buffer, file.mimetype, bucket);

    return {
      url: uploadRes.url,
      secure_url: uploadRes.secure_url,
      key: uploadRes.key,
      mime: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Upload a general document/file attachment (Chat PDF, Docs)
   */
  static async uploadFile({ file, userId, bucket = 'chat-media' }) {
    if (!file || !file.buffer) {
      throw new Error('No file buffer provided');
    }

    const maxSizeBytes = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSizeBytes) {
      throw new Error('File size exceeds 50MB limit');
    }

    const ext = path.extname(file.originalname) || '.bin';
    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;

    const uploadRes = await this.executeStorageUpload(filename, file.buffer, file.mimetype || 'application/octet-stream', bucket);

    return {
      url: uploadRes.url,
      secure_url: uploadRes.secure_url,
      key: uploadRes.key,
      name: file.originalname,
      mime: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Upload a voice-note audio recording (B-08 Dedicated Audio Pipeline)
   */
  static async uploadAudio({ file, userId, bucket = 'chat-media' }) {
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

    const uploadRes = await this.executeStorageUpload(filename, file.buffer, file.mimetype, bucket);

    return {
      url: uploadRes.url,
      secure_url: uploadRes.secure_url,
      key: uploadRes.key,
      mime: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Upload media file (Photos, Videos, Audio for Chat & Status)
   */
  static async uploadMedia({ file, userId, bucket = 'chat-media' }) {
    if (!file || !file.buffer) {
      throw new Error('No media buffer provided');
    }

    const imageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/svg+xml'];
    const videoMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/avi', 'video/x-matroska', 'video/mkv', 'video/3gpp', 'video/mov', 'video/x-m4v', 'video/m4v', 'video/mpeg'];
    const audioMimes = ['audio/m4a', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/webm', 'audio/mpeg', 'audio/x-m4a', 'audio/ogg'];

    const videoExts = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.3gp', '.mpeg', '.ts'];
    const fileExt = path.extname(file.originalname || '').toLowerCase();

    const isImage = imageMimes.includes(file.mimetype) || file.mimetype.startsWith('image/');
    const isVideo = videoMimes.includes(file.mimetype) || file.mimetype.startsWith('video/') || videoExts.includes(fileExt);
    const isAudio = audioMimes.includes(file.mimetype) || file.mimetype.startsWith('audio/');

    if (!isImage && !isVideo && !isAudio) {
      throw new Error(`Unsupported media MIME type: ${file.mimetype || 'unknown'}`);
    }

    const maxSizeBytes = 1024 * 1024 * 1024; // 1GB (1024MB)
    if (file.size > maxSizeBytes) {
      throw new Error('Media file size exceeds 1GB limit');
    }

    const resourceType = isVideo ? 'video' : isAudio ? 'audio' : 'image';

    // Route video uploads through Cloudinary if available for 1GB+ limit & automatic 90s streaming trim
    if (isVideo && process.env.CLOUDINARY_URL) {
      try {
        const cloudinary = require('../config/cloudinary');
        const cloudRes = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              resource_type: 'video',
              folder: 'reels_media',
            },
            (err, result) => {
              if (err) return reject(err);
              resolve(result);
            }
          );
          stream.end(file.buffer);
        });

        const rawUrl = cloudRes.secure_url || cloudRes.url;
        // Apply Cloudinary 90-second streaming trim transformation (so_0,eo_90 = start 0s, end 90s)
        const trimmedUrl = rawUrl && rawUrl.includes('/upload/')
          ? rawUrl.replace('/upload/', '/upload/so_0,eo_90/')
          : rawUrl;

        logger.info(`[MediaUploadService] Cloudinary video upload success: ${trimmedUrl}`);
        return {
          url: trimmedUrl,
          secure_url: trimmedUrl,
          raw_url: rawUrl,
          resource_type: 'video',
          key: cloudRes.public_id,
          mime: file.mimetype,
          size: file.size,
        };
      } catch (cloudErr) {
        logger.warn(`[MediaUploadService] Cloudinary video upload failed (${cloudErr.message}), falling back to Supabase storage.`);
      }
    }

    const defaultExt = isVideo ? '.mp4' : isAudio ? '.m4a' : '.jpg';
    const ext = path.extname(file.originalname) || defaultExt;
    const filename = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;

    const uploadRes = await this.executeStorageUpload(filename, file.buffer, file.mimetype, bucket);

    return {
      url: uploadRes.url,
      secure_url: uploadRes.secure_url,
      resource_type: resourceType,
      key: uploadRes.key,
      mime: file.mimetype,
      size: file.size,
    };
  }
}

module.exports = MediaUploadService;
