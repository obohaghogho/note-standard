const aiSupportService = require('../services/aiSupportService');
const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

const serviceSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const sampleQuestions = [
  { module: "Authentication", query: "How do I setup 2FA authenticator on my account?" },
  { module: "Wallet", query: "Where can I locate USD payments or my USD balance?" },
  { module: "Crypto", query: "How long do Bitcoin deposits take to confirm?" },
  { module: "Workspace", query: "How do I summarize a long note using AI?" },
  { module: "Teams", query: "How do I invite members to my team?" },
  { module: "Messaging", query: "What do the double blue ticks mean in chat?" },
  { module: "Monetization", query: "How does the 7% affiliate referral program work?" },
  { module: "Settings", query: "How can I change the app theme to Dark Mode?" },
  { module: "Troubleshooting", query: "What should I do if my bank transfer deposit is delayed?" }
];

async function testAllKnowledgeModules() {
  console.log("=========================================================");
  console.log("  TESTING GROQ AI KNOWLEDGE ACROSS ALL 10 MODULES        ");
  console.log("=========================================================\n");

  const testUserId = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';
  const dummyConvId = '06724362-3e3d-4524-aa7d-006d9a39e5d6';

  for (const item of sampleQuestions) {
    console.log(`Testing Module: [${item.module}]`);
    console.log(`Query: "${item.query}"`);

    const response = await aiSupportService.processSupportMessage(
      dummyConvId,
      item.query,
      testUserId
    );

    console.log(`Intent: ${response.operationalMetadata?.intent}`);
    console.log(`Escalated: ${response.isEscalated}`);
    console.log(`Confidence: ${response.operationalMetadata?.confidence}`);
    console.log(`AI Answer: "${response.text}"`);
    console.log(`---------------------------------------------------------\n`);
  }
}

testAllKnowledgeModules().then(() => process.exit(0)).catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
