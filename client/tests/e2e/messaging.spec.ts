import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser } from './utils/test-helpers';

test.describe('Messaging Reliability', () => {
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

  test('receipt progression: Sent -> Delivered -> Read', async ({ browser }) => {
    // We create two separate incognito browser contexts
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // 1. User B logs in and stays on Feed (not in the chat yet)
    await pageB.goto('/login');
    await pageB.fill('input[type="email"]', userB.email);
    await pageB.fill('input[type="password"]', userB.password);
    await pageB.click('button[type="submit"]');
    await pageB.waitForURL(/.*\/feed/);

    // 2. User A logs in and goes to User B's profile to start a chat
    await pageA.goto('/login');
    await pageA.fill('input[type="email"]', userA.email);
    await pageA.fill('input[type="password"]', userA.password);
    await pageA.click('button[type="submit"]');
    await pageA.waitForURL(/.*\/feed/);
    
    await pageA.goto(`/${userB.username}`);
    await pageA.click('[aria-label="Message"]');
    
    // Ensure User A is in the chat view
    await expect(pageA).toHaveURL(/.*\/chat/);

    // 3. User A sends a message
    const messageContent = 'Hello from Playwright';
    await pageA.fill('textarea[placeholder*="message"]', messageContent);
    await pageA.click('button[aria-label="Send message"]');

    // VERIFY: Should show single tick initially (Sent)
    const messageBubble = pageA.locator(`text=${messageContent}`).locator('xpath=..');
    await expect(messageBubble.locator('svg.lucide-check')).toBeVisible(); // Sent

    // VERIFY: Since User B is online (WebSockets connected), they should receive it and auto-ACK delivery.
    // So User A should quickly see the double gray ticks.
    await expect(messageBubble.locator('svg.lucide-check-check:not(.text-cyan-400)')).toBeVisible({ timeout: 10000 }); // Delivered

    // 4. User B navigates into the chat
    await pageB.goto('/chat');
    // Click the conversation
    await pageB.click(`text=${userA.username}`);
    
    // User B reads the message
    await expect(pageB.locator(`text=${messageContent}`)).toBeVisible();

    // VERIFY: User A should instantly see the double cyan ticks
    await expect(messageBubble.locator('svg.lucide-check-check.text-cyan-400')).toBeVisible({ timeout: 5000 }); // Read
    
    await contextA.close();
    await contextB.close();
  });
});
