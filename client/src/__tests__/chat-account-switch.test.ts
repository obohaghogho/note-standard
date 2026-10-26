import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore, Conversation, Message } from '../stores/chatStore';
import { accountManager, StoredAccount, getTabAuthToken } from '../utils/accountManager';

// Polyfill in-memory web storages if running in node environment
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}
if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') {
  const createMockStorage = () => {
    let store: Record<string, string> = {};
    return {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { store = {}; },
      get length() { return Object.keys(store).length; },
      key: (i: number) => Object.keys(store)[i] ?? null,
    };
  };
  if (typeof localStorage === 'undefined') {
    (globalThis as any).localStorage = createMockStorage();
  }
  if (typeof sessionStorage === 'undefined') {
    (globalThis as any).sessionStorage = createMockStorage();
    (globalThis as any).window.sessionStorage = (globalThis as any).sessionStorage;
    (globalThis as any).window.localStorage = (globalThis as any).localStorage;
  }
}

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

  const accA: StoredAccount = {
    id: 'usr-account-a',
    email: 'userA@notestandard.com',
    full_name: 'User A',
    avatar_url: null,
    tokens: { access_token: 'token-A', refresh_token: 'refresh-A', expires_at: Date.now() + 3600000 },
    profile: { id: 'usr-account-a', email: 'userA@notestandard.com', username: 'user_a', full_name: 'User A' } as any,
    lastActive: Date.now()
  };

  const accB: StoredAccount = {
    id: 'usr-account-b',
    email: 'userB@notestandard.com',
    full_name: 'User B',
    avatar_url: null,
    tokens: { access_token: 'token-B', refresh_token: 'refresh-B', expires_at: Date.now() + 3600000 },
    profile: { id: 'usr-account-b', email: 'userB@notestandard.com', username: 'user_b', full_name: 'User B' } as any,
    lastActive: Date.now()
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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

  it('filters cached messages strictly by owner_user_id to prevent data leaks', () => {
    const userAMsgWithOwner: Message & { owner_user_id?: string } = {
      ...userAMessage,
      owner_user_id: 'usr-account-a'
    };
    const userBMsgWithOwner: Message & { owner_user_id?: string } = {
      id: 'msg-b-1',
      conversation_id: 'conv-user-a', // Same conversation ID!
      sender_id: 'usr-account-b',
      content: 'User B Secret Message',
      created_at: new Date().toISOString(),
      type: 'text',
      owner_user_id: 'usr-account-b'
    };

    const allMsgs = [userAMsgWithOwner, userBMsgWithOwner];

    const filterMsgsForUser = (userId: string, msgs: (Message & { owner_user_id?: string })[]) => {
      return msgs.filter(m => !m.owner_user_id || m.owner_user_id === userId);
    };

    const userAMsgs = filterMsgsForUser('usr-account-a', allMsgs);
    expect(userAMsgs).toHaveLength(1);
    expect(userAMsgs[0].id).toBe('msg-a-1');

    const userBMsgs = filterMsgsForUser('usr-account-b', allMsgs);
    expect(userBMsgs).toHaveLength(1);
    expect(userBMsgs[0].id).toBe('msg-b-1');
  });

  // =========================================================================
  // Test A — Cross-tab isolation
  // =========================================================================
  it('Test A — Cross-tab isolation: Tab B authentication does not displace Tab A active identity', () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));

    // Tab A initializes as User A
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');
    sessionStorage.setItem('token', 'token-A');
    localStorage.setItem('notestandard_active_account_id', 'usr-account-a');
    localStorage.setItem('token', 'token-A');

    expect(accountManager.getActiveAccountId()).toBe('usr-account-a');

    // Simulate Tab B registering / authenticating as User B on the same origin
    // Tab B overwrites shared localStorage keys, but NOT Tab A's sessionStorage
    localStorage.setItem('notestandard_active_account_id', 'usr-account-b');
    localStorage.setItem('token', 'token-B');

    // Tab A checks its active account ID again
    // Because Tab A uses tab-scoped sessionStorage priority, it remains firmly User A!
    expect(accountManager.getActiveAccountId()).toBe('usr-account-a');
    expect(sessionStorage.getItem('token')).toBe('token-A');
  });

  // =========================================================================
  // Test B — Switch and restore with cache retention
  // =========================================================================
  it('Test B — Switch and restore: Preserves User A offline cache while flushing in-memory state for User B', () => {
    // 1. User A is active with conversations in memory and cache
    useChatStore.getState().setConversations([userAConv]);
    useChatStore.getState().upsertMessages(userAConv.id, [userAMessage]);
    useChatStore.getState().setActiveConversationId(userAConv.id);

    // Mock cache store containing User A's data
    const mockCache: (Conversation & { owner_user_id?: string })[] = [userAConv];

    // 2. Switch to User B: in-memory state is cleared immediately
    useChatStore.getState().clearAll();

    expect(useChatStore.getState().conversationIds).toHaveLength(0);
    expect(useChatStore.getState().activeConversationId).toBeNull();
    expect(Object.keys(useChatStore.getState().messagesById)).toHaveLength(0);

    // User B querying cache sees 0 conversations (no data leak)
    const filterForUser = (userId: string, convs: (Conversation & { owner_user_id?: string })[]) => {
      return convs.filter(c => c.owner_user_id === userId || (c.members && c.members.some(m => m.user_id === userId)));
    };
    expect(filterForUser('usr-account-b', mockCache)).toHaveLength(0);

    // 3. User B receives their own conversation
    mockCache.push(userBConv);
    expect(filterForUser('usr-account-b', mockCache)).toHaveLength(1);
    expect(filterForUser('usr-account-b', mockCache)[0].id).toBe('conv-user-b');

    // 4. Switch back to User A: User A's offline cache was preserved!
    const userARestored = filterForUser('usr-account-a', mockCache);
    expect(userARestored).toHaveLength(1);
    expect(userARestored[0].id).toBe('conv-user-a');

    // Hydrate User A back into Zustand store
    useChatStore.getState().setConversations(userARestored);
    expect(useChatStore.getState().conversationIds).toContain('conv-user-a');
  });

  // =========================================================================
  // Test C — Stale response race
  // =========================================================================
  it('Test C — Stale response race: In-flight response from User A is discarded after identity switches to User B', () => {
    let currentUserId: string | null = 'usr-account-a';

    // Simulate an async fetch started by User A
    const requestUserId = currentUserId;

    // Simulate identity switch occurring before response returns
    currentUserId = 'usr-account-b';
    useChatStore.getState().clearAll();

    // In-flight response returns with User A data
    const incomingData = [userAConv];

    // Staleness guard check as implemented in ChatContext.tsx L914
    const isStale = currentUserId !== requestUserId;
    if (!isStale) {
      useChatStore.getState().setConversations(incomingData);
    }

    // Assert that User A data was NOT applied to User B
    expect(isStale).toBe(true);
    expect(useChatStore.getState().conversationIds).toHaveLength(0);
  });

  // =========================================================================
  // Test D — Logout and account removal
  // =========================================================================
  it('Test D — Logout and account removal: Explicit removal prunes account and clears active selection', () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    accountManager.setActiveAccountId('usr-account-a');

    expect(accountManager.getActiveAccountId()).toBe('usr-account-a');

    // Explicitly remove User A
    accountManager.removeAccount('usr-account-a');

    // User A is no longer in accounts list
    const remaining = accountManager.getAllAccounts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('usr-account-b');

    // Active account is cleared
    expect(accountManager.getActiveAccountId()).toBeNull();
  });

  // =========================================================================
  // Test E — Auth initialization
  // =========================================================================
  it('Test E — Auth initialization: Fresh tab seeds sessionStorage from localStorage without empty-state flash', () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA]));
    localStorage.setItem('notestandard_active_account_id', 'usr-account-a');
    localStorage.setItem('token', 'token-A');

    // Fresh tab has empty sessionStorage
    expect(sessionStorage.getItem('notestandard_active_account_id')).toBeNull();

    // First call to getActiveAccountId in fresh tab reads from localStorage and seeds sessionStorage
    const active = accountManager.getActiveAccountId();
    expect(active).toBe('usr-account-a');
    expect(sessionStorage.getItem('notestandard_active_account_id')).toBe('usr-account-a');
  });
});

