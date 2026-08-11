const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:/Users/hp/.gemini/antigravity-ide/brain/ac404d03-de52-474e-8c5b-4e8e941bb9e8';

async function runProof() {
  console.log('Launching Playwright Chromium for Live Visual Proof...');
  const browser = await chromium.launch({ headless: true });
  
  // Create Mobile Context (iPhone 13 viewport: 390x844)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  // Create Desktop Context (1280x800)
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  // 1. Mobile Feed Dashboard
  const mobilePage = await mobileContext.newPage();
  console.log('Navigating Mobile Browser to http://localhost:5173/dashboard/feed...');
  await mobilePage.goto('http://localhost:5173/dashboard/feed', { waitUntil: 'networkidle' }).catch(() => {});
  await mobilePage.waitForTimeout(2000);

  const mobileFeedScreenshotPath = path.join(ARTIFACT_DIR, 'proof_feed_mobile_view.png');
  await mobilePage.screenshot({ path: mobileFeedScreenshotPath, fullPage: false });
  console.log('Saved Mobile Feed Screenshot:', mobileFeedScreenshotPath);

  // 2. Mobile Community Trends
  console.log('Navigating Mobile Browser to http://localhost:5173/dashboard/trends...');
  await mobilePage.goto('http://localhost:5173/dashboard/trends', { waitUntil: 'networkidle' }).catch(() => {});
  await mobilePage.waitForTimeout(2000);

  const mobileTrendsScreenshotPath = path.join(ARTIFACT_DIR, 'proof_trends_mobile_view.png');
  await mobilePage.screenshot({ path: mobileTrendsScreenshotPath, fullPage: false });
  console.log('Saved Mobile Trends Screenshot:', mobileTrendsScreenshotPath);

  // 3. Desktop Feed Dashboard
  const desktopPage = await desktopContext.newPage();
  console.log('Navigating Desktop Browser to http://localhost:5173/dashboard/feed...');
  await desktopPage.goto('http://localhost:5173/dashboard/feed', { waitUntil: 'networkidle' }).catch(() => {});
  await desktopPage.waitForTimeout(2000);

  const desktopFeedScreenshotPath = path.join(ARTIFACT_DIR, 'proof_feed_desktop_view.png');
  await desktopPage.screenshot({ path: desktopFeedScreenshotPath, fullPage: false });
  console.log('Saved Desktop Feed Screenshot:', desktopFeedScreenshotPath);

  // 4. Desktop Community Trends Overview
  console.log('Navigating Desktop Browser to http://localhost:5173/dashboard/trends...');
  await desktopPage.goto('http://localhost:5173/dashboard/trends', { waitUntil: 'networkidle' }).catch(() => {});
  await desktopPage.waitForTimeout(2000);

  const desktopTrendsScreenshotPath = path.join(ARTIFACT_DIR, 'proof_trends_desktop_view.png');
  await desktopPage.screenshot({ path: desktopTrendsScreenshotPath, fullPage: false });
  console.log('Saved Desktop Trends Screenshot:', desktopTrendsScreenshotPath);

  await browser.close();
  console.log('ALL SCREENSHOT PROOFS CAPTURED SUCCESSFULLY!');
}

runProof().catch(err => {
  console.error('Error generating visual proofs:', err);
  process.exit(1);
});
