const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary by parsing CLOUDINARY_URL
// Format: cloudinary://api_key:api_secret@cloud_name
const cloudinaryUrl = process.env.CLOUDINARY_URL;
console.log('CLOUDINARY_URL exists:', !!cloudinaryUrl);
if (cloudinaryUrl) {
    console.log('CLOUDINARY_URL value:', cloudinaryUrl.substring(0, 30) + '...');
    const regex = /cloudinary:\/\/(\d+):([^@]+)@(.+)/;
    const match = cloudinaryUrl.match(regex);
    if (match) {
        cloudinary.config({
            cloud_name: match[3],
            api_key: match[1],
            api_secret: match[2]
        });
        console.log('Cloudinary configured with cloud:', match[3], 'api_key:', match[1]);
    } else {
        console.log('Cloudinary URL regex did not match!');
    }
} else {
    console.log('CLOUDINARY_URL not found in environment');
}

// Multer setup for memory storage
const storage = multer.memoryStorage();
const upload = multer({
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

// Upload endpoint
router.post('/image', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Upload to Cloudinary
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'note_standard_profiles',
                    transformation: [
                        { width: 400, height: 400, crop: 'fill', gravity: 'face' }
                    ]
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

module.exports = router;
