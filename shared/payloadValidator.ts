/**
 * payloadValidator.ts — Lightweight Runtime Message Schema Guard
 *
 * NO external dependencies. Pure TypeScript type guards.
 *
 * Phase 3 Frontend Hardening — validates incoming socket payloads
 * before they are allowed to touch the reducer state.
 *
 * Rules:
 * - Required fields must be non-empty strings
 * - `created_at` must parse to a valid date
 * - `type` must be a known message type
 * - `sequence_number` if present must be a safe positive number
 * - Unknown extra fields are allowed (forward compatibility)
 */

const VALID_MESSAGE_TYPES = new Set([
    'text', 'image', 'video', 'file', 'audio', 'voice', 'call', 'document'
]);

export type ValidationResult<T> =
    | { valid: true; data: T }
    | { valid: false; reason: string };

export interface ValidatedMessage {
    id: string;
    conversation_id: string;
    sender_id: string;
    created_at: string;
    type: string;
    content?: string;
    sequence_number?: number;
    conversation_version?: number;
    event_id?: string;
    [key: string]: unknown;
}

function isNonEmptyString(val: unknown): val is string {
    return typeof val === 'string' && val.trim().length > 0;
}

function isValidISODate(val: unknown): boolean {
    if (!isNonEmptyString(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime());
}

/**
 * Validate an incoming socket message payload.
 * Returns `{ valid: true, data }` if safe to merge into state.
 * Returns `{ valid: false, reason }` if the payload should be dropped.
 */
export function validateMessagePayload(raw: unknown): ValidationResult<ValidatedMessage> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { valid: false, reason: 'PAYLOAD_NOT_OBJECT' };
    }

    const msg = raw as Record<string, unknown>;

    if (!isNonEmptyString(msg.id)) {
        return { valid: false, reason: 'MISSING_OR_INVALID_ID' };
    }

    if (!isNonEmptyString(msg.conversation_id)) {
        return { valid: false, reason: 'MISSING_OR_INVALID_CONVERSATION_ID' };
    }

    if (!isNonEmptyString(msg.sender_id)) {
        return { valid: false, reason: 'MISSING_OR_INVALID_SENDER_ID' };
    }

    if (!isValidISODate(msg.created_at)) {
        return { valid: false, reason: 'MISSING_OR_INVALID_CREATED_AT' };
    }

    // Type must be known — but allow legacy `undefined` to pass as 'text'
    if (msg.type !== undefined && !VALID_MESSAGE_TYPES.has(msg.type as string)) {
        return { valid: false, reason: `INVALID_MESSAGE_TYPE: ${msg.type}` };
    }

    // Sequence number — if present must coerce to a safe positive number
    if (msg.sequence_number !== undefined) {
        const seq = Number(msg.sequence_number);
        if (Number.isNaN(seq) || seq < 0 || !Number.isFinite(seq)) {
            return { valid: false, reason: `INVALID_SEQUENCE_NUMBER: ${msg.sequence_number}` };
        }
    }

    return {
        valid: true,
        data: msg as ValidatedMessage
    };
}

/**
 * Normalizes sequence_number from a validated message.
 * Returns a number or undefined (never NaN, never string).
 */
export function normalizeSequenceNumber(val: unknown): number | undefined {
    if (val === undefined || val === null) return undefined;
    const n = Number(val);
    if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return undefined;
    return n;
}
