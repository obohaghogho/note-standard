const path = require('path');
require('../config/env');
const Groq = require('groq-sdk');

async function runGroqModelAudit() {
  console.log("=================================================");
  console.log("   NOTESTANDARD GROQ AI MODEL AUDIT (GPT OSS 20B)");
  console.log("=================================================");
  
  const apiKey = process.env.GROQ_API_KEY;
  const targetModel = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  console.log(`[Config Check] GROQ_API_KEY present: ${!!apiKey}`);
  console.log(`[Config Check] Target Model ID: ${targetModel}`);
  console.log("-------------------------------------------------");

  if (!apiKey) {
    console.error("❌ ERROR: GROQ_API_KEY is not set in environment.");
    process.exit(1);
  }

  const groq = new Groq({ apiKey });

  const auditResults = {
    notesAssist: false,
    financialJson: false,
    spaceAi: false,
    latencyMs: 0,
    modelReturned: null
  };

  // 1. Audit Notes AI Assist & General Completion
  console.log(`\n[Test 1/3] Testing Notes AI Assist module...`);
  const t0 = Date.now();
  try {
    const completion = await groq.chat.completions.create({
      model: targetModel,
      messages: [
        { role: "system", content: "Provide a concise summary of the following note content. Respond directly with clean resulting note text." },
        { role: "user", content: "Note Title: Q3 Strategy\nNote Content: Expand cross-border NGN payments, finalize BaaS integration with Anchor, and complete compliance audits by Q3." }
      ],
      temperature: 0.3,
      max_tokens: 200
    });

    const latency = Date.now() - t0;
    const responseText = completion.choices[0]?.message?.content || "";
    const modelUsed = completion.model || targetModel;

    console.log(`✅ [Test 1 PASS] Latency: ${latency}ms | Model: ${modelUsed}`);
    console.log(`   Response Output:\n   "${responseText.trim().replace(/\n/g, ' ')}"`);

    auditResults.notesAssist = true;
    auditResults.latencyMs = latency;
    auditResults.modelReturned = modelUsed;
  } catch (err) {
    console.error(`❌ [Test 1 FAIL] Notes AI assist failed: ${err.message}`);
  }

  // 2. Audit Financial Controller JSON Mode
  console.log(`\n[Test 2/3] Testing Financial Ledger AI Insights (JSON Mode)...`);
  try {
    const systemPrompt = `You are NoteStandard NFI's Financial Intel AI. Analyze the user's recent double-entry ledger activities and generate spending insights, budget suggestions, cash flow predictions, a financial health score (0-100), and a risk assessment. Output must be valid JSON matching this schema:
{
  "spendingScore": 85,
  "forecast": "Steady cash flows",
  "suggestions": ["Save more", "Invest prudently"],
  "riskLevel": "Low",
  "smartCategoryHighlights": { "Transfers": "40%" }
}
Do not return any conversational prefix or suffix. Return ONLY the JSON object.`;

    const jsonCompletion = await groq.chat.completions.create({
      model: targetModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Ledger Context:\nWallet Balance: 1500 USD, 250000 NGN. Recent 5 inflows of 500 USD." }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 300
    });

    const parsed = JSON.parse(jsonCompletion.choices[0]?.message?.content || "{}");
    console.log(`✅ [Test 2 PASS] Valid Financial JSON Insights generated:`);
    console.log(`   Score: ${parsed.spendingScore} | Risk: ${parsed.riskLevel} | Forecast: "${parsed.forecast}"`);
    auditResults.financialJson = true;
  } catch (err) {
    console.error(`❌ [Test 2 FAIL] Financial JSON Mode failed: ${err.message}`);
  }

  // 3. Audit Space Assistant Query
  console.log(`\n[Test 3/3] Testing Space AI Q&A Assistant module...`);
  try {
    const spaceCompletion = await groq.chat.completions.create({
      model: targetModel,
      messages: [
        { role: "system", content: "You are the AI Assistant for Space 'Engineering Hub'. Answer user queries based on context." },
        { role: "user", content: "What is the team focus for August 2026?" }
      ],
      temperature: 0.3,
      max_tokens: 150
    });

    const answer = spaceCompletion.choices[0]?.message?.content || "";
    console.log(`✅ [Test 3 PASS] Space Assistant Answer:`);
    console.log(`   "${answer.trim().replace(/\n/g, ' ')}"`);
    auditResults.spaceAi = true;
  } catch (err) {
    console.error(`❌ [Test 3 FAIL] Space AI module failed: ${err.message}`);
  }

  console.log("\n=================================================");
  console.log("         FULL COMPREHENSIVE AUDIT VERDICT        ");
  console.log("=================================================");
  console.log(`Target Model ID:       ${targetModel}`);
  console.log(`Groq Model Returned:   ${auditResults.modelReturned}`);
  console.log(`Notes AI Assist:       ${auditResults.notesAssist ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Financial JSON AI:     ${auditResults.financialJson ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Space AI Assistant:    ${auditResults.spaceAi ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Latency:               ${auditResults.latencyMs} ms`);
  console.log("=================================================");

  if (auditResults.notesAssist && auditResults.financialJson && auditResults.spaceAi) {
    console.log("\n🎉 ALL TESTS PASSED! 'openai/gpt-oss-20b' is fully operational in NoteStandard!");
    process.exit(0);
  } else {
    console.error("\n⚠️ Audit completed with one or more failures.");
    process.exit(1);
  }
}

runGroqModelAudit();
