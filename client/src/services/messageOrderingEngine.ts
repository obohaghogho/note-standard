import { Message } from '../stores/chatStore';

/**
 * Message Ordering Engine
 * Guarantees strict chronological & logical ordering of messages even during
 * packet re-ordering, socket latency, or reconnection recovery.
 */
export class MessageOrderingEngine {
  private static sequenceCounters: Map<string, number> = new Map();

  /**
   * Generates the next local client sequence number for a conversation
   */
  public static getNextClientSequence(conversationId: string): number {
    const current = this.sequenceCounters.get(conversationId) || 0;
    const next = current + 1;
    this.sequenceCounters.set(conversationId, next);
    return next;
  }

  /**
   * Calculates the logical sequence number for a message
   * Logical sequence = (server_sequence * 1,000,000) + client_sequence
   */
  public static computeLogicalSequence(msg: Partial<Message>): number {
    const serverSeq = msg.server_sequence || msg.sequence_number || 0;
    const clientSeq = msg.client_sequence || 0;

    if (serverSeq > 0) {
      return serverSeq * 1_000_000 + (clientSeq % 1_000_000);
    }
    // Optimistic unconfirmed message
    return clientSeq;
  }

  /**
   * Sorts messages deterministically based on timestamp and logical sequence
   */
  public static sortMessages(messages: Message[]): Message[] {
    return [...messages].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();

      if (timeA !== timeB) {
        return timeA - timeB;
      }

      const seqA = a.logical_sequence || this.computeLogicalSequence(a);
      const seqB = b.logical_sequence || this.computeLogicalSequence(b);

      return seqA - seqB;
    });
  }

  /**
   * Merges server-confirmed message with local optimistic message frame
   */
  public static mergeOptimisticMessage(optimisticMsg: Message, serverMsg: Message): Message {
    return {
      ...optimisticMsg,
      ...serverMsg,
      id: serverMsg.id || optimisticMsg.id,
      correlation_id: optimisticMsg.correlation_id || optimisticMsg.id,
      status: serverMsg.status || 'sent',
      delivered_at: serverMsg.delivered_at || optimisticMsg.delivered_at,
      read_at: serverMsg.read_at || optimisticMsg.read_at,
      logical_sequence: this.computeLogicalSequence(serverMsg),
    };
  }
}
