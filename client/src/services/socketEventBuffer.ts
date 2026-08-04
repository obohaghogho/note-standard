import { useChatStore, Message, MessageStatus } from '../stores/chatStore';

type BufferedEvent =
  | { type: 'NEW_MESSAGE'; conversationId: string; message: Message }
  | { type: 'STATUS_UPDATE'; messageId: string; status: MessageStatus; timestamps?: { delivered_at?: string; read_at?: string } }
  | { type: 'TYPING_STATUS'; conversationId: string; username: string; isTyping: boolean };

/**
 * Socket Event Buffer & rAF Scheduler
 * Batches incoming socket events over 8-16ms windows and flushes them into a
 * single Zustand store mutation aligned with the browser's paint cycle.
 */
class SocketEventBuffer {
  private buffer: BufferedEvent[] = [];
  private rafId: number | null = null;
  private batchTimer: NodeJS.Timeout | null = null;

  public push(event: BufferedEvent) {
    this.buffer.push(event);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.rafId !== null || this.batchTimer !== null) return;

    // Use requestAnimationFrame if available in browser
    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(() => {
        this.flush();
      });
    } else {
      this.batchTimer = setTimeout(() => {
        this.flush();
      }, 12);
    }
  }

  private flush() {
    this.rafId = null;
    this.batchTimer = null;

    if (!this.buffer.length) return;

    const eventsToProcess = [...this.buffer];
    this.buffer = [];

    const start = performance.now();

    // Group events for efficient batch mutation
    const messagesByConv: Record<string, Message[]> = {};
    const store = useChatStore.getState();

    eventsToProcess.forEach((evt) => {
      if (evt.type === 'NEW_MESSAGE') {
        if (!messagesByConv[evt.conversationId]) {
          messagesByConv[evt.conversationId] = [];
        }
        messagesByConv[evt.conversationId].push(evt.message);
      } else if (evt.type === 'STATUS_UPDATE') {
        store.updateMessageStatus(evt.messageId, evt.status, evt.timestamps);
      } else if (evt.type === 'TYPING_STATUS') {
        store.setTypingStatus(evt.conversationId, evt.username, evt.isTyping);
      }
    });

    Object.entries(messagesByConv).forEach(([convId, msgs]) => {
      store.upsertMessages(convId, msgs, false);
    });

    const elapsed = performance.now() - start;
    if (elapsed > 4) {
      store.updateMetrics({ renderTimeMs: Math.round(elapsed) });
    }
  }
}

export const socketEventBuffer = new SocketEventBuffer();
