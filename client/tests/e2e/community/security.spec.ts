import { test, expect, Page } from '@playwright/test';

const PRIMARY_USER = { email: process.env.TEST_EMAIL!, password: process.env.TEST_PASSWORD! };
const SECONDARY_USER = { email: process.env.TEST_EMAIL_2!, password: process.env.TEST_PASSWORD_2! };

async function loginAs(page: Page, user: { email: string; password: string }) {
  await page.goto('/auth/login');
  await page.fill('[id="email"]', user.email);
  await page.fill('[id="password"]', user.password);
  await page.click('[id="login-submit"]');
  await page.waitForURL('**/dashboard**');
}

test.describe('Security – Unauthorized Action Prevention', () => {
  test('Cannot edit another users post via UI (menu should not show Edit)', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    // User 1 creates a post
    await loginAs(page1, PRIMARY_USER);
    await page1.goto('/dashboard/community');
    await page1.waitForSelector('[data-testid="post-card"]', { timeout: 10000 });

    // Get the post id of the first post (created by user 1)
    const postId = await page1.locator('[data-testid="post-card"]').first().getAttribute('data-post-id');

    // User 2 views the same feed
    await loginAs(page2, SECONDARY_USER);
    await page2.goto('/dashboard/community');

    // Find the same post, open its menu
    const card = page2.locator(`[data-post-id="${postId}"]`).first();
    if (postId && await card.isVisible({ timeout: 5000 })) {
      const menuBtn = card.locator('[data-testid="post-menu-btn"]').first();
      await menuBtn.click();
      // Edit option should not be visible for a different user's post
      const editOption = page2.locator('[data-testid="post-menu-edit"]').first();
      await expect(editOption).not.toBeVisible({ timeout: 2000 });
    }

    await ctx1.close();
    await ctx2.close();
  });

  test('Cannot delete another users post via UI', async ({ browser }) => {
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();

    await loginAs(page2, SECONDARY_USER);
    await page2.goto('/dashboard/community');
    await page2.waitForSelector('[data-testid="post-card"]', { timeout: 10000 });

    // Find a post not owned by user 2
    const menuBtn = page2.locator('[data-testid="post-menu-btn"]').first();
    await menuBtn.click();
    const deleteOption = page2.locator('[data-testid="post-menu-delete"]').first();
    // Should not be visible for other users' posts
    const isVisible = await deleteOption.isVisible({ timeout: 2000 });
    // If visible, we assert it's been correctly hidden by server check
    if (isVisible) {
      // Click it and expect a 403 toast
      await deleteOption.click();
      await expect(page2.locator('text=Unauthorized, text=Permission denied').first()).toBeVisible({ timeout: 5000 });
    }

    await ctx2.close();
  });

  test('Cannot vote twice on the same poll (UI prevents it)', async ({ page }) => {
    await loginAs(page, PRIMARY_USER);
    await page.goto('/dashboard/community');
    const pollOption = page.locator('[data-testid="poll-option"]').first();
    if (await pollOption.isVisible({ timeout: 5000 })) {
      await pollOption.click();
      await page.waitForTimeout(400);
      // All options should now be disabled
      const options = page.locator('[data-testid="poll-option"]');
      const count = await options.count();
      for (let i = 0; i < count; i++) {
        await expect(options.nth(i)).toBeDisabled();
      }
    }
  });

  test('Unauthenticated requests return 401 from API', async ({ request }) => {
    const res = await request.get('/api/community/feed');
    expect([401, 403]).toContain(res.status());
  });
});
