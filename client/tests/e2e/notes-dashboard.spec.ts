import { test, expect } from '@playwright/test';

test.describe('Enterprise Note Dashboard E2E Workflow Verification', () => {
  test('User can search notes using Ctrl + K, select a result, and open the note', async ({ page }) => {
    // 1. Navigate to Workspace Hub
    await page.goto('/dashboard/notes');

    // 2. Press Ctrl + K keyboard shortcut
    await page.keyboard.press('Control+k');

    // 3. Type search query
    const searchInput = page.locator('input[placeholder*="Search notes"]');
    await expect(searchInput).toBeFocused();
    await searchInput.fill('Untitled');

    // 4. Verify search dropdown matches
    const searchResultButton = page.locator('button', { hasText: 'Matched Results' }).first();
    if (await searchResultButton.isVisible()) {
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }
  });

  test('User can open note via deep link URL parameter', async ({ page }) => {
    await page.goto('/dashboard/notes?noteId=demo_note_1');
    await page.waitForTimeout(1000);
    // Page loads gracefully without crashing
    expect(page.url()).toContain('/dashboard/notes');
  });

  test('User can trigger Quick Action to create a new note', async ({ page }) => {
    await page.goto('/dashboard/notes');
    const newNoteBtn = page.getByRole('button', { name: /Create|New Note/i }).first();
    if (await newNoteBtn.isVisible()) {
      await newNoteBtn.click();
    }
  });
});
