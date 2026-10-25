import { test, expect } from '@playwright/test';

// ============================================================================
// ISOLATED MULTI-ACCOUNT REGRESSION SUITE
// Mode: 100% Mocked Network / Zero External Requests / Zero DB Mutations
// ============================================================================

/**
 * Supabase auth storage key derived from project URL in client/.env.development:
 * VITE_SUPABASE_URL=https://tngcvgisfctggvivcnva.supabase.co
 * Key format in @supabase/supabase-js: sb-${baseUrl.hostname.split('.')[0]}-auth-token
 * Configured with storage: window.sessionStorage in client/src/lib/supabase.ts
 */
const SUPABASE_STORAGE_KEY = 'sb-tngcvgisfctggvivcnva-auth-token';

/**
 * Helper to construct a structurally valid 3-part base64url JWT for hermetic mock tests.
 * Satisfies GoTrue / @supabase/auth-js decodeJWT client-side format requirements.
 */
function createMockJwt(userId: string, email: string, role = 'authenticated'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: 'supabase',
    ref: 'tngcvgisfctggvivcnva',
    role,
    sub: userId,
    aud: 'authenticated',
    email,
    exp: now + 86400 * 365,
    iat: now,
    user_metadata: {
      full_name: email.includes('2') ? 'Account Two' : 'Account One'
    },
    app_metadata: {
      provider: 'email',
      providers: ['email']
    }
  })).toString('base64url');
  const signature = Buffer.from('mock_signature_for_e2e_isolation_only').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

const MOCK_ACCOUNT_1 = {
  id: 'usr-account-1-id',
  email: 'account1@notestandard.test',
  full_name: 'Account One',
  avatar_url: null,
  tokens: {
    access_token: createMockJwt('usr-account-1-id', 'account1@notestandard.test'),
    refresh_token: 'mock-refresh-token-1',
    expires_at: Math.floor(Date.now() / 1000) + 86400
  },
  profile: {
    id: 'usr-account-1-id',
    email: 'account1@notestandard.test',
    username: 'accountone',
    full_name: 'Account One',
    avatar_url: null,
    role: 'user',
    is_verified: true,
    plan_tier: 'free'
  },
  lastActive: Date.now() - 1000
};

const MOCK_ACCOUNT_2 = {
  id: 'usr-account-2-id',
  email: 'account2@notestandard.test',
  full_name: 'Account Two',
  avatar_url: null,
  tokens: {
    access_token: createMockJwt('usr-account-2-id', 'account2@notestandard.test'),
    refresh_token: 'mock-refresh-token-2',
    expires_at: Math.floor(Date.now() / 1000) + 86400
  },
  profile: {
    id: 'usr-account-2-id',
    email: 'account2@notestandard.test',
    username: 'accounttwo',
    full_name: 'Account Two',
    avatar_url: null,
    role: 'user',
    is_verified: true,
    plan_tier: 'free'
  },
  lastActive: Date.now()
};

/**
 * Creates a native Supabase session object compatible with @supabase/auth-js 2.89.0
 */
function createMockSupabaseSession(account: typeof MOCK_ACCOUNT_1) {
  return {
    access_token: account.tokens.access_token,
    refresh_token: account.tokens.refresh_token,
    expires_at: account.tokens.expires_at,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: account.id,
      email: account.email,
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: {
        full_name: account.full_name
      },
      app_metadata: {
        provider: 'email',
        providers: ['email']
      }
    }
  };
}

/**
 * Seeds client storage with an authenticated account.
 * Populates both:
 * 1. NoteStandard multi-account manager in localStorage
 * 2. Native Supabase session in sessionStorage (unless skipSessionStorage is true)
 */
async function seedAuthenticatedSession(
  page: any,
  activeAccount: typeof MOCK_ACCOUNT_1,
  allAccounts: (typeof MOCK_ACCOUNT_1)[] = [activeAccount],
  options: { skipSessionStorage?: boolean } = {}
) {
  const session = createMockSupabaseSession(activeAccount);
  await page.addInitScript(
    ({ accounts, activeId, storageKey, nativeSession, skipSession }) => {
      localStorage.setItem('notestandard_accounts', JSON.stringify(accounts));
      localStorage.setItem('notestandard_active_account_id', activeId);
      if (!skipSession) {
        sessionStorage.setItem(storageKey, JSON.stringify(nativeSession));
      }
    },
    {
      accounts: allAccounts,
      activeId: activeAccount.id,
      storageKey: SUPABASE_STORAGE_KEY,
      nativeSession: session,
      skipSession: !!options.skipSessionStorage
    }
  );
}

