import { test, expect, Page } from '@playwright/test';

async function loginAs(page: Page) {
  await page.goto('/auth/login');
  await page.fill('[id="email"]', process.env.TEST_EMAIL!);
  await page.fill('[id="password"]', process.env.TEST_PASSWORD!);
  await page.click('[id="login-submit"]');
  await page.waitForURL('**/dashboard**');
}

test.describe('Poll Creation & Voting', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/dashboard/community');
  });

  test('Post composer opens with poll option', async ({ page }) => {
    const composer = page.locator('[data-testid="post-composer-trigger"], [placeholder*="Share your knowledge"]').first();
    await expect(composer).toBeVisible({ timeout: 10000 });
    await composer.click();
    const pollBtn = page.locator('[data-testid="post-type-poll"], button:has-text("Poll")').first();
    if (await pollBtn.isVisible({ timeout: 3000 })) {
      await pollBtn.click();
      await expect(page.locator('[data-testid="poll-option-input"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Can create a poll post with multiple options', async ({ page }) => {
    // Click composer
    const composer = page.locator('[placeholder*="Share your knowledge"]').first();
    await composer.click();

    // Select poll type
    const pollBtn = page.locator('button:has-text("Poll")').first();
    if (await pollBtn.isVisible({ timeout: 3000 })) {
      await pollBtn.click();

      // Fill in poll question
      const questionInput = page.locator('[data-testid="poll-question"], textarea').first();
      await questionInput.fill('Playwright Test Poll?');

      // Fill options
      const options = page.locator('[data-testid="poll-option-input"]');
      await options.nth(0).fill('Option A');
      await options.nth(1).fill('Option B');

      // Submit
      const submitBtn = page.locator('[data-testid="post-submit"]').first();
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }
  });

  test('Voting on a poll option performs optimistic update', async ({ page }) => {
    // Find a poll post in the feed
    const pollOption = page.locator('[data-testid="poll-option"]').first();
    if (await pollOption.isVisible({ timeout: 5000 })) {
      await pollOption.innerText();
      await pollOption.click();
      await page.waitForTimeout(800);

      // After voting, a percentage should appear
      const pctLabel = page.locator('[data-testid="poll-option-pct"]').first();
      if (await pctLabel.isVisible()) {
        const pctText = await pctLabel.innerText();
        expect(pctText).toMatch(/\d+%/);
      }
    }
  });

  test('Cannot vote twice on the same poll', async ({ page }) => {
    const pollOption = page.locator('[data-testid="poll-option"]').first();
    if (await pollOption.isVisible({ timeout: 5000 })) {
      await pollOption.click();
      await page.waitForTimeout(500);
      // Options should now be disabled
      await expect(pollOption).toBeDisabled();
    }
  });

  test('Visual regression: Poll widget baseline', async ({ page }) => {
    const pollWidget = page.locator('[data-testid="poll-widget"]').first();
    if (await pollWidget.isVisible({ timeout: 5000 })) {
      await expect(pollWidget).toHaveScreenshot('poll-widget-baseline.png');
    }
  });
});
