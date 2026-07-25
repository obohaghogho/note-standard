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

const STORAGE_KEY = 'notestandard_offline_queue_v1';

export class OfflineQueueEngine {
    private queue: PendingMessageIntent[] = [];
    private storage: { getItem: (key: string) => string | null | Promise<string | null>; setItem: (key: string, val: string) => void | Promise<void> } | null = null;

    constructor(storageAdapter?: { getItem: (key: string) => string | null | Promise<string | null>; setItem: (key: string, val: string) => void | Promise<void> }) {
        if (storageAdapter) {
            this.storage = storageAdapter;
            this.loadFromStorage();
        }
    }

    private async loadFromStorage() {
        if (!this.storage) return;
        try {
            const raw = await this.storage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this.queue = parsed;
                }
            }
        } catch (e) {
            console.warn('[OfflineQueue] Failed to load queue from storage:', e);
        }
    }

    private async saveToStorage() {
        if (!this.storage) return;
        try {
            await this.storage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.warn('[OfflineQueue] Failed to save queue to storage:', e);
        }
    }

    async pushIntent(intent: Omit<PendingMessageIntent, 'status' | 'attempts'>) {
        const fullIntent: PendingMessageIntent = {
            ...intent,
            status: 'queued',
            attempts: 0
        };
        // Avoid duplicate event_id queue entry
        if (!this.queue.some(q => q.event_id === intent.event_id)) {
            this.queue.push(fullIntent);
            await this.saveToStorage();
        }
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
        await this.saveToStorage();
    }

    async removeIntent(eventId: string) {
        this.queue = this.queue.filter(q => q.event_id !== eventId);
        await this.saveToStorage();
    }

    async getPendingIntents(): Promise<PendingMessageIntent[]> {
        await this.loadFromStorage();
        // Sort strictly by creation order
        return [...this.queue].sort((a, b) => a.created_at - b.created_at);
    }
}
