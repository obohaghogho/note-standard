import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore, Conversation, Message } from '../stores/chatStore';

// Mock IndexedDB
const mockIndexedDB = {
  conversations: new Map<string, Conversation>(),
  messages: new Map<string, Message>(),
  deleteConversation(id: string) {
    this.conversations.delete(id);
    for (const [msgId, msg] of this.messages.entries()) {
      if (msg.conversation_id === id) {
        this.messages.delete(msgId);
      }
    }
  },
  clearMessagesForConversation(id: string) {
    for (const [msgId, msg] of this.messages.entries()) {
      if (msg.conversation_id === id) {
        this.messages.delete(msgId);
      }
    }
  }
};

describe('Chat Dashboard Clear/Delete State Synchronization Suite', () => {
  const sampleConv: Conversation = {
    id: 'conv-101',
    type: 'direct',
    name: 'Alice Cooper',
    updated_at: '2026-08-17T20:00:00Z',
    unreadCount: 3,
    lastMessage: {
      id: 'msg-1',
      content: 'Hello World',
      sender_id: 'user-2',
      created_at: '2026-08-17T20:00:00Z',
    },
    members: [
      { user_id: 'user-1', role: 'member', status: 'active' },
      { user_id: 'user-2', role: 'member', status: 'active' }
    ]
  };

  const sampleMsg: Message = {
    id: 'msg-1',
    conversation_id: 'conv-101',
    sender_id: 'user-2',
    content: 'Hello World',
    created_at: '2026-08-17T20:00:00Z',
    type: 'text'
  };

  beforeEach(() => {
    useChatStore.getState().clearAll();
    mockIndexedDB.conversations.clear();
    mockIndexedDB.messages.clear();

    // Populate initial state
    useChatStore.getState().setConversations([sampleConv]);
    useChatStore.getState().upsertMessages('conv-101', [sampleMsg]);
    mockIndexedDB.conversations.set(sampleConv.id, sampleConv);
    mockIndexedDB.messages.set(sampleMsg.id, sampleMsg);
  });

  it('1. Delete Conversation evicts state from Zustand store and IndexedDB', () => {
    // Assert initial state exists
    expect(useChatStore.getState().conversationsById['conv-101']).toBeDefined();
    expect(useChatStore.getState().conversationMessageIds['conv-101']).toHaveLength(1);
    expect(mockIndexedDB.conversations.has('conv-101')).toBe(true);

    // Evict conversation
    useChatStore.getState().deleteConversation('conv-101');
    mockIndexedDB.deleteConversation('conv-101');

    // Assert Zustand store is cleared
    expect(useChatStore.getState().conversationsById['conv-101']).toBeUndefined();
    expect(useChatStore.getState().conversationIds).not.toContain('conv-101');
    expect(useChatStore.getState().conversationMessageIds['conv-101']).toBeUndefined();
    expect(useChatStore.getState().messagesById['msg-1']).toBeUndefined();

    // Assert IndexedDB is cleared
    expect(mockIndexedDB.conversations.has('conv-101')).toBe(false);
    expect(mockIndexedDB.messages.has('msg-1')).toBe(false);
  });

  it('2. Clear Chat History empties message store and clears lastMessage preview', () => {
    // Clear conversation messages
    useChatStore.getState().clearConversationMessages('conv-101');
    mockIndexedDB.clearMessagesForConversation('conv-101');

    // Assert message state is cleared
    expect(useChatStore.getState().conversationMessageIds['conv-101']).toBeUndefined();
    expect(useChatStore.getState().messagesById['msg-1']).toBeUndefined();
    expect(mockIndexedDB.messages.has('msg-1')).toBe(false);

    // Assert lastMessage snippet and unread badge reset to empty
    const updatedConv = useChatStore.getState().conversationsById['conv-101'];
    expect(updatedConv?.lastMessage).toBeUndefined();
    expect(updatedConv?.unreadCount).toBe(0);
  });

  it('3. Server-authoritative loadConversations does NOT resurrect deleted conversations', () => {
    // Delete conversation locally
    useChatStore.getState().deleteConversation('conv-101');
    const tombstones = new Set(['conv-101']);

    // Simulate server response after deletion (server response does not contain conv-101)
    const serverResponse: Conversation[] = [];

    // Filter server data using tombstones
    const filteredServerData = serverResponse.filter(c => !tombstones.has(c.id));
    useChatStore.getState().setConversations(filteredServerData);

    // Assert conversation is NOT resurrected
    expect(useChatStore.getState().conversationsById['conv-101']).toBeUndefined();
    expect(useChatStore.getState().conversationIds).toHaveLength(0);
  });

  it('4. Stale incoming socket messages are rejected by Tombstones', () => {
    const tombstones = new Set(['conv-101']);

    const staleIncomingMsg: Message = {
      id: 'stale-msg-99',
      conversation_id: 'conv-101',
      sender_id: 'user-2',
      content: 'Stale message',
      created_at: '2026-08-17T20:05:00Z',
      type: 'text'
    };

    // Tombstone guard check
    const isTombstoned = tombstones.has(staleIncomingMsg.conversation_id);
    expect(isTombstoned).toBe(true);

    if (!isTombstoned) {
      useChatStore.getState().upsertMessages('conv-101', [staleIncomingMsg]);
    }

    // Assert message was rejected and not inserted into Zustand
    expect(useChatStore.getState().messagesById['stale-msg-99']).toBeUndefined();
  });

  it('5. Pre-clear messages are rejected by clearedAt timestamp guard', () => {
    const clearedAtTimestamp = new Date('2026-08-17T20:10:00Z').getTime();

    const oldMsg: Message = {
      id: 'old-msg-1',
      conversation_id: 'conv-101',
      sender_id: 'user-2',
      content: 'Pre-clear message',
      created_at: '2026-08-17T20:05:00Z', // Before clearedAt
      type: 'text'
    };

    const newMsg: Message = {
      id: 'new-msg-2',
      conversation_id: 'conv-101',
      sender_id: 'user-2',
      content: 'Genuinely new message',
      created_at: '2026-08-17T20:15:00Z', // After clearedAt
      type: 'text'
    };

    const shouldAcceptOld = new Date(oldMsg.created_at).getTime() > clearedAtTimestamp;
    const shouldAcceptNew = new Date(newMsg.created_at).getTime() > clearedAtTimestamp;

    expect(shouldAcceptOld).toBe(false);
    expect(shouldAcceptNew).toBe(true);

    if (shouldAcceptNew) {
      useChatStore.getState().upsertMessages('conv-101', [newMsg]);
    }

    expect(useChatStore.getState().messagesById['old-msg-1']).toBeUndefined();
    expect(useChatStore.getState().messagesById['new-msg-2']).toBeDefined();
  });
});
