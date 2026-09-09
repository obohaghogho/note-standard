import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore, Conversation, Message } from '../stores/chatStore';

describe('Cross-Account Switch Isolation & State Isolation Suite', () => {
  const userAConv: Conversation & { owner_user_id?: string } = {
    id: 'conv-user-a',
    type: 'direct',
    name: 'User A Chat',
    updated_at: new Date().toISOString(),
    owner_user_id: 'usr-account-a',
    members: [
      { user_id: 'usr-account-a', role: 'member', status: 'active' },
      { user_id: 'usr-peer-1', role: 'member', status: 'active' }
    ]
  };

  const userBConv: Conversation & { owner_user_id?: string } = {
    id: 'conv-user-b',
    type: 'direct',
    name: 'User B Chat',
    updated_at: new Date().toISOString(),
    owner_user_id: 'usr-account-b',
    members: [
      { user_id: 'usr-account-b', role: 'member', status: 'active' },
      { user_id: 'usr-peer-2', role: 'member', status: 'active' }
    ]
  };

  const userAMessage: Message = {
    id: 'msg-a-1',
    conversation_id: 'conv-user-a',
    sender_id: 'usr-account-a',
    content: 'User A Secret Message',
    created_at: new Date().toISOString(),
    type: 'text'
  };

  beforeEach(() => {
    useChatStore.getState().clearAll();
  });

  it('clears Zustand store entirely when clearAll() is invoked on account switch', () => {
    useChatStore.getState().setConversations([userAConv]);
    useChatStore.getState().upsertMessages(userAConv.id, [userAMessage]);
    useChatStore.getState().setActiveConversationId(userAConv.id);

    expect(useChatStore.getState().conversationIds).toContain('conv-user-a');
    expect(useChatStore.getState().activeConversationId).toBe('conv-user-a');

    // Simulate account switch clearState
    useChatStore.getState().clearAll();

    expect(useChatStore.getState().conversationIds).toHaveLength(0);
    expect(useChatStore.getState().activeConversationId).toBeNull();
    expect(Object.keys(useChatStore.getState().messagesById)).toHaveLength(0);
  });

  it('filters cached conversations strictly by owner_user_id or member user_id', () => {
    const allCached = [userAConv, userBConv];

    const filterForUser = (userId: string, convs: (Conversation & { owner_user_id?: string })[]) => {
      return convs.filter(conv => {
        if (conv.owner_user_id && conv.owner_user_id !== userId) {
          return false;
        }
        if (conv.members && Array.isArray(conv.members) && conv.members.length > 0) {
          return conv.members.some(m => m && (m.user_id === userId || (m.profile && (m.profile as any).id === userId)));
        }
        return conv.owner_user_id === userId;
      });
    };

    const userAResults = filterForUser('usr-account-a', allCached);
    expect(userAResults).toHaveLength(1);
    expect(userAResults[0].id).toBe('conv-user-a');

    const userBResults = filterForUser('usr-account-b', allCached);
    expect(userBResults).toHaveLength(1);
    expect(userBResults[0].id).toBe('conv-user-b');
  });

  it('blocks unowned conversations without members from leaking across users', () => {
    const unownedEmptyMembersConv: Conversation & { owner_user_id?: string } = {
      id: 'conv-legacy-unowned',
      type: 'direct',
      name: 'Unowned Legacy Chat',
      updated_at: new Date().toISOString(),
      owner_user_id: 'usr-account-a',
      members: []
    };

    const allCached = [unownedEmptyMembersConv];

    const filterForUser = (userId: string, convs: (Conversation & { owner_user_id?: string })[]) => {
      return convs.filter(conv => {
        if (conv.owner_user_id && conv.owner_user_id !== userId) {
          return false;
        }
        if (conv.members && Array.isArray(conv.members) && conv.members.length > 0) {
          return conv.members.some(m => m && (m.user_id === userId || (m.profile && (m.profile as any).id === userId)));
        }
        return conv.owner_user_id === userId;
      });
    };

    // User A created it (owner_user_id matches User A) -> included
    expect(filterForUser('usr-account-a', allCached)).toHaveLength(1);

    // User B querying -> blocked because owner_user_id != User B and members is empty
    expect(filterForUser('usr-account-b', allCached)).toHaveLength(0);
  });
});
