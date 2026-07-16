import { validateMessagePayload } from './payloadValidator';

/**
 * Standardizes socket/REST payloads into a consistent Message interface
 * before they enter the validation and merge pipeline.
 */
export function normalizeEvent(rawEvent: any): any {
    if (!rawEvent) return rawEvent;
    
    return {
        ...rawEvent,
        // Ensure type exists, default to text
        type: rawEvent.type || 'text',
        // Ensure sequence_number is at least present (can be undefined, but we ensure it's explicitly evaluated)
        sequence_number: rawEvent.sequence_number,
        // Fallback for created_at if somehow missing
        created_at: rawEvent.created_at || new Date().toISOString()
    };
}