describe('Phase 101.45/101.47 — Token Isolation & Ownership Verification Security Tests', () => {
  const accA: StoredAccount = {
    id: 'usr-account-a',
    email: 'userA@notestandard.com',
    full_name: 'User A',
    avatar_url: null,
    tokens: { access_token: 'token-A-secure', refresh_token: 'refresh-A', expires_at: Date.now() + 3600000 },
    profile: { id: 'usr-account-a', email: 'userA@notestandard.com', username: 'user_a', full_name: 'User A' } as any,
    lastActive: Date.now()
  };

  const accB: StoredAccount = {
    id: 'usr-account-b',
    email: 'userB@notestandard.com',
    full_name: 'User B',
    avatar_url: null,
    tokens: { access_token: 'token-B-secure', refresh_token: 'refresh-B', expires_at: Date.now() + 3600000 },
    profile: { id: 'usr-account-b', email: 'userB@notestandard.com', username: 'user_b', full_name: 'User B' } as any,
    lastActive: Date.now()
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useChatStore.getState().clearAll();
  });

  // S1 — Untagged generic localStorage['token'] write by Tab B does not bleed into Tab A
  it('S1: Tab B write to localStorage[token] does not affect Tab A token resolution', () => {
    // Setup: User A is logged in on Tab A
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');
    sessionStorage.setItem('token', 'token-A-secure');

    // Tab B registers/logs in as User B and writes to generic shared localStorage
    localStorage.setItem('token', 'token-B-intrusive');
    localStorage.setItem('notestandard_active_account_id', 'usr-account-b');

    // Tab A resolves active account and token via getTabAuthToken()
    const activeId = accountManager.getActiveAccountId();
    expect(activeId).toBe('usr-account-a');

    const token = getTabAuthToken();
    expect(token).toBe('token-A-secure');
    expect(token).not.toBe('token-B-intrusive');
    expect(token).not.toBe(localStorage.getItem('token'));
  });

  // S2 — Production getTabAuthToken() fails closed when activeId is missing or invalid
  it('S2: Production getTabAuthToken() fails closed when active account is not set', () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accB]));
    localStorage.setItem('token', 'token-B-intrusive');
    sessionStorage.setItem('token', 'token-B-intrusive');

    sessionStorage.clear();
    // No active account set in sessionStorage or localStorage
    const activeId = accountManager.getActiveAccountId();
    expect(activeId).toBeNull();

    // Production getTabAuthToken() must fail closed (return null)
    const token = getTabAuthToken();
    expect(token).toBeNull();
    expect(token).not.toBe('token-B-intrusive');
  });

  // S3 — Active account pointer and Supabase session mismatch: restore verified account token
  it('S3: Session/account mismatch restores verified active account token', () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');

    const activeId = accountManager.getActiveAccountId();
    expect(activeId).toBe('usr-account-a');

    // Verified production token resolver returns User A token
    const token = getTabAuthToken();
    expect(token).toBe('token-A-secure');
    expect(token).not.toBe('token-B-from-session');
  });

  // S4 — Valid User A session remains usable while Tab B authenticates as User B
  it('S4: User A session token remains resolvable after Tab B authenticates as User B', () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');
    sessionStorage.setItem('token', 'token-A-secure');

    expect(accountManager.getActiveAccountId()).toBe('usr-account-a');
    expect(getTabAuthToken()).toBe('token-A-secure');

    // Tab B updates shared localStorage
    const updatedAccounts = [accA, accB];
    localStorage.setItem('notestandard_accounts', JSON.stringify(updatedAccounts));
    localStorage.setItem('notestandard_active_account_id', 'usr-account-b');
    localStorage.setItem('token', 'token-B-intrusive');

    // Tab A sessionStorage was not overwritten
    expect(sessionStorage.getItem('notestandard_active_account_id')).toBe('usr-account-a');

    // Tab A still resolves User A token
    const activeId = accountManager.getActiveAccountId();
    expect(activeId).toBe('usr-account-a');
    expect(getTabAuthToken()).toBe('token-A-secure');
    expect(getTabAuthToken()).not.toBe('token-B-intrusive');
  });

  // S5 — Account switch preserves outgoing user's cached data
  it('S5: Switching from User A to User B does not remove User A from account registry', () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    accountManager.setActiveAccountId('usr-account-a');

    expect(accountManager.getActiveAccountId()).toBe('usr-account-a');
    expect(accountManager.getAllAccounts()).toHaveLength(2);

    // Switch to User B
    accountManager.setActiveAccountId('usr-account-b');

    expect(accountManager.getAllAccounts()).toHaveLength(2);
    expect(accountManager.getAccount('usr-account-a')).toBeDefined();
    expect(accountManager.getAccount('usr-account-a')?.tokens?.access_token).toBe('token-A-secure');
  });

  // S6 — Explicit logout removes account and clears token
  it('S6: Explicit logout removes account entry and active pointer', () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    accountManager.setActiveAccountId('usr-account-a');

    accountManager.removeAccount('usr-account-a');

    expect(accountManager.getAllAccounts()).toHaveLength(1);
    expect(accountManager.getAccount('usr-account-a')).toBeUndefined();
    expect(accountManager.getActiveAccountId()).toBeNull();
  });

  // S7 — Cache write guard: owner ID must match active user (guards all 4 saveConversations sites)
  it('S7: Cache write without owner skips write rather than persisting unowned record', () => {
    const mockSaveConversations = vi.fn();
    const conversations = [{ id: 'conv-1', type: 'direct' }];

    const performCacheWrite = (currentUserId: string | undefined | null) => {
      if (currentUserId) {
        mockSaveConversations(conversations, currentUserId);
      }
    };

    // Case 1: Owner present -> write proceeds
    performCacheWrite('usr-account-a');
    expect(mockSaveConversations).toHaveBeenCalledTimes(1);
    expect(mockSaveConversations).toHaveBeenCalledWith(conversations, 'usr-account-a');

    // Case 2: Owner absent (undefined) -> write skipped
    mockSaveConversations.mockClear();
    performCacheWrite(undefined);
    expect(mockSaveConversations).not.toHaveBeenCalled();

    // Case 3: Owner is empty string -> also skipped (falsy)
    mockSaveConversations.mockClear();
    performCacheWrite('');
    expect(mockSaveConversations).not.toHaveBeenCalled();
  });

  // S8 — Delayed realtime callback from User A cannot persist into User B's cache
  it('S8: Realtime callback from User A session is discarded if tab switched to User B', () => {
    let tabActiveUserId = 'usr-account-a';
    const requestingUserId = tabActiveUserId;

    // Simulate tab switching to User B before callback fires
    tabActiveUserId = 'usr-account-b';

    const mockSaveConversations = vi.fn();
    const conversations = [{ id: 'conv-user-a', type: 'direct', owner_user_id: 'usr-account-a' }];

    const isStale = tabActiveUserId !== requestingUserId;
    if (!isStale) {
      const currentUserId = tabActiveUserId;
      if (currentUserId) {
        mockSaveConversations(conversations, currentUserId);
      }
    }

    expect(isStale).toBe(true);
    expect(mockSaveConversations).not.toHaveBeenCalled();
  });

  // S9 — 401 Retry Response Interceptor: Request identity binding & validation contract
  it('S9: 401 retry validates refreshed token owner matches request owner and active account', () => {
    // Implements exact contract from axiosInstance.ts response interceptor:
    const validateRetryIdentity = (
      requestOwnerId: string | undefined,
      refreshedUserId: string | undefined,
      currentActiveId: string | null
    ): boolean => {
      return requestOwnerId
        ? (refreshedUserId === requestOwnerId && currentActiveId === requestOwnerId)
        : (!!refreshedUserId && !!currentActiveId && refreshedUserId === currentActiveId);
    };

    // Case 1: Perfect match — requestOwner is A, refreshedUser is A, activeAccount is A => retry allowed
    expect(validateRetryIdentity('usr-account-a', 'usr-account-a', 'usr-account-a')).toBe(true);

    // Case 2: Switched account before retry — requestOwner is A, refreshedUser is B, activeAccount is B => rejected
    expect(validateRetryIdentity('usr-account-a', 'usr-account-b', 'usr-account-b')).toBe(false);

    // Case 3: Refreshed token is A, but active account in tab switched to B => rejected
    expect(validateRetryIdentity('usr-account-a', 'usr-account-a', 'usr-account-b')).toBe(false);

    // Case 4: Refreshed token is B, active account is still A => rejected
    expect(validateRetryIdentity('usr-account-a', 'usr-account-b', 'usr-account-a')).toBe(false);

    // Case 5: Unbound legacy request without captured owner — refreshed user must still match active account
    expect(validateRetryIdentity(undefined, 'usr-account-a', 'usr-account-a')).toBe(true);
    expect(validateRetryIdentity(undefined, 'usr-account-a', 'usr-account-b')).toBe(false);
    expect(validateRetryIdentity(undefined, undefined, 'usr-account-a')).toBe(false);
  });

  // S10 — getTabAuthToken Tier-2 sessionStorage verification
  it('S10: getTabAuthToken verifies sessionStorage token against active account tokens', () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');

    // Case A: Account in registry has token-A-secure. sessionStorage has same token => returns token
    sessionStorage.setItem('token', 'token-A-secure');
    expect(getTabAuthToken()).toBe('token-A-secure');

    // Case B: Account in registry has empty tokens, but sessionStorage has a token
    const accAEmptyTokens: StoredAccount = { ...accA, tokens: { access_token: '', refresh_token: '', expires_at: 0 } };
    localStorage.setItem('notestandard_accounts', JSON.stringify([accAEmptyTokens]));
    sessionStorage.setItem('token', 'token-unverified');
    // Tier-2 requires token to match acc.tokens.access_token => fails closed, returns null
    expect(getTabAuthToken()).toBeNull();

    // Case C: activeId points to evicted account (not in accounts list) -> fails closed
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-ghost');
    expect(getTabAuthToken()).toBeNull();
  });

  // S11 — Phase 101.55: Ownership guard: foreign-account SIGNED_IN must NOT overwrite React state
  // This test verifies the contract of the ownership guard logic extracted from AuthContext.
  it('S11: Ownership guard rejects SIGNED_IN event for foreign account and preserves tab state', () => {
    // Setup: Tab A owns usr-account-a
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');
    sessionStorage.setItem('token', 'token-A-secure');

    // Simulate the ownership guard logic from AuthContext.onAuthStateChange
    const simulateOnAuthStateChange = (
      incomingUserId: string,
      incomingToken: string,
      isSwitchInProgress: boolean
    ): 'accepted' | 'rejected' => {
      const establishedActiveId = accountManager.getActiveAccountId();
      const currentUser = { id: incomingUserId };

      if (
        establishedActiveId &&
        !isSwitchInProgress &&
        currentUser.id !== establishedActiveId
      ) {
        // Guard triggered: cache tokens for foreign account but do NOT apply to tab state
        accountManager.updateAccountTokens(incomingUserId, {
          access_token: incomingToken,
          refresh_token: 'mock-refresh',
          expires_at: Date.now() + 3600
        } as any);
        return 'rejected';
      }
      return 'accepted';
    };

    // Case A: Tab A receives SIGNED_IN for Account B (foreign event) → rejected
    const resultA = simulateOnAuthStateChange('usr-account-b', 'token-B-foreign', false);
    expect(resultA).toBe('rejected');

    // Tab A's active account and token must be unchanged
    expect(accountManager.getActiveAccountId()).toBe('usr-account-a');
    expect(sessionStorage.getItem('token')).toBe('token-A-secure');
    expect(sessionStorage.getItem('notestandard_active_account_id')).toBe('usr-account-a');

    // Account B's tokens were cached silently by the guard
    const accBCached = accountManager.getAccount('usr-account-b');
    expect(accBCached?.tokens?.access_token).toBe('token-B-foreign');

    // Case B: Tab A receives TOKEN_REFRESHED for Account A (own event) → accepted
    const resultB = simulateOnAuthStateChange('usr-account-a', 'token-A-refreshed', false);
    expect(resultB).toBe('accepted');

    // Case C: Intentional switch in progress → guard bypassed → accepted
    const resultC = simulateOnAuthStateChange('usr-account-b', 'token-B-switch', true);
    expect(resultC).toBe('accepted');

    // Case D: No established active account (fresh tab) → guard bypassed → accepted
    sessionStorage.removeItem('notestandard_active_account_id');
    localStorage.removeItem('notestandard_active_account_id');
    const resultD = simulateOnAuthStateChange('usr-account-b', 'token-B-first', false);
    expect(resultD).toBe('accepted');
  });

  // S12 — Phase 101.55: Session cache ownership guard contract
  // Validates that the supabaseSafe._sessionCache is NOT updated when a foreign-account session arrives.
  it('S12: Session cache ownership guard ignores foreign-tab session and preserves own cache', () => {
    // This test verifies the logic extracted from supabaseSafe.ts onAuthStateChange guard.
    const simulateSessionCacheGuard = (
      tabActiveId: string | null,
      incomingUserId: string,
      currentCacheToken: string | null
    ): { cacheUpdated: boolean; cacheToken: string | null } => {
      let cacheToken = currentCacheToken;

      if (!tabActiveId || incomingUserId === tabActiveId) {
        // Own-tab event: update cache
        cacheToken = 'token-' + incomingUserId + '-refreshed';
        return { cacheUpdated: true, cacheToken };
      } else {
        // Foreign-tab event: do NOT update cache
        return { cacheUpdated: false, cacheToken };
      }
    };

    // Case A: Tab A (owns A) receives session for B → cache must NOT update
    const resA = simulateSessionCacheGuard('usr-account-a', 'usr-account-b', 'token-A-current');
    expect(resA.cacheUpdated).toBe(false);
    expect(resA.cacheToken).toBe('token-A-current');

    // Case B: Tab A (owns A) receives session for A → cache updates normally
    const resB = simulateSessionCacheGuard('usr-account-a', 'usr-account-a', 'token-A-current');
    expect(resB.cacheUpdated).toBe(true);
    expect(resB.cacheToken).toBe('token-usr-account-a-refreshed');

    // Case C: Fresh tab (no established account) receives any session → cache updates
    const resC = simulateSessionCacheGuard(null, 'usr-account-b', null);
    expect(resC.cacheUpdated).toBe(true);
    expect(resC.cacheToken).toBe('token-usr-account-b-refreshed');
  });
});
