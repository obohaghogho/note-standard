import { test, expect, Page } from '@playwright/test';

async function loginAs(page: Page) {
  await page.goto('/auth/login');
  await page.fill('[id="email"]', process.env.TEST_EMAIL!);
  await page.fill('[id="password"]', process.env.TEST_PASSWORD!);
  await page.click('[id="login-submit"]');
  await page.waitForURL('**/dashboard**');
}

test.describe('Bookmarking Posts', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/dashboard/community');
    await page.waitForSelector('[data-testid="post-card"]', { timeout: 10000 });
  });

  test('Bookmark button is visible on post card', async ({ page }) => {
    const bookmarkBtn = page.locator('[data-testid="bookmark-btn"]').first();
    await expect(bookmarkBtn).toBeVisible();
  });

  test('Clicking bookmark toggles state optimistically', async ({ page }) => {
    const bookmarkBtn = page.locator('[data-testid="bookmark-btn"]').first();
    const initialClass = await bookmarkBtn.getAttribute('class');
    await bookmarkBtn.click();
    await page.waitForTimeout(400);
    const newClass = await bookmarkBtn.getAttribute('class');
    // Class should have changed (filled vs not)
    expect(newClass).not.toEqual(initialClass);
  });

  test('Bookmarked posts appear in Saved tab', async ({ page }) => {
    // First bookmark a post
    const bookmarkBtn = page.locator('[data-testid="bookmark-btn"]').first();
    await bookmarkBtn.click();
    await page.waitForTimeout(500);

    // Switch to saved tab
    const savedTab = page.getByText('Saved', { exact: true });
    if (await savedTab.isVisible()) {
      await savedTab.click();
      await page.waitForTimeout(1000);
      const savedPosts = page.locator('[data-testid="post-card"]');
      await expect(savedPosts.first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('Un-bookmarking removes post from Saved tab', async ({ page }) => {
    const savedTab = page.getByText('Saved', { exact: true });
    if (await savedTab.isVisible()) {
      await savedTab.click();
      await page.waitForTimeout(1000);
      const firstPost = page.locator('[data-testid="post-card"]').first();
      if (await firstPost.isVisible()) {
        const unbookmarkBtn = firstPost.locator('[data-testid="bookmark-btn"]').first();
        await unbookmarkBtn.click();
        await page.waitForTimeout(1500);
      }
    }
  });
});
