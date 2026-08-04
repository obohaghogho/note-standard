import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser } from './utils/test-helpers';

test.describe('Security & Access Controls', () => {
  let userA: any;
  let userB: any;

  test.beforeAll(async () => {
    userA = await createTestUser();
    userB = await createTestUser();
  });

  test.afterAll(async () => {
    if (userA) await deleteTestUser(userA.id);
    if (userB) await deleteTestUser(userB.id);
  });

  test('anonymous users are redirected to login', async ({ page }) => {
    await page.goto('/feed');
    // Should be redirected away from protected routes
    await expect(page).toHaveURL(/.*\/login/);
    
    await page.goto('/chat');
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('authenticated users cannot access login or register', async ({ page }) => {
    // Login user A
    await page.goto('/login');
    await page.fill('input[type="email"]', userA.email);
    await page.fill('input[type="password"]', userA.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/feed/);

    // Try to go back to login
    await page.goto('/login');
    // Should instantly redirect back to feed
    await expect(page).toHaveURL(/.*\/feed/);
  });

  test('users cannot edit profiles they do not own', async ({ page }) => {
    // Login user A
    await page.goto('/login');
    await page.fill('input[type="email"]', userA.email);
    await page.fill('input[type="password"]', userA.password);
    await page.click('button[type="submit"]');

    // Visit User B's profile
    await page.goto(`/${userB.username}`);

    // Verify Edit Profile button is NOT visible
    await expect(page.locator('text=Edit Profile')).toBeHidden();
    // Verify Follow button IS visible
    await expect(page.locator('button:has-text("Follow")')).toBeVisible();
  });
});
