const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const MediaUploadService = require('../services/MediaUploadService');
const logger = require('../utils/logger');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB Max
});

// All upload routes require authentication & rate limiting
router.use(requireAuth);
router.use(uploadLimiter);

/**
 * POST /api/upload/image (B-06)
 * Community post image / avatar / media image upload
 */
router.post('/image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const result = await MediaUploadService.uploadImage({
      file: req.file,
      userId: req.user.id,
      bucket: 'community_media',
    });

    res.status(201).json({
      success: true,
      url: result.url,
      key: result.key,
      mime: result.mime,
      size: result.size,
    });
  } catch (error) {
    logger.error('[Upload/Image] Error:', error.message);
    res.status(400).json({ error: error.message || 'Image upload failed' });
  }
});

/**
 * POST /api/upload/file (B-09)
 * General document / attachment upload
 */
router.post('/file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await MediaUploadService.uploadFile({
      file: req.file,
      userId: req.user.id,
      bucket: 'chat_attachments',
    });

    res.status(201).json({
      success: true,
      url: result.url,
      key: result.key,
      name: result.name,
      mime: result.mime,
      size: result.size,
    });
  } catch (error) {
    logger.error('[Upload/File] Error:', error.message);
    res.status(400).json({ error: error.message || 'File upload failed' });
  }
});

/**
 * POST /api/upload/audio (B-08)
 * Dedicated audio voice-note upload pipeline
 */
router.post('/audio', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const result = await MediaUploadService.uploadAudio({
      file: req.file,
      userId: req.user.id,
      bucket: 'voice_notes',
    });

    res.status(201).json({
      success: true,
      url: result.url,
      key: result.key,
      mime: result.mime,
      size: result.size,
    });
  } catch (error) {
    logger.error('[Upload/Audio] Error:', error.message);
    res.status(400).json({ error: error.message || 'Audio upload failed' });
  }
});

module.exports = router;
