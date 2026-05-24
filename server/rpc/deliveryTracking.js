import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Server-only
);

/**
 * Mark a message as delivered for a specific device.
 */
export async function markMessageDelivered({ messageId, deviceId }) {
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
export async function markConversationRead({ conversationId, deviceId, lastMessageId }) {
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
