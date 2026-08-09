export type TransportState = "queued" | "sending" | "retry_wait" | "accepted" | "synced" | "failed";

export type PendingMessageIntent = {
    event_id: string;
    client_message_id: string; // tempId
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
        clientSendTs?: number;
    };
    status: TransportState;
    created_at: number;
    attempts: number;
    next_retry_at?: number;
    server_message_id?: string;
};

const STORAGE_KEY = 'notestandard_offline_queue_v1';

export class OfflineQueueEngine {
    private queue: PendingMessageIntent[] = [];
    private isFlushing = false;
    private flushPromise: Promise<void> | null = null;
    private storage: { getItem: (key: string) => string | null | Promise<string | null>; setItem: (key: string, val: string) => void | Promise<void> } | null = null;

    constructor(storageAdapter?: { getItem: (key: string) => string | null | Promise<string | null>; setItem: (key: string, val: string) => void | Promise<void> }) {
        if (storageAdapter) {
            this.storage = storageAdapter;
            this.loadFromStorage();
        }
    }

    private async loadFromStorage() {
        if (typeof window !== 'undefined' && !this.storage) {
            try {
                this.storage = localStorage;
            } catch (e) {
                // localStorage disabled/unavailable
            }
        }
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
        if (typeof window !== 'undefined' && !this.storage) {
            try { this.storage = localStorage; } catch (e) {}
        }
        if (!this.storage) return;
        try {
            await this.storage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.warn('[OfflineQueue] Failed to save queue to storage:', e);
        }
    }

    // Gate 2: Single-Flight Mutex Execution
    async runSingleFlight(task: () => Promise<void>): Promise<void> {
        if (this.isFlushing && this.flushPromise) {
            return this.flushPromise;
        }

        this.isFlushing = true;
        this.flushPromise = (async () => {
            try {
                await task();
            } finally {
                this.isFlushing = false;
                this.flushPromise = null;
            }
        })();

        return this.flushPromise;
    }

    // Exponential Backoff with Jitter (Gate 3)
    getBackoffDelay(attempts: number): number {
        const baseMs = 1000;
        const maxMs = 30000;
        const expMs = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempts - 1)));
        const jitter = Math.floor(Math.random() * 500);
        return expMs + jitter;
    }

    async pushIntent(intent: Omit<PendingMessageIntent, 'status' | 'attempts'>) {
        await this.loadFromStorage();
        const fullIntent: PendingMessageIntent = {
            ...intent,
            client_message_id: intent.client_message_id || intent.event_id,
            status: 'queued',
            attempts: 0
        };

        const existingIdx = this.queue.findIndex(q => q.event_id === intent.event_id || q.client_message_id === fullIntent.client_message_id);
        if (existingIdx === -1) {
            this.queue.push(fullIntent);
        } else {
            // Re-queue existing intent without resetting client_message_id or event_id
            this.queue[existingIdx] = {
                ...this.queue[existingIdx],
                status: 'queued'
            };
        }
        await this.saveToStorage();
        return fullIntent;
    }

    async updateIntentStatus(eventId: string, status: TransportState, serverMessageId?: string) {
        const now = Date.now();
        this.queue = this.queue.map(q => {
            if (q.event_id === eventId || q.client_message_id === eventId) {
                const newAttempts = status === 'sending' ? q.attempts + 1 : q.attempts;
                const nextRetryAt = status === 'retry_wait' ? now + this.getBackoffDelay(newAttempts) : undefined;
                return { 
                    ...q, 
                    status,
                    attempts: newAttempts,
                    next_retry_at: nextRetryAt,
                    server_message_id: serverMessageId || q.server_message_id
                };
            }
            return q;
        });
        await this.saveToStorage();
    }

    async removeIntent(eventId: string) {
        this.queue = this.queue.filter(q => q.event_id !== eventId && q.client_message_id !== eventId);
        await this.saveToStorage();
    }

    async getPendingIntents(): Promise<PendingMessageIntent[]> {
        await this.loadFromStorage();
        const now = Date.now();
        // Return queued intents or retry_wait intents whose delay has expired
        return [...this.queue]
            .filter(q => q.status === 'queued' || q.status === 'sending' || (q.status === 'retry_wait' && (!q.next_retry_at || q.next_retry_at <= now)))
            .sort((a, b) => a.created_at - b.created_at);
    }

    async getAllIntents(): Promise<PendingMessageIntent[]> {
        await this.loadFromStorage();
        return [...this.queue].sort((a, b) => a.created_at - b.created_at);
    }
}