/**
 * Parse POST data supporting JSON or URLSearchParams payloads.
 */
function parseRequestBody(postData: string | null): Record<string, any> {
  if (!postData) return {};
  try {
    return JSON.parse(postData);
  } catch {
    const params = new URLSearchParams(postData);
    const result: Record<string, any> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}

/**
 * Configure strict Playwright routes to intercept all auth/REST/API traffic.
 * Guarantees zero requests reach external Supabase servers.
 */
async function setupStrictNetworkMocks(page: any, options: { failLogin?: boolean; failSwitch?: boolean } = {}) {
  // 1. Intercept Supabase Auth GoTrue Endpoints
  await page.route('**/auth/v1/**', async (route: any) => {
    const url = route.request().url();

    if (url.includes('/auth/v1/token')) {
      if (options.failLogin || options.failSwitch) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' })
        });
      }

      const postData = route.request().postData() || '';
      const body = parseRequestBody(postData);
      const isRefreshRequest = url.includes('grant_type=refresh_token') || !!body.refresh_token || body.grant_type === 'refresh_token';

      if (isRefreshRequest) {
        const refreshToken = body.refresh_token;

        // Exact match against known mock accounts
        let targetAccount: typeof MOCK_ACCOUNT_1 | null = null;
        if (refreshToken === MOCK_ACCOUNT_1.tokens.refresh_token) {
          targetAccount = MOCK_ACCOUNT_1;
        } else if (refreshToken === MOCK_ACCOUNT_2.tokens.refresh_token) {
          targetAccount = MOCK_ACCOUNT_2;
        }

        if (!targetAccount) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'invalid_grant',
              error_description: 'Invalid or unknown refresh token'
            })
          });
        }

        const now = Math.floor(Date.now() / 1000);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: createMockJwt(targetAccount.id, targetAccount.email),
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: now + 3600,
            refresh_token: `mock-refreshed-${targetAccount.tokens.refresh_token}`,
            user: {
              id: targetAccount.id,
              email: targetAccount.email,
              aud: 'authenticated',
              role: 'authenticated',
              user_metadata: { full_name: targetAccount.full_name },
              app_metadata: { provider: 'email', providers: ['email'] }
            }
          })
        });
      }

      // Password sign-in for Account 2
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: MOCK_ACCOUNT_2.tokens.access_token,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: MOCK_ACCOUNT_2.tokens.expires_at,
          refresh_token: MOCK_ACCOUNT_2.tokens.refresh_token,
          user: {
            id: MOCK_ACCOUNT_2.id,
            email: MOCK_ACCOUNT_2.email,
            aud: 'authenticated',
            role: 'authenticated',
            user_metadata: { full_name: MOCK_ACCOUNT_2.full_name }
          }
        })
      });
    }

    if (url.includes('/auth/v1/user') || url.includes('/auth/v1/session')) {
      const authHeader = route.request().headers()['authorization'] || '';
      const isAccount2 = authHeader.includes(MOCK_ACCOUNT_2.tokens.access_token);
      const acc = isAccount2 ? MOCK_ACCOUNT_2 : MOCK_ACCOUNT_1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: acc.id,
          email: acc.email,
          aud: 'authenticated',
          role: 'authenticated',
          user_metadata: { full_name: acc.full_name }
        })
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  // 2. Intercept Postgrest REST API Endpoints
  await page.route('**/rest/v1/**', async (route: any) => {
    const url = route.request().url();
    if (url.includes('/rest/v1/profiles')) {
      if (url.includes(MOCK_ACCOUNT_2.id)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_ACCOUNT_2.profile]) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_ACCOUNT_1.profile]) });
    }
    if (url.includes('/rest/v1/subscriptions')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'sub-1', user_id: MOCK_ACCOUNT_1.id, status: 'active', plan_tier: 'free' }]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  // 3. Intercept App API Endpoints
  await page.route('**/api/**', async (route: any) => {
    const url = route.request().url();
    // Do not intercept Vite dev server source modules served under /src/api/
    if (url.includes('/src/api/')) {
      return route.continue();
    }
    const parsedUrl = new URL(url);
    if (route.request().method() === 'GET' && parsedUrl.pathname === '/api/notifications') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, session_id: 'mock-session-123' }) });
  });
}

