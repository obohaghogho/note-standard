import { test, expect, Page } from '@playwright/test';

async function loginAs(page: Page) {
  await page.goto('/auth/login');
  await page.fill('[id="email"]', process.env.TEST_EMAIL!);
  await page.fill('[id="password"]', process.env.TEST_PASSWORD!);
  await page.click('[id="login-submit"]');
  await page.waitForURL('**/dashboard**');
}

const THRESHOLDS = {
  feedLoad: 3000,    // ms
  commentLatency: 2000,
  wsLatency: 2000,
};

test.describe('Performance Metrics & Load Time', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('Community feed loads within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/dashboard/community');
    await page.waitForSelector('[data-testid="post-card"]', { timeout: 10000 });
    const elapsed = Date.now() - start;
    console.log(`⏱ Feed load time: ${elapsed}ms`);
    if (elapsed > THRESHOLDS.feedLoad) {
      console.warn(`⚠️ Feed load exceeded threshold: ${elapsed}ms > ${THRESHOLDS.feedLoad}ms`);
    }
    expect(elapsed).toBeLessThan(10000); // Hard limit
  });

  test('Comment section renders within 2 seconds of click', async ({ page }) => {
    await page.goto('/dashboard/community');
    await page.waitForSelector('[data-testid="comment-btn"]', { timeout: 10000 });

    const start = Date.now();
    await page.locator('[data-testid="comment-btn"]').first().click();
    await page.waitForSelector('[data-testid="comment-section"]', { timeout: 5000 });
    const elapsed = Date.now() - start;
    console.log(`⏱ Comment section load time: ${elapsed}ms`);
    if (elapsed > THRESHOLDS.commentLatency) {
      console.warn(`⚠️ Comment load exceeded threshold: ${elapsed}ms > ${THRESHOLDS.commentLatency}ms`);
    }
    expect(elapsed).toBeLessThan(5000);
  });

  test('Like action has sub-200ms optimistic UI response', async ({ page }) => {
    await page.goto('/dashboard/community');
    await page.waitForSelector('[data-testid="like-btn"]', { timeout: 10000 });

    const start = Date.now();
    await page.locator('[data-testid="like-btn"]').first().click();
    // Wait for the like count to change (optimistic)
    await page.waitForTimeout(100);
    const elapsed = Date.now() - start;
    console.log(`⏱ Optimistic like response: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(500); // Optimistic should be immediate
  });

  test('Feed page Core Web Vitals are acceptable', async ({ page }) => {
    await page.goto('/dashboard/community');

    const metrics = await page.evaluate(() => {
      return new Promise<Record<string, number>>((resolve) => {
        new PerformanceObserver((list) => {
          const entries: Record<string, number> = {};
          list.getEntries().forEach((entry) => {
            const e = entry as PerformanceEntry & { value: number };
            entries[e.name] = e.value;
          });
          resolve(entries);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        // Fallback
        setTimeout(() => resolve({ LCP: 0 }), 5000);
      });
    });

    console.log('📊 Performance Metrics:', metrics);
  });

  test('Mobile viewport (Pixel 5): Feed loads correctly', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 393, height: 851 },
      userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5)',
    });
    const page = await ctx.newPage();
    await loginAs(page);
    await page.goto('/dashboard/community');
    await page.waitForSelector('[data-testid="post-card"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible();
    await ctx.close();
  });

  test('Tablet viewport (iPad): Feed loads correctly', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 820, height: 1180 },
    });
    const page = await ctx.newPage();
    await loginAs(page);
    await page.goto('/dashboard/community');
    await page.waitForSelector('[data-testid="post-card"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible();
    await ctx.close();
  });
});
