export type PendingMessageIntent = {
    event_id: string;
    conversation_id: string;
    payload: {
        content: string;
        type: string;
        attachmentId?: string;
        replyToId?: string;
    };
    status: "queued" | "sending" | "failed";
    leaseSnapshot: {
        device_id: string;
        session_id: string;
    };
    created_at: number;
    attempts: number;
};

// Simple storage adapter to abstract localStorage/AsyncStorage differences
interface StorageAdapter {
    getItem: (key: string) => string | null | Promise<string | null>;
    setItem: (key: string, value: string) => void | Promise<void>;
}

export class OfflineQueueEngine {
    private queueKey = 'chat_offline_intents';
    private storage: StorageAdapter;
    private queue: PendingMessageIntent[] = [];
    private loaded = false;

    constructor(storageAdapter: StorageAdapter) {
        this.storage = storageAdapter;
    }

    async loadQueue(): Promise<PendingMessageIntent[]> {
        if (this.loaded) return this.queue;
        
        try {
            const data = await this.storage.getItem(this.queueKey);
            if (data) {
                this.queue = JSON.parse(data);
                // Reset any 'sending' status back to 'queued' on load
                this.queue = this.queue.map(q => q.status === 'sending' ? { ...q, status: 'queued' } : q);
            }
        } catch (e) {
            console.error('[OfflineQueue] Failed to load queue', e);
        }
        this.loaded = true;
        return this.queue;
    }

    private async saveQueue() {
        try {
            await this.storage.setItem(this.queueKey, JSON.stringify(this.queue));
        } catch (e) {
            console.error('[OfflineQueue] Failed to save queue', e);
        }
    }

    async pushIntent(intent: Omit<PendingMessageIntent, 'status' | 'attempts'>) {
        await this.loadQueue();
        const fullIntent: PendingMessageIntent = {
            ...intent,
            status: 'queued',
            attempts: 0
        };
        this.queue.push(fullIntent);
        await this.saveQueue();
        return fullIntent;
    }

    async updateIntentStatus(eventId: string, status: PendingMessageIntent['status']) {
        await this.loadQueue();
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
        await this.saveQueue();
    }

    async removeIntent(eventId: string) {
        await this.loadQueue();
        this.queue = this.queue.filter(q => q.event_id !== eventId);
        await this.saveQueue();
    }

    async getPendingIntents(): Promise<PendingMessageIntent[]> {
        await this.loadQueue();
        // Sort strictly by creation order
        return [...this.queue].sort((a, b) => a.created_at - b.created_at);
    }
}
