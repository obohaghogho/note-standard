import { test, expect } from '@playwright.test';

test.describe('Enterprise Feedback & Issue Tracking E2E Flow', () => {
  test('User can open feedback modal, use AI assist, and submit report', async ({ page }) => {
    // 1. Navigate to dashboard
    await page.goto('/dashboard');
    
    // 2. Open Enterprise Feedback Modal
    const feedbackButton = page.locator('button[aria-label="Submit Enterprise Feedback"]');
    await expect(feedbackButton).toBeVisible();
    await feedbackButton.click();

    // 3. Select Category & Priority
    const categoryButton = page.getByRole('button', { name: 'Payment Issue' });
    await categoryButton.click();

    // 4. Fill in Description
    const descriptionInput = page.locator('textarea[required]');
    await descriptionInput.fill('Payment deposit via Fincra card timed out after 30 seconds.');

    // 5. Trigger AI Assist
    const aiAssistButton = page.getByRole('button', { name: 'AI Assist Title & Steps' });
    await aiAssistButton.click();

    // 6. Submit Report
    const submitButton = page.getByRole('button', { name: 'Submit Report' });
    await submitButton.click();

    // 7. Verify Success State
    await expect(page.getByText('Report Successfully Logged!')).toBeVisible();
  });

  test('User can view submitted reports in Issue Tracker', async ({ page }) => {
    await page.goto('/dashboard/feedback');
    await expect(page.getByText('My Feedback & Issue Tracker')).toBeVisible();
  });
});
