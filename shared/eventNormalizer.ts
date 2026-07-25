import { validateMessagePayload } from './payloadValidator';

/**
 * Standardizes socket/REST payloads into a consistent Message interface
 * before they enter the validation and merge pipeline.
 */
export function normalizeEvent(rawEvent: any): any {
    if (!rawEvent || typeof rawEvent !== 'object') return rawEvent;
    
    const conversation_id = rawEvent.conversation_id || rawEvent.conversationId || rawEvent.chat_id || rawEvent.chatId;
    const sender_id = rawEvent.sender_id || rawEvent.senderId;
    const event_id = rawEvent.event_id || rawEvent.eventId || rawEvent.client_request_id || rawEvent.clientRequestId;

    return {
        ...rawEvent,
        conversation_id,
        sender_id,
        event_id,
        // Ensure type exists, default to text
        type: rawEvent.type || 'text',
        // Ensure sequence_number is at least present
        sequence_number: rawEvent.sequence_number,
        // Fallback for created_at if somehow missing
        created_at: rawEvent.created_at || new Date().toISOString()
    };
}
