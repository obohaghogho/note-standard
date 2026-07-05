const supabase = require('../config/supabase');

/**
 * Mark a message as delivered for a specific device.
 */
async function markMessageDelivered({ messageId, deviceId }) {
    const { data, error } = await supabase.rpc('rpc_mark_delivered', {
        p_message_id: messageId,
        p_device_id: deviceId
    });

    if (error) {
        throw new Error(`markMessageDelivered error: ${error.message}`);
    }
    return data;
}

/**
 * Mark messages in a conversation as read up to a specific message ID for a specific device.
 * Will fail with 'LEASE_PASSIVE' if the device is not the active writer.
 */
async function markConversationRead({ conversationId, deviceId, lastMessageId }) {
    const { data, error } = await supabase.rpc('rpc_mark_read', {
        p_conversation_id: conversationId,
        p_device_id: deviceId,
        p_last_message_id: lastMessageId
    });

    if (error) {
        throw new Error(`markConversationRead error: ${error.message}`);
    }

    if (data?.success === false) {
        throw new Error(data.error);
    }

    return data;
}

module.exports = { markMessageDelivered, markConversationRead };
