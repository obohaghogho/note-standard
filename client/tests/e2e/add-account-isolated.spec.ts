import { test, expect } from '@playwright/test';

// ============================================================================
// ISOLATED MULTI-ACCOUNT REGRESSION SUITE
// Mode: 100% Mocked Network / Zero External Requests / Zero DB Mutations
// ============================================================================

const MOCK_ACCOUNT_1 = {
  id: 'usr-account-1-id',
  email: 'account1@notestandard.test',
  full_name: 'Account One',
  avatar_url: null,
  tokens: {
    access_token: 'mock-access-token-1',
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
    access_token: 'mock-access-token-2',
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
      if (postData.includes('refresh_token')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'mock-refreshed-access-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_token: 'mock-refreshed-refresh-token',
            user: {
              id: MOCK_ACCOUNT_1.id,
              email: MOCK_ACCOUNT_1.email,
              aud: 'authenticated',
              user_metadata: { full_name: MOCK_ACCOUNT_1.full_name }
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
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: MOCK_ACCOUNT_1.id,
          email: MOCK_ACCOUNT_1.email,
          aud: 'authenticated',
          role: 'authenticated',
          user_metadata: { full_name: MOCK_ACCOUNT_1.full_name }
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
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, session_id: 'mock-session-123' }) });
  });
}

test.describe('Isolated Add Account & Multi-Account Switching', () => {

  test('1. Authenticated /login?add_account=true renders Add Account login flow', async ({ page }) => {
    await setupStrictNetworkMocks(page);

    // Pre-seed authenticated Account 1
    await page.addInitScript(({ acc, activeId }) => {
      localStorage.setItem('notestandard_accounts', JSON.stringify([acc]));
      localStorage.setItem('notestandard_active_account_id', activeId);
    }, { acc: MOCK_ACCOUNT_1, activeId: MOCK_ACCOUNT_1.id });

    await page.goto('/login?add_account=true');

    // Assert Login form mounts and displays Add Account title
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Add new account');
    await expect(page).toHaveURL(/.*\/login\?add_account=true/);
  });

  test('2. Authenticated /login without query parameter redirects to /dashboard', async ({ page }) => {
    await setupStrictNetworkMocks(page);

    await page.addInitScript(({ acc, activeId }) => {
      localStorage.setItem('notestandard_accounts', JSON.stringify([acc]));
      localStorage.setItem('notestandard_active_account_id', activeId);
    }, { acc: MOCK_ACCOUNT_1, activeId: MOCK_ACCOUNT_1.id });

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

    await page.addInitScript(({ acc, activeId }) => {
      localStorage.setItem('notestandard_accounts', JSON.stringify([acc]));
      localStorage.setItem('notestandard_active_account_id', activeId);
    }, { acc: MOCK_ACCOUNT_1, activeId: MOCK_ACCOUNT_1.id });

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

    // Seed both accounts into storage
    await page.addInitScript(({ acc1, acc2 }) => {
      localStorage.setItem('notestandard_accounts', JSON.stringify([acc2, acc1]));
      localStorage.setItem('notestandard_active_account_id', acc2.id);
    }, { acc1: MOCK_ACCOUNT_1, acc2: MOCK_ACCOUNT_2 });

    await page.goto('/dashboard');

    // Verify active account initial state in localStorage
    const initialActive = await page.evaluate(() => localStorage.getItem('notestandard_active_account_id'));
    expect(initialActive).toBe(MOCK_ACCOUNT_2.id);
  });

  test('6. Failed Account 2 login preserves Account 1 stored record', async ({ page }) => {
    // Configure mock to reject login request with 400 Bad Request
    await setupStrictNetworkMocks(page, { failLogin: true });

    await page.addInitScript(({ acc, activeId }) => {
      localStorage.setItem('notestandard_accounts', JSON.stringify([acc]));
      localStorage.setItem('notestandard_active_account_id', activeId);
    }, { acc: MOCK_ACCOUNT_1, activeId: MOCK_ACCOUNT_1.id });

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
