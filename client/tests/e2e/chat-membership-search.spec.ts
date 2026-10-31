import { test, expect, BrowserContext, Page } from '@playwright/test';

// ============================================================================
// PHASE 102.58: HERMETIC CHAT MEMBERSHIP & SEARCH REGRESSION TEST SUITE (REPAIRED)
//
// Coverage:
// - Scenario A: HTTP 403 membership rejection error handling & selection clearance
// - Scenario B: HTTP 400 bad request error isolation & sidebar self-healing
// - Scenario C: Search response shape normalization (array, container, malformed)
// - Scenario D: Deterministic asynchronous search response race-condition observation
//
// Hermeticity Policy:
// - All loopback application assets (Vite) are passed to local dev/preview server.
// - All backend API, auth, and database endpoints are mocked with synthetic fixtures.
// - Third-party CDN / font requests are cleanly stubbed or blocked.
// - Unintended egress is aborted with 'blockedbyclient' and recorded in audit.
//
// NOTE: These mocked tests verify client UI resilience, state recovery, and
// response-shape normalization. They do NOT claim to prove live PostgreSQL RLS
// or database-layer authorization.
// ============================================================================

const SUPABASE_STORAGE_KEY = 'sb-tngcvgisfctggvivcnva-auth-token';

function createMockJwt(userId: string, email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: 'supabase',
    ref: 'tngcvgisfctggvivcnva',
    role: 'authenticated',
    sub: userId,
    aud: 'authenticated',
    email,
    exp: now + 86400 * 365,
    iat: now,
    user_metadata: { full_name: 'Test Account' },
    app_metadata: { provider: 'email', providers: ['email'] }
  })).toString('base64url');
  const signature = Buffer.from('mock_signature_for_e2e_isolation_only').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

const TEST_ACCOUNT = {
  id: 'usr-test-account-id',
  email: 'test-user@notestandard.test',
  full_name: 'Test Account',
  avatar_url: null,
  tokens: {
    access_token: createMockJwt('usr-test-account-id', 'test-user@notestandard.test'),
    refresh_token: 'mock-refresh-token-test',
    expires_at: Math.floor(Date.now() / 1000) + 86400
  },
  profile: {
    id: 'usr-test-account-id',
    email: 'test-user@notestandard.test',
    username: 'testaccount',
    full_name: 'Test Account',
    avatar_url: null,
    role: 'user',
    is_verified: true,
    plan_tier: 'free'
  },
  lastActive: Date.now()
};

const AUTHORIZED_CONV_ID = 'conv-authorized-valid-1';
const UNAUTHORIZED_CONV_ID = 'conv-unauthorized-403';
const INVALID_CONV_ID = 'conv-invalid-400';

const VALID_CONVERSATION = {
  id: AUTHORIZED_CONV_ID,
  type: 'direct',
  name: 'Authorized Team Chat',
  updated_at: new Date().toISOString(),
  unread_count: 0,
  unreadCount: 0,
  members: [{ user_id: TEST_ACCOUNT.id, profile: TEST_ACCOUNT.profile }],
  lastMessage: {
    id: 'msg-valid-1',
    content: 'Welcome to the authorized chat channel',
    sender_id: TEST_ACCOUNT.id,
    created_at: new Date().toISOString(),
    type: 'text'
  }
};

const AUTHORIZED_CONV_ID_2 = 'conv-authorized-valid-2';

const VALID_CONVERSATION_2 = {
  id: AUTHORIZED_CONV_ID_2,
  type: 'direct',
  name: 'Second Authorized Chat',
  updated_at: new Date().toISOString(),
  unread_count: 0,
  unreadCount: 0,
  members: [{ user_id: TEST_ACCOUNT.id, profile: TEST_ACCOUNT.profile }],
  lastMessage: {
    id: 'msg-valid-2',
    content: 'Welcome to the second authorized channel',
    sender_id: TEST_ACCOUNT.id,
    created_at: new Date().toISOString(),
    type: 'text'
  }
};

const ALLOWED_LOOPBACK_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
]);

interface NetworkAudit {
  allowedLoopback: string[];
  handledMocks: string[];
  benignThirdPartyBlocked: string[];
  unintendedEgressBlocked: string[];
}

/**
 * Installs hermetic route interception across all pages in the given BrowserContext.
 * Fails closed on any unexpected external network destination.
 */
