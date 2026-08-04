import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser } from './utils/test-helpers';

test.describe('Profile Journeys', () => {
  let userA: any;
  let userB: any;

  test.beforeEach(async () => {
    userA = await createTestUser();
    userB = await createTestUser();
  });

  test.afterEach(async () => {
    if (userA) await deleteTestUser(userA.id);
    if (userB) await deleteTestUser(userB.id);
  });

  test('can edit profile and see changes immediately', async ({ page }) => {
    // Login as userA
    await page.goto('/login');
    await page.fill('input[type="email"]', userA.email);
    await page.fill('input[type="password"]', userA.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/feed/);

    // Navigate to profile
    await page.goto(`/${userA.username}`);

    // Click Edit Profile
    await page.click('text=Edit Profile');

    // Change full name and bio
    const newName = `Updated ${userA.id}`;
    await page.fill('input[name="full_name"]', newName);
    await page.fill('textarea[name="bio"]', 'This is a test bio from Playwright.');
    
    // Save
    await page.click('button:has-text("Save")');

    // Verify UI updates without refresh
    await expect(page.locator(`text=${newName}`)).toBeVisible();
    await expect(page.locator('text=This is a test bio from Playwright.')).toBeVisible();
  });

  test('can follow another user', async ({ page }) => {
    // Login as userA
    await page.goto('/login');
    await page.fill('input[type="email"]', userA.email);
    await page.fill('input[type="password"]', userA.password);
    await page.click('button[type="submit"]');

    // Go to User B's profile
    await page.goto(`/${userB.username}`);
    
    // Click Follow
    const followBtn = page.locator('button:has-text("Follow")');
    await expect(followBtn).toBeVisible();
    await followBtn.click();
    
    // Button should transition to Following
    await expect(page.locator('button:has-text("Following")')).toBeVisible();
    
    // Refresh and check persistence
    await page.reload();
    await expect(page.locator('button:has-text("Following")')).toBeVisible();
  });
});
