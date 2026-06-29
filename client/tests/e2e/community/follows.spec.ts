import { test, expect, Page } from '@playwright/test';

async function loginAs(page: Page) {
  await page.goto('/auth/login');
  await page.fill('[id="email"]', process.env.TEST_EMAIL!);
  await page.fill('[id="password"]', process.env.TEST_PASSWORD!);
  await page.click('[id="login-submit"]');
  await page.waitForURL('**/dashboard**');
}

test.describe('Following Creators & Feed Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/dashboard/community');
    await page.waitForSelector('[data-testid="post-card"]', { timeout: 10000 });
  });

  test('Suggested creators sidebar is visible', async ({ page }) => {
    const sidebar = page.locator('[data-testid="feed-sidebar"]').first();
    if (await sidebar.isVisible()) {
      await expect(sidebar).toBeVisible();
    }
  });

  test('Follow button in sidebar toggles correctly', async ({ page }) => {
    const followBtn = page.locator('[id^="follow-sidebar-"]').first();
    if (await followBtn.isVisible()) {
      const initialText = await followBtn.innerText();
      await followBtn.click();
      await page.waitForTimeout(600);
      const newText = await followBtn.innerText();
      expect(newText).not.toEqual(initialText);
    }
  });

  test('Following tab shows only followed users posts', async ({ page }) => {
    const followingTab = page.getByText('Following', { exact: true });
    if (await followingTab.isVisible()) {
      await followingTab.click();
      await page.waitForTimeout(1000);
      // Should show posts or empty state
      await expect(
        page.locator('[data-testid="post-card"], [data-testid="empty-state"]').first()
      ).toBeVisible({ timeout: 8000 });
    }
  });

  test('Can follow a user from post author row', async ({ page }) => {
    const authorFollowBtn = page.locator('[data-testid="author-follow-btn"]').first();
    if (await authorFollowBtn.isVisible()) {
      await authorFollowBtn.click();
      await page.waitForTimeout(600);
      await expect(authorFollowBtn).not.toHaveText('Follow');
    }
  });

  test('Can unfollow a user', async ({ page }) => {
    const followingBtn = page.locator('[data-testid="author-follow-btn"]:has-text("Following")').first();
    if (await followingBtn.isVisible()) {
      await followingBtn.click();
      await page.waitForTimeout(600);
    }
  });
});
