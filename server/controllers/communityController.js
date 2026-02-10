const { broadcastNotification } = require('../services/notificationService');

/**
 * Creates a community post and notifies everyone
 * This can be an alias for making a note public or a dedicated community activity.
 */
const createCommunityPost = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { title, message, link } = req.body;

        if (!title || !message) {
            return res.status(400).json({ error: 'Title and message are required' });
        }

        const io = req.app.get('io');

        await broadcastNotification({
            senderId: userId,
            type: 'community_post',
            title: title,
            message: message,
            link: link || '/dashboard/feed',
            io
        });

        res.json({ message: 'Community post created and broadcasted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    createCommunityPost
};
