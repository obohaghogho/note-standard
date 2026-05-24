import { EventLedger } from './eventLedger';

export class ReadReceiptEngine {
    private debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    private readIntentQueue: { conversationId: string, lastMessageId: string, correlationId: string }[] = [];
    private pendingFlush = false;
    private ledger: EventLedger;

    constructor(
        private apiClient: any,
        private getDeviceId: () => string | null,
        private getSessionId: () => string | null,
        private getIsActiveWriter: (conversationId: string) => boolean,
        private markLocalReadState: (conversationId: string, lastMessageId: string) => void
    ) {
        this.ledger = new EventLedger(apiClient);
    }

    /**
     * Called by the UI (e.g., IntersectionObserver or ScrollView onEndReached)
     * when a message becomes fully visible.
     */
    public onMessageVisible(conversationId: string, messageId: string, correlationId: string = messageId) {
        // Immediately update local UI (optimistic local read state)
        this.markLocalReadState(conversationId, messageId);

        // Queue the server read receipt intent
        this.queueReadIntent(conversationId, messageId, correlationId);
        
        // Debounce actual server emission
        this.scheduleFlush(conversationId);
    }

    private queueReadIntent(conversationId: string, messageId: string, correlationId: string) {
        // Keep only the latest messageId per conversation
        const existing = this.readIntentQueue.find(q => q.conversationId === conversationId);
        if (existing) {
            existing.lastMessageId = messageId;
            existing.correlationId = correlationId;
        } else {
            this.readIntentQueue.push({ conversationId, lastMessageId: messageId, correlationId });
        }
    }

    private scheduleFlush(conversationId: string) {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        
        this.debounceTimeout = setTimeout(async () => {
            this.debounceTimeout = null;
            await this.flushQueue();
        }, 1000); // 1000ms debounce
    }

    public async flushQueue() {
        if (this.pendingFlush || this.readIntentQueue.length === 0) return;
        this.pendingFlush = true;

        const executeFlush = async () => {
            const deviceId = this.getDeviceId();
            if (!deviceId) {
                this.pendingFlush = false;
                return;
            }

            const remainingQueue: { conversationId: string, lastMessageId: string, correlationId: string }[] = [];

            for (const intent of this.readIntentQueue) {
                const { conversationId, lastMessageId, correlationId } = intent;

                // LEASE BARRIER: Only emit read receipt if this device is the active writer
                if (!this.getIsActiveWriter(conversationId)) {
                    // Device is passive. Keep the intent queued.
                    remainingQueue.push(intent);
                    continue;
                }

                try {
                    await this.apiClient.post(`/chat/conversations/${conversationId}/read`, {
                        deviceId,
                        lastMessageId
                    });
                    
                    // Emit to Event Ledger (Phase 6.2)
                    this.ledger.emit({
                        messageId: lastMessageId,
                        conversationId,
                        deviceId,
                        sessionId: this.getSessionId(),
                        eventType: 'READ',
                        correlationId
                    });
                } catch (err) {
                    console.error('[ReadReceiptEngine] Failed to emit read receipt', err);
                    remainingQueue.push(intent);
                }
            }

            this.readIntentQueue = remainingQueue;
            this.pendingFlush = false;
        };

        // Fallback for environments without Web Locks API (older browsers)
        const acquireFallbackLock = (): boolean => {
            if (typeof localStorage === 'undefined') return true; // React Native
            const now = Date.now();
            const lockKey = 'chat-read-sync-lock';
            const existingLock = localStorage.getItem(lockKey);
            
            if (existingLock) {
                const lockTime = parseInt(existingLock, 10);
                if (now - lockTime < 2500) { // Lock considered active for 2.5 seconds
                    return false;
                }
            }
            
            localStorage.setItem(lockKey, now.toString());
            return true;
        };

        // Attempt to acquire cross-tab lock
        if (typeof navigator !== 'undefined' && navigator.locks) {
            await navigator.locks.request('chat-read-sync', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
                if (lock) {
                    // Provide enough time for the flush to complete before lock releases
                    await executeFlush();
                } else {
                    // Lock held by another tab, we stay passive
                    this.pendingFlush = false;
                }
            });
        } else if (acquireFallbackLock()) {
            await executeFlush();
        } else {
            this.pendingFlush = false;
        }
    }
}
