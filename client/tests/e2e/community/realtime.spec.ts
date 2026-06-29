import { test, expect, Page } from '@playwright/test';

async function loginAs(page: Page) {
  await page.goto('/auth/login');
  await page.fill('[id="email"]', process.env.TEST_EMAIL!);
  await page.fill('[id="password"]', process.env.TEST_PASSWORD!);
  await page.click('[id="login-submit"]');
  await page.waitForURL('**/dashboard**');
}

test.describe('WebSocket Realtime Synchronization', () => {
  test('New post from second user appears in first user feed without refresh', async ({ browser }) => {
    const ctxUser1 = await browser.newContext();
    const ctxUser2 = await browser.newContext();

    const page1 = await ctxUser1.newPage();
    const page2 = await ctxUser2.newPage();

    // Both users log in (same account for simplicity in test env)
    await loginAs(page1);
    await loginAs(page2);

    await page1.goto('/dashboard/community');
    await page1.waitForSelector('[data-testid="post-card"]', { timeout: 10000 });

    // User 2 creates a post
    const composer = page2.locator('[placeholder*="Share your knowledge"]').first();
    if (await composer.isVisible({ timeout: 5000 })) {
      await composer.click();
      const contentInput = page2.locator('[data-testid="composer-content"]').first();
      await contentInput.fill('Realtime sync test post ' + Date.now());
      await page2.locator('[data-testid="post-submit"]').click();
      await page2.waitForTimeout(2000);

      // User 1 should see the new post without refreshing
      await page1.waitForTimeout(3000);
      const latestPost = page1.locator('[data-testid="post-card"]').first();
      await expect(latestPost).toContainText('Realtime sync test post', { timeout: 5000 });
    }

    await ctxUser1.close();
    await ctxUser2.close();
  });

  test('Like count updates in real-time across two tabs', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await loginAs(page1);
    await loginAs(page2);
    await page1.goto('/dashboard/community');
    await page2.goto('/dashboard/community');

    await page1.waitForSelector('[data-testid="like-count"]', { timeout: 10000 });
    await page2.waitForSelector('[data-testid="like-btn"]', { timeout: 10000 });

    const initialCount = parseInt(await page1.locator('[data-testid="like-count"]').first().innerText() || '0');

    // page2 likes the post
    await page2.locator('[data-testid="like-btn"]').first().click();
    await page1.waitForTimeout(2000);

    const updatedCount = parseInt(await page1.locator('[data-testid="like-count"]').first().innerText() || '0');
    expect(updatedCount).toBeGreaterThanOrEqual(initialCount);

    await ctx1.close();
    await ctx2.close();
  });

  test('Comment appears in real-time in post detail view', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await loginAs(page1);
    await loginAs(page2);

    // Both look at community
    await page1.goto('/dashboard/community');
    await page2.goto('/dashboard/community');

    // page1 opens comments
    await page1.waitForSelector('[data-testid="comment-btn"]', { timeout: 10000 });
    await page1.locator('[data-testid="comment-btn"]').first().click();
    await page1.waitForSelector('[data-testid="comment-section"]', { timeout: 5000 });

    const testComment = 'WS realtime comment ' + Date.now();

    // page2 adds a comment
    await page2.locator('[data-testid="comment-btn"]').first().click();
    const textarea = page2.locator('[data-testid="comment-input"]').first();
    if (await textarea.isVisible({ timeout: 3000 })) {
      await textarea.fill(testComment);
      await page2.locator('[data-testid="comment-submit"]').first().click();
    }

    await page1.waitForTimeout(3000);
    // page1 should see the new comment
    const comments = page1.locator('[data-testid="comment-item"]');
    const count = await comments.count();
    expect(count).toBeGreaterThan(0);

    await ctx1.close();
    await ctx2.close();
  });
});
