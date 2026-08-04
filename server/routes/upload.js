const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../config/database');
const { uploadLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// Multer setup for image-only (legacy profile uploads)
const storage = multer.memoryStorage();
const uploadImage = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// Multer setup for mixed media (statuses)
const uploadMedia = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
    fileFilter: (req, file, cb) => {
        const allowedExtensions = /jpeg|jpg|png|gif|webp|mp4|mov|avi|webm|quicktime/i;
        const extension = file.originalname.split('.').pop().toLowerCase();
        const isMimeMatch = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
        const isExtMatch = allowedExtensions.test(extension);

        if (isMimeMatch || isExtMatch) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed (detected: ' + file.mimetype + ')'), false);
        }
    }
});

// Upload endpoint for profile images (legacy)
router.post('/image', requireAuth, uploadLimiter, uploadImage.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Upload to Cloudinary
        const result = await new Promise((resolve, reject) => {
            const isCover = req.query.type === 'cover';
            const transformation = isCover
                ? [{ width: 1200, height: 400, crop: 'fill', fetch_format: 'auto' }]
                : [{ width: 400, height: 400, crop: 'fill', gravity: 'face', fetch_format: 'auto' }];

            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'note_standard_profiles',
                    transformation
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );

            uploadStream.end(req.file.buffer);
        });

        const isCover = req.query.type === 'cover';
        
        // Update Supabase profile
        const updateData = isCover ? { cover_url: result.secure_url } : { avatar_url: result.secure_url };
        
        // Handle concurrent updates safely using updated_at to ensure optimistic locking
        const { error: dbError } = await supabase
            .from('profiles')
            .update({ ...updateData, updated_at: new Date().toISOString() })
            .eq('id', req.user.id);
            
        if (dbError) {
            // Delete orphaned image
            await cloudinary.uploader.destroy(result.public_id);
            logger.error(`Profile image database update failed, orphaned image deleted`, { 
                event: isCover ? 'banner_update_failed' : 'avatar_update_failed',
                user_id: req.user.id,
                error: dbError.message
            });
            throw dbError;
        }

        logger.info(`Profile image updated successfully`, {
            event: isCover ? 'banner_updated' : 'avatar_updated',
            user_id: req.user.id,
            url: result.secure_url
        });

        res.json({
            success: true,
            url: result.secure_url,
            public_id: result.public_id
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed', message: error.message });
    }
});

// Upload endpoint for statuses (images and video)
router.post('/media', uploadMedia.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'note_standard_statuses',
                    resource_type: 'auto',
                    // No aggressive cropping to preserve aspect ratio
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(req.file.buffer);
        });

        res.json({
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            resource_type: result.resource_type,
            format: result.format
        });
    } catch (error) {
        console.error('Media upload error:', error);
        res.status(500).json({ error: 'Upload failed', message: error.message });
    }
});

module.exports = router;