async function setupHermeticContext(context: BrowserContext): Promise<NetworkAudit> {
  const audit: NetworkAudit = {
    allowedLoopback: [],
    handledMocks: [],
    benignThirdPartyBlocked: [],
    unintendedEgressBlocked: []
  };

  // Intercept and close context WebSockets hermetically
  await context.routeWebSocket(/.*/, async (ws) => {
    const wsUrl = ws.url();
    audit.benignThirdPartyBlocked.push(wsUrl);
    await ws.close({ code: 1008, reason: 'Hermetic context: external WebSocket blocked' });
  });

  await context.route('**', async (route) => {
    const req = route.request();
    const url = req.url();
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      audit.unintendedEgressBlocked.push(url);
      return route.abort('blockedbyclient');
    }

    // 1. Loopback web server assets (Vite dev 5173 / preview 4173)
    if (ALLOWED_LOOPBACK_ORIGINS.has(parsed.origin)) {
      audit.allowedLoopback.push(url);
      return route.continue();
    }

    // 2. Mock: Conversation listing & single conversation metadata
    const normPath = parsed.pathname.replace(/^\/api/, '');
    if (normPath === '/chat/conversations' || normPath === '/chat/conversations/') {
      audit.handledMocks.push(url);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([VALID_CONVERSATION, VALID_CONVERSATION_2])
      });
    }

    if (normPath === `/chat/conversations/${AUTHORIZED_CONV_ID}`) {
      audit.handledMocks.push(url);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VALID_CONVERSATION)
      });
    }

    if (normPath === `/chat/conversations/${AUTHORIZED_CONV_ID_2}`) {
      audit.handledMocks.push(url);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VALID_CONVERSATION_2)
      });
    }

    if (normPath === `/chat/conversations/${AUTHORIZED_CONV_ID_2}/messages`) {
      audit.handledMocks.push(url);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([VALID_CONVERSATION_2.lastMessage])
      });
    }

    if (normPath === `/chat/conversations/${UNAUTHORIZED_CONV_ID}`) {
      audit.handledMocks.push(url);
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Access denied or conversation not found' })
      });
    }

    if (normPath === `/chat/conversations/${INVALID_CONV_ID}`) {
      audit.handledMocks.push(url);
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Conversation not found' })
      });
    }

    if (req.method() === 'PUT' && (
      normPath === `/chat/conversations/${AUTHORIZED_CONV_ID}/read` ||
      normPath === `/chat/conversations/${AUTHORIZED_CONV_ID_2}/read` ||
      normPath === `/chat/conversations/${UNAUTHORIZED_CONV_ID}/read` ||
      normPath === `/chat/conversations/${INVALID_CONV_ID}/read`
    )) {
      audit.handledMocks.push(url);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    }

    // 3. Mock: Supabase Auth GoTrue Endpoints
    if (url.includes('/auth/v1/')) {
      audit.handledMocks.push(url);
      if (url.includes('/auth/v1/token') || url.includes('/auth/v1/user') || url.includes('/auth/v1/session')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: TEST_ACCOUNT.tokens.access_token,
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_token: TEST_ACCOUNT.tokens.refresh_token,
            user: {
              id: TEST_ACCOUNT.id,
              email: TEST_ACCOUNT.email,
              aud: 'authenticated',
              role: 'authenticated',
              user_metadata: { full_name: TEST_ACCOUNT.full_name },
              app_metadata: { provider: 'email', providers: ['email'] }
            }
          })
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    }

    // 4. Mock: Supabase PostgREST endpoints
    if (url.includes('/rest/v1/')) {
      audit.handledMocks.push(url);
      if (url.includes('/rest/v1/profiles')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_ACCOUNT.profile) });
      }
      if (url.includes('/rest/v1/subscriptions')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'sub-1', user_id: TEST_ACCOUNT.id, status: 'active', plan_tier: 'free' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }

    // 5. Common app background endpoints
    if (url.includes('/api/notifications')) {
      audit.handledMocks.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/status/')) {
      audit.handledMocks.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/version/check')) {
      audit.handledMocks.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '1.8.5', upToDate: true }) });
    }

    // 5b. Ancillary Authenticated Background Endpoints
    if (url.includes('/api/wallet/transactions')) {
      audit.handledMocks.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/wallet')) {
      audit.handledMocks.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/session/register')) {
      audit.handledMocks.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session_id: 'mock-chat-session-id' }) });
    }
    if (url.includes('/api/auth/register-session')) {
      audit.handledMocks.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }
    if (url.includes('/api/ads')) {
      audit.handledMocks.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }

    // 5c. Notes Dashboard API Endpoints (Invoked by NotesDashboardContext upon successful auth initialization)
    if (url.includes('/api/dashboard/notes/layout')) {
      audit.handledMocks.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/dashboard/notes/stats')) {
      audit.handledMocks.push(url);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 0,
          favorites: 0,
          pinned: 0,
          archived: 0,
          checklists: 0,
          voice: 0,
          image: 0,
          shared: 0,
          attachments_count: 0,
          attachments_size: 0
        })
      });
    }
    if (url.includes('/api/dashboard/notes/recent')) {
      audit.handledMocks.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/dashboard/notes/categories')) {
      audit.handledMocks.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/dashboard/notes/activity')) {
      audit.handledMocks.push(url);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ timeline: [], chart: [] })
      });
    }
    if (url.includes('/api/dashboard/notes/suggestions')) {
      audit.handledMocks.push(url);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ suggestions: [], streak: 0 })
      });
    }

    // 6. External CDN / fonts (satisfy locally or stub to prevent hang)
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
      audit.benignThirdPartyBlocked.push(url);
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    }
    if (url.includes('dicebear.com')) {
      audit.benignThirdPartyBlocked.push(url);
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
    }

    // 7. Hermetic Egress Guard: abort any unexpected external request
    audit.unintendedEgressBlocked.push(url);
    console.warn(`[HERMETIC_GUARD] Blocked unintended external request: ${url}`);
    return route.abort('blockedbyclient');
  });

  return audit;
}

