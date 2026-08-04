/* eslint-disable */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { createClient } = require('@supabase/supabase-js');
const aiSupportService = require('../server/services/aiSupportService');
const supportService = require('../server/services/supportService');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runLiveAiSupportAudit() {
  console.log('=== STARTING LIVE END-TO-END AI SUPPORT PIPELINE AUDIT ===\n');

  const aghoghoUserId = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';
  const testConvId = 'dfd744b5-0b20-4e2e-888a-3c35e27dc342';

  // Ensure conversation status is open for testing
  await supabase
    .from('conversations')
    .update({ support_status: 'open', updated_at: new Date().toISOString() })
    .eq('id', testConvId);

  const auditPrompts = [
    { category: 'Wallet', prompt: 'How can I fund my NGN wallet via bank transfer?' },
    { category: 'Wallet', prompt: 'Is the AUD fiat currency available for payment right now?' },
    { category: 'Monetization/Ads', prompt: 'Where do I go in Settings to create an ad for my product?' },
    { category: 'Monetization/Ads', prompt: 'Do I have to fund my ad account before I can launch an ad?' },
    { category: 'PWA/Mobile', prompt: 'How do I install NoteStandard as a PWA app on my iPhone?' },
    { category: 'Push Notifications', prompt: 'Why am I not getting push notifications when my app is closed?' },
    { category: 'Crypto', prompt: 'What is the MEMO or Destination Tag required for XRP or TON crypto deposits?' },
    { category: 'KYC/Auth', prompt: 'Is my BVN and NIN secure when doing Tier 2 KYC verification?' },
    { category: 'Security/PIN', prompt: 'How do I reset my 4-digit transaction PIN if I forgot it?' },
    { category: 'Teams', prompt: 'How do I create a team workspace and invite members?' },
    { category: 'Support SLA', prompt: 'What happens when my support chat ticket is marked resolved?' },
    { category: 'Crypto Swap', prompt: 'How do I convert or swap USDT to NGN or USD in NoteStandard?' }
  ];

  let totalTests = auditPrompts.length;
  let passedCount = 0;
  let escalationCount = 0;
  let errorCount = 0;

  for (let i = 0; i < auditPrompts.length; i++) {
    const item = auditPrompts[i];
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`[Test #${i + 1}/${totalTests}] [Domain: ${item.category}]`);
    console.log(`User Question: "${item.prompt}"`);

    // 3-second pause between requests to prevent Groq API rate limit
    await new Promise(resolve => setTimeout(resolve, 3500));

    try {
      const botSenderId = '00000000-0000-0000-0000-000000000000';
      const result = await aiSupportService.processSupportMessage(
        testConvId,
        item.prompt,
        aghoghoUserId,
        botSenderId
      );

      if (!result) {
        console.error(`❌ RESULT: API Returned Null/Empty response.`);
        errorCount++;
        continue;
      }

      console.log(`   Knowledge Articles Hit: ${JSON.stringify(result.aiDebugMetadata?.articles_used || [])}`);
      console.log(`   LLM Model Used: ${result.aiDebugMetadata?.model || 'Unknown'}`);
      console.log(`   Response Latency: ${result.aiDebugMetadata?.latency}ms`);
      console.log(`   Is Escalated to Specialist: ${result.isEscalated ? '⚠️ YES (Escalated)' : '✅ NO (AI Answered directly)'}`);
      console.log(`   AI Response Text:\n   "${result.text.replace(/\n/g, ' ')}"`);

      if (!result.isEscalated && result.text && !result.text.includes("connect this conversation to the support team")) {
        passedCount++;
        console.log(`🎯 STATUS: PASSED (AI Answered directly without escalation)`);
      } else {
        escalationCount++;
        console.warn(`⚠️ STATUS: ESCALATED TO HUMAN AGENT SPECIALIST`);
      }
    } catch (err) {
      errorCount++;
      console.error(`❌ EXCEPTION: ${err.message}`);
    }
  }

  console.log(`\n================================================================================`);
  console.log(`=== AUDIT SUMMARY RESULTS ===`);
  console.log(`Total Scenarios Tested: ${totalTests}`);
  console.log(`Direct AI Responses (No Escalation): ${passedCount}/${totalTests} (${Math.round((passedCount/totalTests)*100)}%)`);
  console.log(`Escalated to Human Specialist: ${escalationCount}/${totalTests}`);
  console.log(`Execution Errors: ${errorCount}`);

  if (passedCount === totalTests) {
    console.log(`\n🎉 PERFECT SCORE! 100% CONFIDENCE: AI SUPPORT IS ANSWERING ALL QUESTIONS DIRECTLY WITHOUT ESCALATION!`);
    process.exit(0);
  } else {
    console.error(`\n⚠️ AUDIT FAILED: ${escalationCount} questions were redirected to human specialists or errored out.`);
    process.exit(1);
  }
}

runLiveAiSupportAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
