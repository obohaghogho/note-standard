const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

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
router.post('/image', uploadImage.single('file'), async (req, res) => {
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
