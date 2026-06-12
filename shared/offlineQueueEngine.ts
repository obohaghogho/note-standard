export type PendingMessageIntent = {
    event_id: string;
    conversation_id: string;
    payload: {
        content: string;
        type: string;
        attachmentId?: string;
        replyTo?: {
            id: string;
            content?: string;
            sender_id?: string;
            type?: string;
            attachment?: unknown;
        };
        correlationId?: string;
    };
    status: "queued" | "sending" | "failed";
    created_at: number;
    attempts: number;
};

// Simplified to a purely in-memory retry layer (WhatsApp-style transient resilience)
export class OfflineQueueEngine {
    private queue: PendingMessageIntent[] = [];

    // Storage adapter is kept in constructor for backward compatibility, but not used for persistence.
    constructor(storageAdapter?: any) {
        // No-op
    }

    async pushIntent(intent: Omit<PendingMessageIntent, 'status' | 'attempts'>) {
        const fullIntent: PendingMessageIntent = {
            ...intent,
            status: 'queued',
            attempts: 0
        };
        this.queue.push(fullIntent);
        return fullIntent;
    }

    async updateIntentStatus(eventId: string, status: PendingMessageIntent['status']) {
        this.queue = this.queue.map(q => {
            if (q.event_id === eventId) {
                return { 
                    ...q, 
                    status,
                    attempts: status === 'sending' ? q.attempts + 1 : q.attempts 
                };
            }
            return q;
        });
    }

    async removeIntent(eventId: string) {
        this.queue = this.queue.filter(q => q.event_id !== eventId);
    }

    async getPendingIntents(): Promise<PendingMessageIntent[]> {
        // Sort strictly by creation order
        return [...this.queue].sort((a, b) => a.created_at - b.created_at);
    }
}
