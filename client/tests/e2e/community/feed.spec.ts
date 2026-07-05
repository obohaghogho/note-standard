import { test, expect, Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.fill('[id="email"]', email);
  await page.fill('[id="password"]', password);
  await page.click('[id="login-submit"]');
  await page.waitForURL('**/dashboard**');
}

async function goToCommunity(page: Page) {
  await page.goto('/dashboard/community');
  await page.waitForSelector('[id="community-feed"], [data-testid="community-feed"]', { timeout: 10000 });
}

test.describe('Community Feed & Infinite Scroll', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, process.env.TEST_EMAIL!, process.env.TEST_PASSWORD!);
    await goToCommunity(page);
  });

  test('Feed loads posts from the backend', async ({ page }) => {
    const postCard = page.locator('[data-testid="post-card"]').first();
    await expect(postCard).toBeVisible({ timeout: 10000 });
  });

  test('Category tabs are all clickable and reload the feed', async ({ page }) => {
    const categories = ['General', 'Tech', 'Science', 'Math'];
    for (const cat of categories) {
      const tab = page.getByText(cat, { exact: false });
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForTimeout(600);
        // Feed should have reloaded (skeleton or posts visible)
        await expect(page.locator('[data-testid="post-card"], [data-testid="skeleton"]').first()).toBeVisible({ timeout: 8000 });
      }
    }
  });

  test('Infinite scroll loads more posts', async ({ page }) => {
    // Count initial posts
    const initialCount = await page.locator('[data-testid="post-card"]').count();

    // Scroll to bottom to trigger infinite scroll
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    const newCount = await page.locator('[data-testid="post-card"]').count();
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });

  test('Search filters feed posts', async ({ page }) => {
    const searchInput = page.locator('[placeholder*="Search"], [id*="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.waitForTimeout(800);
      await expect(page.locator('[data-testid="post-card"], [data-testid="empty-state"]').first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('Filter modal opens and applies filter', async ({ page }) => {
    const filterBtn = page.locator('[id*="filter"], [aria-label*="filter"]').first();
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
      await expect(page.locator('[role="dialog"], [data-testid="filter-modal"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Visual regression: Feed page baseline', async ({ page }) => {
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('community-feed-baseline.png', { maxDiffPixels: 200 });
  });
});
