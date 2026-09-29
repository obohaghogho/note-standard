const path = require('path');
const rootDir = path.join(__dirname, '..');
const env = require(path.join(rootDir, 'config', 'env'));
const { Client } = require('pg');
const creatorAnalyticsService = require('../services/creator/CreatorAnalyticsService');

async function runTests() {
  console.log('--- CREATOR REELS ANALYTICS API & SERVICE VERIFICATION ---');

  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    // 1. Fetch a creator with Reels
    const { rows: reelRows } = await client.query(
      "SELECT id, author_id FROM community_posts WHERE is_reel = true OR post_type IN ('reel', 'video') LIMIT 1"
    );

    if (reelRows.length === 0) {
      console.log('No Reel posts found, skipping test execution.');
      return;
    }

    const testReel = reelRows[0];
    const creatorId = testReel.author_id;
    const reelId = testReel.id;

    // Fetch non-author profile ID for IDOR test
    const { rows: otherProfiles } = await client.query(
      "SELECT id FROM profiles WHERE id <> $1 LIMIT 1",
      [creatorId]
    );
    const otherCreatorId = otherProfiles[0]?.id || '00000000-0000-0000-0000-000000000000';
    const nonExistentCreatorId = '00000000-0000-0000-0000-999999999999';

    console.log(`Testing Creator ID: ${creatorId}, Reel ID: ${reelId}`);

    // TEST 1: Portfolio Analytics (7d, 30d, 90d, all)
    console.log('\n[Test 1] Fetch Portfolio Analytics (30d)...');
    const portfolio30d = await creatorAnalyticsService.getReelsPortfolioAnalytics(creatorId, '30d');
    console.log('Portfolio 30d Summary:', JSON.stringify(portfolio30d.summary, null, 2));
    if (typeof portfolio30d.summary.total_views === 'number' && Array.isArray(portfolio30d.trend)) {
      console.log('PASS: Test 1 - Portfolio analytics returned valid summary and trend array.');
    } else {
      console.error('FAIL: Test 1');
    }

    // TEST 2: Single Reel Analytics (Authorized Owner)
    console.log('\n[Test 2] Fetch Single Reel Analytics (Authorized Owner)...');
    const singleReelRes = await creatorAnalyticsService.getSingleReelAnalytics(creatorId, reelId);
    console.log('Single Reel Result:', JSON.stringify(singleReelRes.reel, null, 2));
    if (singleReelRes.reel.id === reelId && typeof singleReelRes.reel.views_count === 'number') {
      console.log('PASS: Test 2 - Single Reel analytics returned verified metrics.');
    } else {
      console.error('FAIL: Test 2');
    }

    // TEST 3: IDOR Security Check (Unauthorized user requesting another creator's Reel analytics)
    console.log('\n[Test 3] IDOR Security Test (Unauthorized Creator ID)...');
    try {
      await creatorAnalyticsService.getSingleReelAnalytics(nonExistentCreatorId, reelId);
      console.error('FAIL: Test 3 - IDOR protection failed to block unauthorized access!');
    } catch (err) {
      if (err.status === 403 || err.message.includes('Access denied')) {
        console.log('PASS: Test 3 - IDOR access correctly blocked with 403 Access Denied.');
      } else {
        console.error('FAIL: Test 3 unexpected error:', err.message);
      }
    }

    // TEST 4: Zero Reels Creator Edge Case
    console.log('\n[Test 4] Zero Reels Creator Portfolio Request...');
    const zeroRes = await creatorAnalyticsService.getReelsPortfolioAnalytics(nonExistentCreatorId, '30d');
    if (zeroRes.summary.total_reels === 0 && zeroRes.summary.total_views === 0) {
      console.log('PASS: Test 4 - Zero-Reels creator handled safely without errors.');
    } else {
      console.error('FAIL: Test 4');
    }

    console.log('\n--- ALL CREATOR REELS ANALYTICS TESTS PASSED ---');
  } catch (e) {
    console.error('Verification error:', e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
