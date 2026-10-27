import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// Polyfill window, storage, and location before any module loads
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}
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
}
(globalThis as any).window.localStorage = (globalThis as any).localStorage;
(globalThis as any).window.sessionStorage = (globalThis as any).sessionStorage;
(globalThis as any).window.location = { pathname: '/dashboard', href: '' };

// Mocks for external auth providers
export const mockRefreshSession = vi.fn();
export const mockGetSession = vi.fn();
export const mockSafeAuth = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: any[]) => mockGetSession(...args),
      refreshSession: (...args: any[]) => mockRefreshSession(...args),
    }
  }
}));

vi.mock('../lib/supabaseSafe', () => ({
  safeAuth: (...args: any[]) => mockSafeAuth(...args)
}));

import api from '../api/axiosInstance';
import { accountManager, StoredAccount } from '../utils/accountManager';

// Helper to create a compliant Axios 401 error object
function createAxios401Error(config: InternalAxiosRequestConfig): any {
  const err: any = new Error('Request failed with status code 401');
  err.config = config;
  err.response = {
    status: 401,
    statusText: 'Unauthorized',
    data: { error: 'jwt expired' },
    headers: {},
    config
  };
  err.isAxiosError = true;
  return err;
}

describe('Phase 101.49 — Real Axios Interceptor Security Test Harness', () => {
  const accA: StoredAccount = {
    id: 'usr-account-a',
    email: 'userA@notestandard.com',
    full_name: 'User A',
    avatar_url: null,
    tokens: { access_token: 'token-A-init', refresh_token: 'refresh-A', expires_at: Date.now() + 3600000 },
    profile: { id: 'usr-account-a', email: 'userA@notestandard.com' } as any,
    lastActive: Date.now()
  };

  const accB: StoredAccount = {
    id: 'usr-account-b',
    email: 'userB@notestandard.com',
    full_name: 'User B',
    avatar_url: null,
    tokens: { access_token: 'token-B-init', refresh_token: 'refresh-B', expires_at: Date.now() + 3600000 },
    profile: { id: 'usr-account-b', email: 'userB@notestandard.com' } as any,
    lastActive: Date.now()
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    (globalThis as any).window.location = { pathname: '/dashboard', href: '' };
  });

  // =========================================================================
  // Case 1: Standard Same-User 401 Retry Success
  // =========================================================================
  it('Case 1: User A receives 401, refreshes as A, remains active, and retries with refreshed token', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');

    mockSafeAuth.mockResolvedValue({
      access_token: 'token-A-init',
      user: { id: 'usr-account-a' }
    });

    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-A-refreshed',
          user: { id: 'usr-account-a' }
        }
      },
      error: null
    });

    const adapterCalls: any[] = [];
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      adapterCalls.push({
        callIndex: adapterCalls.length + 1,
        headers: { ...config.headers },
        owner: (config as any).__requestOwnerId,
        isRetry: (config as any).__is401Retry
      });

      if (adapterCalls.length === 1) {
        throw createAxios401Error(config);
      }

      return {
        data: { success: true, payload: 'user-a-data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config
      } as AxiosResponse;
    };

    const res = await api.get('/notes');
    expect(res.data).toEqual({ success: true, payload: 'user-a-data' });

    // Assert adapter was called exactly twice
    expect(adapterCalls).toHaveLength(2);

    // Call 1: initial dispatch
    expect(adapterCalls[0].headers.Authorization).toBe('Bearer token-A-init');
    expect(adapterCalls[0].owner).toBe('usr-account-a');
    expect(adapterCalls[0].isRetry).toBeUndefined();

    // Call 2: retry after refresh
    expect(adapterCalls[1].headers.Authorization).toBe('Bearer token-A-refreshed');
    expect(adapterCalls[1].owner).toBe('usr-account-a');
    expect(adapterCalls[1].isRetry).toBe(true);

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Case 2: Account Switch During Refresh Aborts Retry
  // =========================================================================
  it('Case 2: Active account switches to User B while refresh is in flight -> retry rejected', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');

    mockSafeAuth.mockResolvedValue({
      access_token: 'token-A-init',
      user: { id: 'usr-account-a' }
    });

    // Create a deferred promise to control the timing of refresh completion
    let resolveRefresh: (val: any) => void = () => {};
    const deferredRefresh = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    mockRefreshSession.mockImplementation(() => deferredRefresh);

    const adapterCalls: any[] = [];
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      adapterCalls.push({
        callIndex: adapterCalls.length + 1,
        headers: { ...config.headers },
        owner: (config as any).__requestOwnerId
      });
      throw createAxios401Error(config);
    };

    // Dispatch request under User A
    const requestPromise = api.get('/wallet/balance');

    // Wait for the adapter to be called and 401 triggered
    await new Promise((r) => setTimeout(r, 20));
    expect(adapterCalls).toHaveLength(1);
    expect(adapterCalls[0].owner).toBe('usr-account-a');

    // While refreshSession is pending, the tab switches active account to User B!
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-b');
    localStorage.setItem('notestandard_active_account_id', 'usr-account-b');
    expect(accountManager.getActiveAccountId()).toBe('usr-account-b');

    // Now resolve the refresh with User A credentials
    resolveRefresh({
      data: {
        session: {
          access_token: 'token-A-refreshed',
          user: { id: 'usr-account-a' }
        }
      },
      error: null
    });

    // The request MUST reject because active account ('usr-account-b') !== request owner ('usr-account-a')
    await expect(requestPromise).rejects.toThrow();

    // CRITICAL NEGATIVE ASSERTION: No retry was dispatched to the adapter!
    expect(adapterCalls).toHaveLength(1);
  });

  // =========================================================================
  // Case 3: Refreshed Session User ID Mismatches Request Owner
  // =========================================================================
  it('Case 3: Refreshed session belongs to User B while request owner is User A -> retry rejected', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');

    mockSafeAuth.mockResolvedValue({
      access_token: 'token-A-init',
      user: { id: 'usr-account-a' }
    });

    // Supabase refresh returns User B session (cross-tab bleed into Supabase client)
    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-B-bled',
          user: { id: 'usr-account-b' }
        }
      },
      error: null
    });

    const adapterCalls: any[] = [];
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      adapterCalls.push({ callIndex: adapterCalls.length + 1 });
      throw createAxios401Error(config);
    };

    await expect(api.get('/profile')).rejects.toThrow();

    // Assert retry was aborted — adapter called only once
    expect(adapterCalls).toHaveLength(1);
  });

  // =========================================================================
  // Case 4: Account Change After Validation but In-Flight on Retry
  // =========================================================================
  it('Case 4: Account switches while retried request is in flight -> retry cannot re-retry', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');

    mockSafeAuth.mockResolvedValue({
      access_token: 'token-A-init',
      user: { id: 'usr-account-a' }
    });

    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-A-refreshed',
          user: { id: 'usr-account-a' }
        }
      },
      error: null
    });

    let retryAdapterResolve: (val: any) => void = () => {};
    const deferredRetryAdapter = new Promise((resolve) => {
      retryAdapterResolve = resolve;
    });

    const adapterCalls: any[] = [];
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      adapterCalls.push({
        callIndex: adapterCalls.length + 1,
        headers: { ...config.headers },
        owner: (config as any).__requestOwnerId,
        isRetry: (config as any).__is401Retry
      });

      if (adapterCalls.length === 1) {
        throw createAxios401Error(config);
      }

      // On retry call, wait for deferred completion
      await deferredRetryAdapter;
      // Simulate retry also failing with 401
      throw createAxios401Error(config);
    };

    const reqPromise = api.get('/sensitive-docs');

    // Wait until retry has been dispatched to adapter
    await new Promise((r) => setTimeout(r, 20));
    expect(adapterCalls).toHaveLength(2);
    expect(adapterCalls[1].isRetry).toBe(true);
    expect(adapterCalls[1].owner).toBe('usr-account-a');

    // While retry is in flight, account switches to User B
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-b');

    // Now let the retry fail with 401
    retryAdapterResolve(null);

    // Because __is401Retry is true, it MUST NOT attempt a 2nd refresh or retry
    await expect(reqPromise).rejects.toThrow();

    // Adapter was called exactly 2 times (no 3rd call)
    expect(adapterCalls).toHaveLength(2);
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Case 5: Unbound Legacy Request Without Captured Owner
  // =========================================================================
  it('Case 5: Unbound request without owner rejects retry if refreshed user != active account', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-b'); // Active is B

    // Simulate request with no captured owner (falsy __requestOwnerId)
    // Refreshed session is User A
    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-A-refreshed',
          user: { id: 'usr-account-a' }
        }
      },
      error: null
    });

    const adapterCalls: any[] = [];
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      adapterCalls.push(1);
      // Strip owner if set to test unbound fallback
      delete (config as any).__requestOwnerId;
      throw createAxios401Error(config);
    };

    // Even without an initial request owner, refreshed user ('usr-account-a') !== active account ('usr-account-b')
    await expect(api.get('/public-legacy')).rejects.toThrow();
    expect(adapterCalls).toHaveLength(1);
  });

  // =========================================================================
  // Case 6: Refresh Failure & Session Cleanup Without Navigation Crash
  // =========================================================================
  it('Case 6: Refresh failure clears auth keys and sets login redirect href safely', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');
    localStorage.setItem('sb-test-auth', 'token-data');
    localStorage.setItem('token', 'token-data');

    mockSafeAuth.mockResolvedValue({
      access_token: 'token-A-expired',
      user: { id: 'usr-account-a' }
    });

    mockRefreshSession.mockResolvedValue({
      data: null,
      error: new Error('Invalid refresh token')
    });

    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      throw createAxios401Error(config);
    };

    await expect(api.get('/dashboard/stats')).rejects.toThrow();

    // Assert auth keys were removed from localStorage
    expect(localStorage.getItem('sb-test-auth')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();

    // Assert safe redirect location was set
    expect((globalThis as any).window.location.href).toBe('/login?reason=session_expired');
  });

  // =========================================================================
  // Case 7: Concurrent 401s Do Not Cause Cross-Account Replay
  // =========================================================================
  it('Case 7: Concurrent 401 requests during account switch all reject safely without replay', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');

    mockSafeAuth.mockResolvedValue({
      access_token: 'token-A-init',
      user: { id: 'usr-account-a' }
    });

    let resolveRefresh: (val: any) => void = () => {};
    const deferredRefresh = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    mockRefreshSession.mockImplementation(() => deferredRefresh);

    const adapterCalls: any[] = [];
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      adapterCalls.push(config.url);
      throw createAxios401Error(config);
    };

    // Dispatch 3 concurrent requests under User A, catching rejections locally to avoid Node unhandled rejection flags
    const errors: any[] = [];
    const p1 = api.get('/endpoint-1').catch((err) => { errors.push(err); return 'rejected'; });
    const p2 = api.get('/endpoint-2').catch((err) => { errors.push(err); return 'rejected'; });
    const p3 = api.get('/endpoint-3').catch((err) => { errors.push(err); return 'rejected'; });

    await new Promise((r) => setTimeout(r, 20));
    expect(adapterCalls).toHaveLength(3);

    // Switch account to User B while all 3 are awaiting refresh
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-b');

    // Resolve refresh with User A session
    resolveRefresh({
      data: {
        session: {
          access_token: 'token-A-refreshed',
          user: { id: 'usr-account-a' }
        }
      },
      error: null
    });

    // All 3 must reject
    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual(['rejected', 'rejected', 'rejected']);
    expect(errors).toHaveLength(3);

    // Zero retries dispatched
    expect(adapterCalls).toHaveLength(3);
  });

  // =========================================================================
  // Case 8: Preservation of __requestOwnerId Through Config Merging
  // =========================================================================
  it('Case 8: Request owner and is401Retry flags survive Axios config merging on retry', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');

    mockSafeAuth.mockResolvedValue({
      access_token: 'token-A-init',
      user: { id: 'usr-account-a' }
    });

    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-A-refreshed',
          user: { id: 'usr-account-a' }
        }
      },
      error: null
    });

    let retryConfigCaptured: any = null;
    let callCount = 0;

    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      callCount++;
      if (callCount === 1) {
        throw createAxios401Error(config);
      }
      retryConfigCaptured = config;
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config
      } as AxiosResponse;
    };

    await api.get('/verify-merge');

    expect(callCount).toBe(2);
    expect(retryConfigCaptured.__requestOwnerId).toBe('usr-account-a');
    expect(retryConfigCaptured.__is401Retry).toBe(true);
  });

  // =========================================================================
  // Case 9: Owner-Binding Integrity (Caller Cannot Forge Owner to Replay)
  // =========================================================================
  it('Case 9: Forged caller-supplied __requestOwnerId cannot bypass verification', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');

    mockSafeAuth.mockResolvedValue({
      access_token: 'token-A-init',
      user: { id: 'usr-account-a' }
    });

    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-A-refreshed',
          user: { id: 'usr-account-a' }
        }
      },
      error: null
    });

    const adapterCalls: any[] = [];
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      adapterCalls.push({ callIndex: adapterCalls.length + 1 });
      throw createAxios401Error(config);
    };

    // Caller attempts to inject a forged victim ID into config
    const callerConfig: any = { __requestOwnerId: 'forged-victim-id' };

    await expect(api.get('/exploit-attempt', callerConfig)).rejects.toThrow();

    // The refresh returned User A ('usr-account-a'), but requestOwner was 'forged-victim-id'.
    // ownerMatch failed because refreshedUserId !== requestOwnerId!
    // Result: Exploit blocked, retry aborted!
    expect(adapterCalls).toHaveLength(1);
  });

  // =========================================================================
  // Question A (Phase 101.50): Retry-Dispatch Race Audit
  // Sequence:
  // 1. User A request dispatched.
  // 2. 401 received.
  // 3. Refresh returns valid session for User A.
  // 4. Account identity changes before retry dispatch.
  // 5. Verify request cannot be dispatched using credentials inconsistent with original owner.
  // =========================================================================
  it('Question A: Account identity changes after refresh returns User A but before retry dispatch -> retry rejected', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');

    mockSafeAuth.mockResolvedValue({
      access_token: 'token-A-init',
      user: { id: 'usr-account-a' }
    });

    let refreshResolver: (val: any) => void = () => {};
    const deferredRefresh = new Promise((resolve) => {
      refreshResolver = resolve;
    });
    mockRefreshSession.mockImplementation(() => deferredRefresh);

    const adapterCalls: any[] = [];
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      adapterCalls.push({
        callIndex: adapterCalls.length + 1,
        url: config.url,
        auth: config.headers.Authorization,
        owner: (config as any).__requestOwnerId
      });
      throw createAxios401Error(config);
    };

    let caughtError: any = null;
    const reqPromise = api.get('/user-a-data').catch((err) => {
      caughtError = err;
      return 'rejected';
    });

    // Wait until 401 is received and refresh is in flight
    await new Promise((r) => setTimeout(r, 20));
    expect(adapterCalls).toHaveLength(1);
    expect(adapterCalls[0].auth).toBe('Bearer token-A-init');
    expect(adapterCalls[0].owner).toBe('usr-account-a');

    // Step 3 & 4: Refresh resolves with valid session for User A,
    // but simultaneously the active account in tab switches to User B!
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-b');
    refreshResolver({
      data: {
        session: {
          access_token: 'token-A-refreshed',
          user: { id: 'usr-account-a' }
        }
      },
      error: null
    });

    const res = await reqPromise;
    expect(res).toBe('rejected');
    expect(caughtError).toBeDefined();

    // Verification:
    // 1. Adapter invocation count is strictly 1 (no retry dispatched).
    // 2. Request was NOT dispatched using User B credentials or retried inconsistently.
    expect(adapterCalls).toHaveLength(1);
  });

  // =========================================================================
  // Question B1 (Phase 101.50): Concurrent In-Flight Requests with Different Owners
  // Shared refresh returns User A session -> User B request rejected; User A request rejected if active != A
  // =========================================================================
  it('Question B1: Concurrent requests with different owners; shared refresh returns User A -> cross-account request cannot retry', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));

    // Dynamic safeAuth based on current active account
    mockSafeAuth.mockImplementation(async () => {
      const activeId = sessionStorage.getItem('notestandard_active_account_id');
      if (activeId === 'usr-account-b') {
        return { access_token: 'token-B-init', user: { id: 'usr-account-b' } };
      }
      return { access_token: 'token-A-init', user: { id: 'usr-account-a' } };
    });

    let refreshResolve: (val: any) => void = () => {};
    const deferredRefresh = new Promise((resolve) => {
      refreshResolve = resolve;
    });

    mockRefreshSession.mockImplementation(() => deferredRefresh);

    const adapterCalls: any[] = [];
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      adapterCalls.push({
        callIndex: adapterCalls.length + 1,
        url: config.url,
        auth: config.headers.Authorization,
        owner: (config as any).__requestOwnerId
      });
      throw createAxios401Error(config);
    };

    // 1. Dispatch Request 1 as User A
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');
    let req1Error: any = null;
    const req1Promise = api.get('/req-user-a').catch((err) => {
      req1Error = err;
      return 'req1-rejected';
    });

    // Wait until Request 1 is in-flight
    await new Promise((r) => setTimeout(r, 10));

    // 2. Tab switches account to User B and dispatches Request 2
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-b');
    let req2Error: any = null;
    const req2Promise = api.get('/req-user-b').catch((err) => {
      req2Error = err;
      return 'req2-rejected';
    });

    // Wait until both requests are waiting on refresh
    await new Promise((r) => setTimeout(r, 20));
    expect(adapterCalls).toHaveLength(2);
    expect(adapterCalls[0].owner).toBe('usr-account-a');
    expect(adapterCalls[0].auth).toBe('Bearer token-A-init');
    expect(adapterCalls[1].owner).toBe('usr-account-b');
    expect(adapterCalls[1].auth).toBe('Bearer token-B-init');

    // 3. Shared refresh completes returning session for User A
    refreshResolve({
      data: {
        session: {
          access_token: 'token-A-refreshed',
          user: { id: 'usr-account-a' }
        }
      },
      error: null
    });

    const [r1, r2] = await Promise.all([req1Promise, req2Promise]);

    // Request 1: owner is usr-account-a, refreshed is usr-account-a, but current active is usr-account-b -> rejected!
    expect(r1).toBe('req1-rejected');
    expect(req1Error).toBeDefined();

    // Request 2: owner is usr-account-b, but refreshed is usr-account-a -> identity mismatch -> rejected!
    expect(r2).toBe('req2-rejected');
    expect(req2Error).toBeDefined();

    // Crucial assertion: Adapter call count remains exactly 2 (zero retries dispatched)
    expect(adapterCalls).toHaveLength(2);
  });

  // =========================================================================
  // Question B2 (Phase 101.50): Concurrent In-Flight Requests with Different Owners
  // Shared refresh returns User B session -> User A request rejected (no retry under B token); User B request retried successfully
  // =========================================================================
  it('Question B2: Concurrent requests with different owners; shared refresh returns User B -> User A rejected, User B retries with User B token', async () => {
    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));

    mockSafeAuth.mockImplementation(async () => {
      const activeId = sessionStorage.getItem('notestandard_active_account_id');
      if (activeId === 'usr-account-b') {
        return { access_token: 'token-B-init', user: { id: 'usr-account-b' } };
      }
      return { access_token: 'token-A-init', user: { id: 'usr-account-a' } };
    });

    let refreshResolve: (val: any) => void = () => {};
    const deferredRefresh = new Promise((resolve) => {
      refreshResolve = resolve;
    });

    mockRefreshSession.mockImplementation(() => deferredRefresh);

    const adapterCalls: any[] = [];
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      adapterCalls.push({
        callIndex: adapterCalls.length + 1,
        url: config.url,
        auth: config.headers.Authorization,
        owner: (config as any).__requestOwnerId,
        isRetry: (config as any).__is401Retry
      });

      // On retry call for User B, resolve with success
      if ((config as any).__is401Retry) {
        return {
          data: { success: true, user: (config as any).__requestOwnerId },
          status: 200,
          statusText: 'OK',
          headers: {},
          config
        };
      }

      throw createAxios401Error(config);
    };

    // 1. Dispatch Request 1 as User A
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-a');
    let req1Error: any = null;
    const req1Promise = api.get('/req-user-a').catch((err) => {
      req1Error = err;
      return 'req1-rejected';
    });

    await new Promise((r) => setTimeout(r, 10));

    // 2. Tab switches account to User B and dispatches Request 2
    sessionStorage.setItem('notestandard_active_account_id', 'usr-account-b');
    const req2Promise = api.get('/req-user-b');

    await new Promise((r) => setTimeout(r, 20));
    expect(adapterCalls).toHaveLength(2);

    // 3. Shared refresh returns User B session
    refreshResolve({
      data: {
        session: {
          access_token: 'token-B-refreshed',
          user: { id: 'usr-account-b' }
        }
      },
      error: null
    });

    const [r1, r2] = await Promise.all([
      req1Promise,
      req2Promise
    ]);

    // Request 1 (User A) is REJECTED because refreshed user (B) does NOT match request owner (A)
    expect(r1).toBe('req1-rejected');
    expect(req1Error).toBeDefined();

    // Request 2 (User B) SUCCEEDED on retry because owner (B) == refreshed user (B) == active user (B)
    expect(r2.data).toEqual({ success: true, user: 'usr-account-b' });

    // Assert adapter calls:
    // 1. Initial /req-user-a (owner: usr-account-a, auth: Bearer token-A-init)
    // 2. Initial /req-user-b (owner: usr-account-b, auth: Bearer token-B-init)
    // 3. Retry /req-user-b (owner: usr-account-b, auth: Bearer token-B-refreshed)
    // Total adapter calls = exactly 3. Request 1 was NEVER retried!
    expect(adapterCalls).toHaveLength(3);
    expect(adapterCalls[2].url).toBe('/req-user-b');
    expect(adapterCalls[2].owner).toBe('usr-account-b');
    expect(adapterCalls[2].auth).toBe('Bearer token-B-refreshed');
    expect(adapterCalls[2].isRetry).toBe(true);
  });
});