/**
 * Seeds client storage before page initialization with tab-scoped tokens.
 */
async function seedTabSession(page: Page) {
  const session = {
    access_token: TEST_ACCOUNT.tokens.access_token,
    refresh_token: TEST_ACCOUNT.tokens.refresh_token,
    expires_at: TEST_ACCOUNT.tokens.expires_at,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: TEST_ACCOUNT.id,
      email: TEST_ACCOUNT.email,
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: { full_name: TEST_ACCOUNT.full_name },
      app_metadata: { provider: 'email', providers: ['email'] }
    }
  };

  await page.addInitScript(
    ({ account, storageKey, nativeSession }) => {
      localStorage.setItem('notestandard_accounts', JSON.stringify([account]));
      localStorage.setItem('notestandard_active_account_id', account.id);

      sessionStorage.setItem('notestandard_active_account_id', account.id);
      sessionStorage.setItem('token', account.tokens.access_token);
      sessionStorage.setItem(storageKey, JSON.stringify(nativeSession));

      // Hermetic WebSocket Stub
      window.WebSocket = class HermeticWebSocket extends EventTarget {
        readyState = 1;
        url: string;
        constructor(u: string) {
          super();
          this.url = u;
          setTimeout(() => this.dispatchEvent(new Event('open')), 0);
        }
        send() {}
        close() {
          this.readyState = 3;
          this.dispatchEvent(new Event('close'));
        }
      } as any;
    },
    {
      account: TEST_ACCOUNT,
      storageKey: SUPABASE_STORAGE_KEY,
      nativeSession: session
    }
  );
}

// ============================================================================
// TEST SUITE: PHASE 102.58
// ============================================================================