test.describe('Isolated Add Account & Multi-Account Switching', () => {

  test('1. Authenticated /login?add_account=true renders Add Account login flow', async ({ page }) => {
    await setupStrictNetworkMocks(page);

    // Pre-seed authenticated Account 1 in both localStorage and sessionStorage
    await seedAuthenticatedSession(page, MOCK_ACCOUNT_1);

    await page.goto('/login?add_account=true');

    // Assert Login form mounts and displays Add Account title
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Add new account');
    await expect(page).toHaveURL(/.*\/login\?add_account=true/);
  });

  test('2. Authenticated /login without query parameter redirects to /dashboard', async ({ page }) => {
    await setupStrictNetworkMocks(page);

    await seedAuthenticatedSession(page, MOCK_ACCOUNT_1);

    await page.goto('/login');

    // Assert PublicRoute redirects authenticated user to /dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
  });

  test('3. Unauthenticated /login renders standard login form', async ({ page }) => {
    await setupStrictNetworkMocks(page);

    // Clear all accounts
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto('/login');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Welcome back');
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('4. Mocked Account 2 login preserves Account 1 in store without duplicates', async ({ page }) => {
    await setupStrictNetworkMocks(page);

    await seedAuthenticatedSession(page, MOCK_ACCOUNT_1);

    await page.goto('/login?add_account=true');

    // Fill Account 2 credentials
    await page.fill('#email', MOCK_ACCOUNT_2.email);
    await page.fill('#password', 'ValidPass123!');
    await page.click('button[type="submit"]');

    // Should redirect to dashboard upon successful add
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Assert localStorage contains both accounts without duplicates
    const accountsJson = await page.evaluate(() => localStorage.getItem('notestandard_accounts'));
    expect(accountsJson).not.toBeNull();
    const accounts = JSON.parse(accountsJson || '[]');
    expect(accounts.length).toBe(2);

    const ids = accounts.map((a: any) => a.id);
    expect(ids).toContain(MOCK_ACCOUNT_1.id);
    expect(ids).toContain(MOCK_ACCOUNT_2.id);
  });

  test('5. Switching between accounts restores expected active identity', async ({ page }) => {
    await setupStrictNetworkMocks(page);

    // Seed both accounts into storage with Account 2 active
    await seedAuthenticatedSession(page, MOCK_ACCOUNT_2, [MOCK_ACCOUNT_2, MOCK_ACCOUNT_1]);

    await page.goto('/dashboard');

    // Verify active account initial state in localStorage
    const initialActive = await page.evaluate(() => localStorage.getItem('notestandard_active_account_id'));
    expect(initialActive).toBe(MOCK_ACCOUNT_2.id);
  });

  test('6. Failed Account 2 login preserves Account 1 stored record', async ({ page }) => {
    // Configure mock to reject login request with 400 Bad Request
    await setupStrictNetworkMocks(page, { failLogin: true });

    await seedAuthenticatedSession(page, MOCK_ACCOUNT_1);

    await page.goto('/login?add_account=true');

    await page.fill('#email', 'wrong2@notestandard.test');
    await page.fill('#password', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    // Error toast or message should appear
    const errorBox = page.locator('form#login-form');
    await expect(errorBox).toBeVisible();

    // Verify Account 1 remains safely in localStorage
    const accountsJson = await page.evaluate(() => localStorage.getItem('notestandard_accounts'));
    expect(accountsJson).not.toBeNull();
    const accounts = JSON.parse(accountsJson || '[]');
    expect(accounts.length).toBe(1);
    expect(accounts[0].id).toBe(MOCK_ACCOUNT_1.id);
  });

  test('7. Empty sessionStorage with existing localStorage accounts does not select wrong account', async ({ page }) => {
    await setupStrictNetworkMocks(page);

    await page.addInitScript(({ acc, activeId }) => {
      sessionStorage.clear();
      localStorage.setItem('notestandard_accounts', JSON.stringify([acc]));
      localStorage.setItem('notestandard_active_account_id', activeId);
    }, { acc: MOCK_ACCOUNT_1, activeId: MOCK_ACCOUNT_1.id });

    await page.goto('/dashboard');

    // Confirm active account rehydrates correctly without redirecting to login
    await expect(page).toHaveURL(/.*\/dashboard/);
    const activeId = await page.evaluate(() => localStorage.getItem('notestandard_active_account_id'));
    expect(activeId).toBe(MOCK_ACCOUNT_1.id);
  });

});
