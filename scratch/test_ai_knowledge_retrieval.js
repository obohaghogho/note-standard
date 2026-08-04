/* eslint-disable */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const aiSupportService = require('../server/services/aiSupportService');

async function testKnowledgeRetrieval() {
  const service = aiSupportService;

  const testQueries = [
    "Is the AUD fiat currency available for payment?",
    "How can I purchase NGN in the wallet dashboard?",
    "How does the advertisement work in this app?",
    "Where can I find the advertisements tab to create an ad?",
    "Do I have to fund my ad account before I can use it?",
    "Why are my push notifications not working on mobile?",
    "How do I install the app as a PWA on my iPhone?",
    "What is the MEMO tag for crypto deposits like XRP or TON?",
    "Is my BVN and NIN safe when verifying Tier 2 KYC?",
    "What happens when a support chat is resolved?"
  ];

  console.log('=== TESTING AI SUPPORT KNOWLEDGE RETRIEVAL ===\n');

  let passed = 0;
  testQueries.forEach((q, idx) => {
    const retrieval = service.retrieveKnowledge(q);
    const hasMatches = retrieval.sources_used.length > 0;
    console.log(`[#${idx + 1}] Query: "${q}"`);
    console.log(`     Matched Sources: ${JSON.stringify(retrieval.sources_used)}`);
    console.log(`     Match Status: ${hasMatches ? '✅ HIT' : '❌ MISS'}\n`);
    if (hasMatches) passed++;
  });

  console.log(`Result: ${passed}/${testQueries.length} test queries matched relevant knowledge articles!`);
  if (passed === testQueries.length) {
    console.log('🎉 ALL KNOWLEDGE RETRIEVAL TESTS PASSED WITH 100% COVERAGE!');
  } else {
    console.error('⚠️ Some queries did not match knowledge articles.');
  }
}

testKnowledgeRetrieval().catch(console.error);