test.describe('Phase 102.58: Hermetic Chat Membership & Search Behavior', () => {

  test('Scenario A: Conversation membership rejection (HTTP 403) clears selection and shows fallback', async ({ browser }) => {
    test.slow();
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const audit = await setupHermeticContext(context);

    // Provide messages mock for background preloader on authorized conversation
    await context.route(new RegExp(`/chat/conversations/${AUTHORIZED_CONV_ID}/messages$`), async (route) => {
      audit.handledMocks.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([VALID_CONVERSATION.lastMessage])
      });
    });

    let forbiddenRouteHitCount = 0;

    // Mock 403 on unauthorized conversation access
    await context.route(new RegExp(`/chat/conversations/${UNAUTHORIZED_CONV_ID}(/messages)?$`), async (route) => {
      if (route.request().method() === 'GET') {
        forbiddenRouteHitCount++;
        audit.handledMocks.push(route.request().url());
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Access denied or conversation not found' })
        });
      }
      return route.fallback();
    });

    const page = await context.newPage();
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await seedTabSession(page);

    // Mount chat directly attempting to load unauthorized conversation
    await page.goto(`/dashboard/chat?id=${UNAUTHORIZED_CONV_ID}`, { waitUntil: 'domcontentloaded' });

    // Wait for authentication readiness (cold-start module compilation settlement)
    await expect(page.locator('text=Test Account')).toBeVisible({ timeout: 60000 });

    // Assert: The specific mocked 403 handler was dispatched and received
    await expect.poll(() => forbiddenRouteHitCount, { timeout: 30000 }).toBeGreaterThan(0);

    // Assert: ChatContext catches 403, clears active conversation, and removes ?id from URL
    await expect(page).not.toHaveURL(new RegExp(`[?&]id=${UNAUTHORIZED_CONV_ID}`), { timeout: 10000 });

    // Assert: UI renders safe empty state instead of unauthorized messages
    const emptyStatePrompt = page.locator('text=Select a conversation to start chatting');
    await expect(emptyStatePrompt).toBeVisible({ timeout: 10000 });

    // Assert: No unhandled runtime page errors occurred
    expect(pageErrors).toEqual([]);

    // Assert: Zero unintended external egress leaks
    expect(audit.unintendedEgressBlocked).toEqual([]);

    await context.close();
  });

  test('Scenario B: Invalid conversation request (HTTP 400) fails closed without unhandled crash and allows sidebar recovery', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const audit = await setupHermeticContext(context);

    let invalidRouteHitCount = 0;

    // Mock 400 on malformed/missing conversation request
    await context.route(new RegExp(`/chat/conversations/${INVALID_CONV_ID}/messages`), async (route) => {
      invalidRouteHitCount++;
      audit.handledMocks.push(route.request().url());
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Missing conversationId' })
      });
    });

    // Provide messages for the authorized conversation for sidebar recovery
    await context.route(new RegExp(`/chat/conversations/${AUTHORIZED_CONV_ID}/messages`), async (route) => {
      audit.handledMocks.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([VALID_CONVERSATION.lastMessage])
      });
    });

    const page = await context.newPage();
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await seedTabSession(page);

    // Mount chat requesting the invalid conversation
    await page.goto(`/dashboard/chat?id=${INVALID_CONV_ID}`, { waitUntil: 'domcontentloaded' });

    // Assert: The mocked 400 endpoint handler was invoked
    await expect.poll(() => invalidRouteHitCount, { timeout: 10000 }).toBeGreaterThan(0);

    // Assert: No messages are rendered as successful
    const messageItem = page.locator('.chat-message-bubble');
    await expect(messageItem).toHaveCount(0);

    // Assert: No unhandled page exceptions occurred during the 400 error rejection
    expect(pageErrors).toEqual([]);

    // Assert: Sidebar remains interactive and allows self-healing to a valid conversation
    const validConvSidebarItem = page.locator('text=Authorized Team Chat');
    await expect(validConvSidebarItem).toBeVisible({ timeout: 10000 });
    await validConvSidebarItem.click();

    // Assert: Clicking valid conversation loads its messages cleanly
    await expect(page.locator('#msg-msg-valid-1')).toContainText('Welcome to the authorized chat channel', { timeout: 10000 });

    // Assert: Zero unintended external egress leaks
    expect(audit.unintendedEgressBlocked).toEqual([]);

    await context.close();
  });

  test('Scenario C: Search response shapes normalize correctly with distinguishable queries', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const audit = await setupHermeticContext(context);

    // Provide messages for the authorized conversation
    await context.route(new RegExp(`/chat/conversations/${AUTHORIZED_CONV_ID}/messages`), async (route) => {
      audit.handledMocks.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([VALID_CONVERSATION.lastMessage])
      });
    });

    const interceptedQueries: { query: string; shape: string }[] = [];

    // Mock search responses dynamically covering array, object container, and malformed container
    await context.route(new RegExp(`/api/chat/conversations/${AUTHORIZED_CONV_ID}/search`), async (route) => {
      const url = route.request().url();
      audit.handledMocks.push(url);

      if (url.includes('q=legacy')) {
        interceptedQueries.push({ query: 'legacy', shape: 'array' });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'search-msg-legacy',
            conversation_id: AUTHORIZED_CONV_ID,
            sender_id: TEST_ACCOUNT.id,
            content: 'Legacy array search match item',
            created_at: new Date().toISOString()
          }])
        });
      } else if (url.includes('q=modern')) {
        interceptedQueries.push({ query: 'modern', shape: 'container' });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            query: 'modern',
            total: 1,
            messages: [{
              id: 'search-msg-modern',
              conversation_id: AUTHORIZED_CONV_ID,
              sender_id: TEST_ACCOUNT.id,
              content: 'Modern container search match item',
              created_at: new Date().toISOString()
            }]
          })
        });
      } else if (url.includes('q=malformed')) {
        interceptedQueries.push({ query: 'malformed', shape: 'malformed' });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            messages: 'invalid string payload instead of message array'
          })
        });
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    const page = await context.newPage();
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await seedTabSession(page);

    await page.goto(`/dashboard/chat?id=${AUTHORIZED_CONV_ID}`, { waitUntil: 'domcontentloaded' });

    // 1. Verify authorized chat is rendered
    const chatHeader = page.locator('.chat-header');
    await expect(chatHeader).toBeVisible({ timeout: 10000 });

    // 2. Locate and verify chat-specific search control in header
    const searchOpenBtn = chatHeader.locator('button:has(svg.lucide-search)');
    await expect(searchOpenBtn).toBeVisible({ timeout: 10000 });

    // 3. Click chat-specific search control
    await searchOpenBtn.click();

    // 4. Verify chat search input becomes visible
    const searchInput = page.locator('#chat-search-messages, input[placeholder="Search..."]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // ── Case 1: Legacy Message[] array query ─────────────────────────────────
    await searchInput.fill('legacy');
    await expect(page.locator('text=Legacy array search match item')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Search Results (1)')).toBeVisible();

    // Reset input and verify previous results disappear before next query
    await searchInput.fill('');
    await expect(page.locator('text=Legacy array search match item')).toBeHidden({ timeout: 5000 });

    // ── Case 2: Modern { success: true, messages: [...] } query ──────────────
    await searchInput.fill('modern');
    await expect(page.locator('text=Modern container search match item')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Search Results (1)')).toBeVisible();

    // Reset input and verify previous results disappear before next query
    await searchInput.fill('');
    await expect(page.locator('text=Modern container search match item')).toBeHidden({ timeout: 5000 });

    // ── Case 3: Malformed payload query ─────────────────────────────────────
    await searchInput.fill('malformed');
    // Normalizer must safely return [] without unhandled exception (.map is not a function)
    await expect(page.locator('text=No messages found matching "malformed"')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Search Results (0)')).toBeVisible();

    // Verify all 3 query shapes were intercepted
    expect(interceptedQueries.map(q => q.query)).toEqual(['legacy', 'modern', 'malformed']);

    // Verify no unhandled exceptions occurred
    expect(pageErrors).toEqual([]);

    // Assert: Zero unintended external egress leaks
    expect(audit.unintendedEgressBlocked).toEqual([]);

    await context.close();
  });

  test('Scenario D: Deterministic asynchronous search race protection and lifecycle invalidation', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const audit = await setupHermeticContext(context);

    // Provide messages for the authorized conversation
    await context.route(new RegExp(`/chat/conversations/${AUTHORIZED_CONV_ID}/messages`), async (route) => {
      audit.handledMocks.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([VALID_CONVERSATION.lastMessage])
      });
    });

    // Provide messages for second authorized conversation
    await context.route(new RegExp(`/chat/conversations/${AUTHORIZED_CONV_ID_2}/messages`), async (route) => {
      audit.handledMocks.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([VALID_CONVERSATION_2.lastMessage])
      });
    });

    // =========================================================================
    // Deterministic Request & Response Gates for All 4 Race Scenarios
    // =========================================================================

    // Scenario 2 Gates: Alpha (older) and Beta (newer)
    let releaseAlphaGate!: () => void;
    const alphaGate = new Promise<void>((resolve) => { releaseAlphaGate = resolve; });
    let onAlphaDispatched!: () => void;
    const alphaDispatched = new Promise<void>((resolve) => { onAlphaDispatched = resolve; });

    let releaseBetaGate!: () => void;
    const betaGate = new Promise<void>((resolve) => { releaseBetaGate = resolve; });
    let onBetaDispatched!: () => void;
    const betaDispatched = new Promise<void>((resolve) => { onBetaDispatched = resolve; });

    // Scenario 1 Gates: Gamma (older) and Delta (newer)
    let releaseGammaGate!: () => void;
    const gammaGate = new Promise<void>((resolve) => { releaseGammaGate = resolve; });
    let onGammaDispatched!: () => void;
    const gammaDispatched = new Promise<void>((resolve) => { onGammaDispatched = resolve; });

    let releaseDeltaGate!: () => void;
    const deltaGate = new Promise<void>((resolve) => { releaseDeltaGate = resolve; });
    let onDeltaDispatched!: () => void;
    const deltaDispatched = new Promise<void>((resolve) => { onDeltaDispatched = resolve; });

    // Scenario 3 Gates: Epsilon (cleared while in-flight)
    let releaseEpsilonGate!: () => void;
    const epsilonGate = new Promise<void>((resolve) => { releaseEpsilonGate = resolve; });
    let onEpsilonDispatched!: () => void;
    const epsilonDispatched = new Promise<void>((resolve) => { onEpsilonDispatched = resolve; });

    // Scenario 4 Gates: Zeta (conversation context changed while in-flight)
    let releaseZetaGate!: () => void;
    const zetaGate = new Promise<void>((resolve) => { releaseZetaGate = resolve; });
    let onZetaDispatched!: () => void;
    const zetaDispatched = new Promise<void>((resolve) => { onZetaDispatched = resolve; });

    const arrivalOrder: string[] = [];

    // Intercept search with deterministic gates for all test queries
    await context.route(new RegExp(`/api/chat/conversations/.*/search`), async (route) => {
      const url = route.request().url();
      audit.handledMocks.push(url);

      if (url.includes('q=alpha')) {
        onAlphaDispatched();
        await alphaGate;
        arrivalOrder.push('alpha');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            query: 'alpha',
            messages: [{
              id: 'search-msg-alpha',
              conversation_id: AUTHORIZED_CONV_ID,
              sender_id: TEST_ACCOUNT.id,
              content: 'Alpha delayed search result',
              created_at: new Date().toISOString()
            }]
          })
        });
      }

      if (url.includes('q=beta')) {
        onBetaDispatched();
        await betaGate;
        arrivalOrder.push('beta');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            query: 'beta',
            messages: [{
              id: 'search-msg-beta',
              conversation_id: AUTHORIZED_CONV_ID,
              sender_id: TEST_ACCOUNT.id,
              content: 'Beta immediate search result',
              created_at: new Date().toISOString()
            }]
          })
        });
      }

      if (url.includes('q=gamma')) {
        onGammaDispatched();
        await gammaGate;
        arrivalOrder.push('gamma');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            query: 'gamma',
            messages: [{
              id: 'search-msg-gamma',
              conversation_id: AUTHORIZED_CONV_ID,
              sender_id: TEST_ACCOUNT.id,
              content: 'Gamma delayed search result',
              created_at: new Date().toISOString()
            }]
          })
        });
      }

      if (url.includes('q=delta')) {
        onDeltaDispatched();
        await deltaGate;
        arrivalOrder.push('delta');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            query: 'delta',
            messages: [{
              id: 'search-msg-delta',
              conversation_id: AUTHORIZED_CONV_ID,
              sender_id: TEST_ACCOUNT.id,
              content: 'Delta immediate search result',
              created_at: new Date().toISOString()
            }]
          })
        });
      }

      if (url.includes('q=epsilon')) {
        onEpsilonDispatched();
        await epsilonGate;
        arrivalOrder.push('epsilon');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            query: 'epsilon',
            messages: [{
              id: 'search-msg-epsilon',
              conversation_id: AUTHORIZED_CONV_ID,
              sender_id: TEST_ACCOUNT.id,
              content: 'Epsilon in-flight result',
              created_at: new Date().toISOString()
            }]
          })
        });
      }

      if (url.includes('q=zeta')) {
        onZetaDispatched();
        await zetaGate;
        arrivalOrder.push('zeta');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            query: 'zeta',
            messages: [{
              id: 'search-msg-zeta',
              conversation_id: AUTHORIZED_CONV_ID,
              sender_id: TEST_ACCOUNT.id,
              content: 'Zeta conversation-A search result',
              created_at: new Date().toISOString()
            }]
          })
        });
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, messages: [], total: 0 }) });
    });

    const page = await context.newPage();
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await seedTabSession(page);

    await page.goto(`/dashboard/chat?id=${AUTHORIZED_CONV_ID}`, { waitUntil: 'domcontentloaded' });

    // 1. Verify authorized chat is rendered
    const chatHeader = page.locator('.chat-header');
    await expect(chatHeader).toBeVisible({ timeout: 10000 });

    // 2. Open chat search control in header
    const searchOpenBtn = chatHeader.locator('button:has(svg.lucide-search)');
    await expect(searchOpenBtn).toBeVisible({ timeout: 10000 });
    await searchOpenBtn.click();

    const searchInput = page.locator('#chat-search-messages, input[placeholder="Search..."]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // =========================================================================
    // Scenario 2: Older request finishes while the newer request is pending
    // =========================================================================
    // 1. Dispatch search A (alpha)
    await searchInput.fill('alpha');
    await alphaDispatched;

    // 2. While alpha is pending, dispatch search B (beta)
    await searchInput.fill('beta');
    await betaDispatched;

    // 3. Resolve older request A first while B remains pending
    releaseAlphaGate();

    // 4. Verify loading indicator remains active while B is pending
    await expect(page.locator('text=Searching...')).toBeVisible({ timeout: 5000 });
    // And verify older results (alpha) do NOT render prematurely
    await expect(page.locator('text=Alpha delayed search result')).toHaveCount(0);

    // 5. Now resolve newer request B
    releaseBetaGate();

    // 6. Verify newer results (beta) appear and loading indicator ends
    await expect(page.locator('text=Beta immediate search result')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Searching...')).toHaveCount(0);
    await expect(page.locator('text=Alpha delayed search result')).toHaveCount(0);

    // =========================================================================
    // Scenario 1: Older response arrives last (out-of-order completion)
    // =========================================================================
    // 1. Dispatch search Gamma
    await searchInput.fill('gamma');
    await gammaDispatched;

    // 2. Dispatch search Delta
    await searchInput.fill('delta');
    await deltaDispatched;

    // 3. Resolve newer request Delta first
    releaseDeltaGate();
    await expect(page.locator('text=Delta immediate search result')).toBeVisible({ timeout: 10000 });

    // 4. Resolve older request Gamma afterward
    releaseGammaGate();

    // 5. Verify Delta results remain visible and Gamma delayed results NEVER replace them
    await expect(page.locator('text=Delta immediate search result')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Gamma delayed search result')).toHaveCount(0);

    // =========================================================================
    // Scenario 3: Search is cleared while a request is in flight
    // =========================================================================
    // 1. Dispatch search Epsilon
    await searchInput.fill('epsilon');
    await epsilonDispatched;

    // 2. Clear query immediately while request is in flight
    await searchInput.fill('');
    await expect(page.locator('text=Delta immediate search result')).toHaveCount(0);

    // 3. Resolve Epsilon after search is cleared
    releaseEpsilonGate();

    // 4. Verify stale Epsilon results do NOT appear and loading is not active
    await expect(page.locator('text=Epsilon in-flight result')).toHaveCount(0);
    await expect(page.locator('text=Searching...')).toHaveCount(0);

    // =========================================================================
    // Scenario 4: Conversation context changes while request is in flight
    // =========================================================================
    // 1. Dispatch search Zeta in Conversation 1
    await searchInput.fill('zeta');
    await zetaDispatched;

    // 2. Switch to Conversation 2 in sidebar while Zeta is in flight
    const secondConvItem = page.locator('text=Second Authorized Chat');
    await expect(secondConvItem).toBeVisible({ timeout: 10000 });
    await secondConvItem.click();

    // Wait for conversation 2 to load
    await expect(page.locator('#msg-msg-valid-2')).toBeVisible({ timeout: 10000 });

    // 3. Resolve Zeta after conversation context has changed
    releaseZetaGate();

    // 4. Verify conversation 1's results NEVER populate conversation 2
    await expect(page.locator('text=Zeta conversation-A search result')).toHaveCount(0);

    // Assert: No unhandled runtime page errors occurred
    expect(pageErrors).toEqual([]);

    // Assert: Zero unintended external egress leaks
    expect(audit.unintendedEgressBlocked).toEqual([]);

    await context.close();
  });
});
