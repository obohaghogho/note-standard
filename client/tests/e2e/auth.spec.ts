import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser } from './utils/test-helpers';

test.describe('Authentication Journeys', () => {
  let testUser: any;

  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
    }
  });

  test('successfully logs in and out', async ({ page }) => {
    await page.goto('/login');

    // Fill login form
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    
    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to feed or home
    await expect(page).toHaveURL(/.*\/feed/);
    await expect(page.locator('text=Home')).toBeVisible();
    
    // Logout
    await page.click('[aria-label="User Menu"]'); // Adjust selector as needed
    await page.click('text=Log out');
    
    // Should be back at login or splash
    await expect(page).toHaveURL(/.*\/login/);
  });
  
  test('rejects incorrect passwords gracefully', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    // Expect an error toast or message
    const errorMessage = page.locator('.toast, .error-message'); // Adjust selector based on NoteStandard UI
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/Invalid login credentials/i);
  });
});
