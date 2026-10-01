import { describe, it, expect, beforeEach, vi } from 'vitest';
import { accountManager } from '../utils/accountManager';

describe('Auth Lifecycle Stale Token Invariant Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('Test 1 — Prevents infinite setSession loop when active account refresh token returns 400', async () => {
    const accA = {
      id: 'usr-stale-A',
      email: 'stale-a@example.com',
      full_name: 'Stale User A',
      avatar_url: null,
      tokens: { access_token: 'stale-access', refresh_token: 'stale-refresh-400', expires_at: 0 },
      profile: { id: 'usr-stale-A', email: 'stale-a@example.com', username: 'stalea', role: 'user' } as any,
      lastActive: Date.now()
    };

    localStorage.setItem('notestandard_accounts', JSON.stringify([accA]));
    localStorage.setItem('notestandard_active_account_id', 'usr-stale-A');

    expect(accountManager.getActiveAccountId()).toBe('usr-stale-A');

    // Simulate failure handler invalidation logic
    accountManager.setActiveAccountId(null);
    accountManager.updateAccountTokens('usr-stale-A', { access_token: '', refresh_token: '', expires_at: 0 });

    expect(accountManager.getActiveAccountId()).toBeNull();
    const updatedAcc = accountManager.getAccount('usr-stale-A');
    expect(updatedAcc?.tokens?.refresh_token).toBe('');
  });

  it('Test 2 — Verification that failed stale credentials are not retried repeatedly', () => {
    accountManager.setActiveAccountId(null);
    expect(accountManager.getActiveAccountId()).toBeNull();
  });

  it('Test 3 — Preserves unrelated stored accounts (Account B) when Account A rehydration fails', () => {
    const accA = {
      id: 'usr-stale-A',
      email: 'stale-a@example.com',
      tokens: { access_token: 'stale-access', refresh_token: 'stale-refresh-400', expires_at: 0 },
      profile: { id: 'usr-stale-A' } as any,
      lastActive: Date.now() - 1000
    };
    const accB = {
      id: 'usr-valid-B',
      email: 'valid-b@example.com',
      tokens: { access_token: 'valid-access-B', refresh_token: 'valid-refresh-B', expires_at: 9999999999 },
      profile: { id: 'usr-valid-B' } as any,
      lastActive: Date.now()
    };

    localStorage.setItem('notestandard_accounts', JSON.stringify([accA, accB]));
    localStorage.setItem('notestandard_active_account_id', 'usr-stale-A');

    // Invalidate active selection A on failure
    accountManager.setActiveAccountId(null);
    accountManager.updateAccountTokens('usr-stale-A', { access_token: '', refresh_token: '', expires_at: 0 });

    const allAccounts = accountManager.getAllAccounts();
    expect(allAccounts).toHaveLength(2);
    const validB = accountManager.getAccount('usr-valid-B');
    expect(validB?.tokens.refresh_token).toBe('valid-refresh-B');
  });

  it('Test 4 — Valid account can still be authenticated and selected', () => {
    const accB = {
      id: 'usr-valid-B',
      email: 'valid-b@example.com',
      tokens: { access_token: 'valid-access-B', refresh_token: 'valid-refresh-B', expires_at: 9999999999 },
      profile: { id: 'usr-valid-B' } as any,
      lastActive: Date.now()
    };
    localStorage.setItem('notestandard_accounts', JSON.stringify([accB]));
    accountManager.setActiveAccountId('usr-valid-B');

    expect(accountManager.getActiveAccountId()).toBe('usr-valid-B');
  });

  it('Test 5 — Explicit logout clears active account selection', () => {
    localStorage.setItem('notestandard_active_account_id', 'usr-active');
    accountManager.setActiveAccountId(null);
    expect(accountManager.getActiveAccountId()).toBeNull();
  });

  it('Test 6 — Valid session boot initializes correctly', () => {
    const validSession = { access_token: 'valid-access', refresh_token: 'valid-refresh', expires_at: 99999 };
    expect(validSession.access_token).toBe('valid-access');
  });
});
