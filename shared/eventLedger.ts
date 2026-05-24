/**
 * Event Ledger (Phase 6.2)
 * Client-side emission wrapper for distributed messaging tracing.
 */

export type LedgerEventType = 'SENT' | 'DELIVERED' | 'READ' | 'LEASE_TAKEN' | 'LEASE_RELEASED' | 'RETRY' | 'FAILED';

export interface LedgerEventPayload {
    messageId: string;
    conversationId: string;
    deviceId: string;
    sessionId?: string | null;
    eventType: LedgerEventType;
    correlationId: string;
    metadata?: Record<string, any>;
}

export class EventLedger {
    constructor(private apiClient: any) {}

    /**
     * Emits an immutable trace event to the backend Event Ledger.
     * This is a fire-and-forget operation to prevent blocking UI critical paths.
     */
    public emit(payload: LedgerEventPayload) {
        // Fire and forget
        this.apiClient.post('/chat/events', payload).catch((err: any) => {
            if (process.env.NODE_ENV !== 'production' && typeof process !== 'undefined') {
                console.warn(`[EventLedger] Failed to emit ${payload.eventType} event:`, err.message);
            } else if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) {
                console.warn(`[EventLedger] Failed to emit ${payload.eventType} event:`, err.message);
            }
        });
    }

    /**
     * Convenience method for tracking offline intent retries.
     */
    public emitRetry(
        messageId: string, 
        conversationId: string, 
        deviceId: string, 
        sessionId: string, 
        correlationId: string, 
        attempts: number
    ) {
        this.emit({
            messageId,
            conversationId,
            deviceId,
            sessionId,
            eventType: 'RETRY',
            correlationId,
            metadata: { attempts }
        });
    }
}
