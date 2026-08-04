import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createTestUser, deleteTestUser } from './utils/test-helpers';

test.describe('Accessibility (a11y) Scans', () => {
  let user: any;

  test.beforeEach(async () => {
    user = await createTestUser();
  });

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('feed page should not have automatically detectable accessibility violations', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/feed/);

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('profile page should not have accessibility violations', async ({ page }) => {
    // Login and go to profile
    await page.goto('/login');
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.goto(`/${user.username}`);

    // Wait for the banner or avatar to load to ensure UI is settled
    await page.waitForSelector('text=Edit Profile');

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
