import { EventLedger } from './eventLedger';

/**
 * ReadReceiptEngine — Industry-aligned implementation
 *
 * Pattern adopted from WhatsApp / Telegram / Facebook Messenger:
 *
 *   1. NEVER gate read receipts behind a lease, session ID, or debounce.
 *      The moment the user sees a message, the receipt fires — unconditionally.
 *
 *   2. The server is the single source of truth. `rpc_mark_read` is idempotent
 *      (only marks rows WHERE read_at IS NULL), so calling it multiple times is safe.
 *
 *   3. Local UI (blue tick on the receiver's own screen) updates optimistically
 *      via markLocalReadState — exactly like WhatsApp shows the blue ticks to you
 *      as soon as you scroll over a message.
 *
 * The previous implementation used navigator.locks, localStorage, a 1-second
 * debounce, and a lease barrier — all of which caused the receipt to silently
 * fail when sessionId was null (always true during the first seconds of app load).
 */
export class ReadReceiptEngine {
    private ledger: EventLedger;

    constructor(
        private apiClient: any,
        private getDeviceId: () => string | null,
        private getSessionId: () => string | null,
        // Kept for API compatibility — no longer used to gate receipts.
        private getIsActiveWriter: (conversationId: string) => boolean,
        private markLocalReadState: (conversationId: string, lastMessageId: string) => void
    ) {
        this.ledger = new EventLedger(apiClient);
    }

    /**
     * Called by the UI when a message becomes visible on screen.
     *
     * Fires unconditionally — no lease check, no debounce, no session guard.
     * This is the exact behaviour of WhatsApp and Telegram.
     */
    public onMessageVisible(
        conversationId: string,
        messageId: string,
        correlationId: string = messageId
    ) {
        // Step 1: Optimistic local update — receiver sees blue tick instantly.
        this.markLocalReadState(conversationId, messageId);

        const deviceId = this.getDeviceId();
        if (!deviceId) {
            // deviceId not yet available (first ~500ms of app load) — skip.
            // The conversation-open useEffect in ChatContext will catch this.
            return;
        }

        // Step 2: Persist to server — direct PUT, fire-and-forget.
        // The server's rpc_mark_read is idempotent (WHERE read_at IS NULL),
        // so duplicate calls are harmless.
        this.apiClient
            .put(`/chat/conversations/${conversationId}/read`, {
                deviceId,
                lastMessageId: messageId,
            })
            .then(() => {
                // Emit to Event Ledger for distributed tracing (non-blocking).
                this.ledger.emit({
                    messageId,
                    conversationId,
                    deviceId,
                    sessionId: this.getSessionId(),
                    eventType: 'READ',
                    correlationId,
                });
            })
            .catch((err: any) => {
                // Non-fatal: the conversation-open path in ChatContext is the
                // primary read-marking trigger. This is a secondary best-effort call.
                const isDev =
                    (typeof process !== 'undefined' &&
                        process.env?.NODE_ENV !== 'production') ||
                    // @ts-ignore: React Native global
                    (typeof __DEV__ !== 'undefined' && __DEV__);
                if (isDev) {
                    console.warn(
                        '[ReadReceiptEngine] Failed to emit read receipt:',
                        err?.message
                    );
                }
            });
    }

    /**
     * @deprecated No-op — kept for backward compatibility only.
     * Previously flushed a lease-gated queue. The new implementation fires
     * receipts directly in onMessageVisible, so no queue is needed.
     */
    public async flushQueue(): Promise<void> {
        // No-op.
    }
}
