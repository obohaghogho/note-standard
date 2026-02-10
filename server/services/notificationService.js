const supabase = require('../config/supabase');
const webpush = require('web-push');
require('dotenv').config();

// Configure web-push
webpush.setVapidDetails(
    `mailto:${process.env.EMAIL_FROM || 'admin@example.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

/**
 * Creates a notification and emits it via Socket.IO
 * @param {Object} params - Notification parameters
 * @param {string} params.receiverId - ID of the user receiving the notification
 * @param {string} [params.senderId] - ID of the user triggering the notification
 * @param {string} params.type - Type of notification (e.g., 'community_post', 'note_share', 'chat_message', 'mention', 'note_edit')
 * @param {string} params.title - Notification title
 * @param {string} [params.message] - Notification message
 * @param {string} [params.link] - Link to redirect the user
 * @param {Object} [params.io] - Socket.IO instance (optional if app.get('io') is used)
 */
const createNotification = async ({
    receiverId,
    senderId,
    type,
    title,
    message,
    link,
    io
}) => {
    try {
        // 1. Persist to Database
        const { data, error } = await supabase
            .from('notifications')
            .insert([{
                receiver_id: receiverId,
                sender_id: senderId,
                type,
                title,
                message,
                link,
                is_read: false
            }])
            .select()
            .single();

        if (error) throw error;

        // 2. Real-time Delivery via Socket.IO
        if (io) {
            io.to(receiverId).emit('notification', {
                id: data.id,
                type,
                title,
                message,
                link,
                sender_id: senderId,
                created_at: data.created_at,
                is_read: false
            });
        }

        // 3. Optional: Send Push Notification (PWA)
        await sendPushNotification(receiverId, { title, message, link, type });

        return true;
    } catch (err) {
        console.error('Error creating notification:', err.message);
        return false;
    }
};

/**
 * Sends a push notification to all subscribed devices of a user
 */
const sendPushNotification = async (userId, payload) => {
    try {
        const { data: subscriptions, error } = await supabase
            .from('push_subscriptions')
            .select('subscription')
            .eq('user_id', userId);

        if (error || !subscriptions) return;

        const pushPayload = JSON.stringify({
            title: payload.title,
            body: payload.message,
            icon: '/logo192.png', // Default icon
            data: {
                url: payload.link,
                type: payload.type
            }
        });

        const sendPromises = subscriptions.map(sub =>
            webpush.sendNotification(sub.subscription, pushPayload)
                .catch(err => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        // Subscription has expired or is no longer valid, delete it
                        return supabase.from('push_subscriptions')
                            .delete()
                            .eq('subscription', JSON.stringify(sub.subscription));
                    }
                    console.error('Push error:', err);
                })
        );

        await Promise.all(sendPromises);
    } catch (err) {
        console.error('Failed to send push notification:', err);
    }
};

/**
 * Broadcasts a notification to all users
 */
const broadcastNotification = async ({
    senderId,
    type,
    title,
    message,
    link,
    io
}) => {
    try {
        // 1. Get all user IDs (this might be heavy for many users, but for now it's okay)
        // Better: Use a dedicated table or handle it differently for massive scale.
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id');

        if (profileError) throw profileError;

        // 2. Persist to Database for everyone
        const notificationsPayload = profiles.map(p => ({
            receiver_id: p.id,
            sender_id: senderId,
            type,
            title,
            message,
            link,
            is_read: false
        }));

        const { error } = await supabase
            .from('notifications')
            .insert(notificationsPayload);

        if (error) throw error;

        // 3. Real-time Delivery via Socket.IO Broadast
        if (io) {
            io.emit('notification', {
                type,
                title,
                message,
                link,
                sender_id: senderId,
                created_at: new Date().toISOString(),
                is_read: false
            });
        }

        // 4. Send Push Notifications to everyone (This could be throttled for production)
        // For now, we'll do it for each profile
        const pushPayload = JSON.stringify({
            title,
            body: message,
            icon: '/logo192.png',
            data: { url: link, type }
        });

        // Fetch ALL subscriptions
        const { data: allSubscriptions } = await supabase
            .from('push_subscriptions')
            .select('subscription');

        if (allSubscriptions) {
            allSubscriptions.map(sub =>
                webpush.sendNotification(sub.subscription, pushPayload).catch(() => { })
            );
        }

        return true;
    } catch (err) {
        console.error('Error broadcasting notification:', err.message);
        return false;
    }
};

module.exports = {
    createNotification,
    broadcastNotification
};
