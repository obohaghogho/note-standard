import { generateSnowflakeId } from '../utils/snowflakeId';
import { useChatStore, Message } from '../stores/chatStore';
import { networkPriorityQueue, PriorityTier } from './networkPriorityQueue';
import { MessageOrderingEngine } from './messageOrderingEngine';

export interface PendingQueueItem {
  message: Message;
  retryCount: number;
  maxRetries: number;
  lastAttemptAt: number;
}

/**
 * Message Queue Engine
 * Handles optimistic UI message creation, queue persistence, retry with exponential backoff,
 * and server ACK reconciliation.
 */
export class MessageQueueEngine {
  private static queue: Map<string, PendingQueueItem> = new Map();

  /**
   * Creates an optimistic message instantly (0ms perceived UI latency)
   * and enqueues it for network delivery via networkPriorityQueue.
   */
  public static enqueueSendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: 'text' | 'image' | 'video' | 'file' | 'audio' = 'text',
    sendToServerFn: (msg: Message) => Promise<Message>
  ): Message {
    const tempId = `temp-${generateSnowflakeId()}`;
    const clientSeq = MessageOrderingEngine.getNextClientSequence(conversationId);
    const createdAt = new Date().toISOString();

    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      type,
      created_at: createdAt,
      status: 'pending',
      isOwn: true,
      client_sequence: clientSeq,
      logical_sequence: clientSeq,
      correlation_id: tempId,
    };

    // 1. Instant UI store update (0ms perceived latency)
    useChatStore.getState().upsertMessages(conversationId, [optimisticMsg], false);

    // 2. Queue for network transmission
    const item: PendingQueueItem = {
      message: optimisticMsg,
      retryCount: 0,
      maxRetries: 5,
      lastAttemptAt: Date.now(),
    };
    this.queue.set(tempId, item);

    // 3. Dispatch to Priority Queue Tier 1 (Critical Text)
    networkPriorityQueue.enqueue(PriorityTier.TIER_1_CRITICAL_TEXT, async () => {
      await this.transmitItem(tempId, sendToServerFn);
    });

    return optimisticMsg;
  }

  private static async transmitItem(
    tempId: string,
    sendToServerFn: (msg: Message) => Promise<Message>
  ) {
    const item = this.queue.get(tempId);
    if (!item) return;

    useChatStore.getState().updateMessageStatus(tempId, 'sending');

    try {
      const serverMsg = await sendToServerFn(item.message);

      // Reconcile optimistic message frame with server-confirmed message
      const merged = MessageOrderingEngine.mergeOptimisticMessage(item.message, serverMsg);
      useChatStore.getState().upsertMessages(item.message.conversation_id, [merged], false);
      this.queue.delete(tempId);
    } catch (err) {
      console.error(`[MessageQueue] Delivery failed for ${tempId}:`, err);
      item.retryCount++;
      item.lastAttemptAt = Date.now();

      if (item.retryCount >= item.maxRetries) {
        useChatStore.getState().updateMessageStatus(tempId, 'failed');
        this.queue.delete(tempId);
      } else {
        // Schedule exponential backoff retry
        const backoffMs = Math.min(1000 * Math.pow(2, item.retryCount), 15000);
        setTimeout(() => {
          networkPriorityQueue.enqueue(PriorityTier.TIER_1_CRITICAL_TEXT, async () => {
            await this.transmitItem(tempId, sendToServerFn);
          });
        }, backoffMs);
      }
    }
  }

  public static getPendingCount(): number {
    return this.queue.size;
  }
}
