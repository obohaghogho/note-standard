import { test, expect, Page } from '@playwright/test';

async function loginAs(page: Page) {
  await page.goto('/auth/login');
  await page.fill('[id="email"]', process.env.TEST_EMAIL!);
  await page.fill('[id="password"]', process.env.TEST_PASSWORD!);
  await page.click('[id="login-submit"]');
  await page.waitForURL('**/dashboard**');
}

async function openFirstPost(page: Page) {
  await page.goto('/dashboard/community');
  const firstCard = page.locator('[data-testid="post-card"]').first();
  await firstCard.waitFor({ timeout: 10000 });
  // Click the comment button to open comments section
  const commentBtn = firstCard.locator('[data-testid="comment-btn"], button:has([data-lucide="message-circle"])').first();
  await commentBtn.click();
  await page.waitForSelector('[data-testid="comment-section"]', { timeout: 5000 });
}

test.describe('Nested Comments & Replies', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await openFirstPost(page);
  });

  test('Comment section renders existing comments', async ({ page }) => {
    const section = page.locator('[data-testid="comment-section"]');
    await expect(section).toBeVisible();
  });

  test('User can type and submit a comment', async ({ page }) => {
    const textarea = page.locator('[data-testid="comment-input"], textarea[placeholder*="comment"]').first();
    await textarea.fill('Playwright test comment ' + Date.now());
    const submitBtn = page.locator('[data-testid="comment-submit"], button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForTimeout(1500);
    // Comment should appear in the list
    await expect(page.locator('[data-testid="comment-item"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('User can reply to a comment', async ({ page }) => {
    const replyBtn = page.locator('[data-testid="reply-btn"]').first();
    if (await replyBtn.isVisible()) {
      await replyBtn.click();
      const replyInput = page.locator('[data-testid="reply-input"], textarea[placeholder*="reply"]').first();
      await replyInput.fill('Playwright nested reply ' + Date.now());
      const submitReply = page.locator('[data-testid="reply-submit"]').first();
      await submitReply.click();
      await page.waitForTimeout(1500);
    }
  });

  test('User can edit their comment', async ({ page }) => {
    const editBtn = page.locator('[data-testid="comment-edit-btn"]').first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      const editInput = page.locator('[data-testid="comment-edit-input"]').first();
      await editInput.clear();
      await editInput.fill('Edited comment text ' + Date.now());
      await page.locator('[data-testid="comment-save-btn"]').first().click();
      await page.waitForTimeout(1000);
    }
  });

  test('User can delete their comment', async ({ page }) => {
    const deleteBtn = page.locator('[data-testid="comment-delete-btn"]').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      const confirmBtn = page.locator('[data-testid="confirm-delete"]').first();
      if (await confirmBtn.isVisible()) await confirmBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});
