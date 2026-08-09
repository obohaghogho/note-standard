require('dotenv').config();
const nowpaymentsService = require('../services/nowpaymentsService');

async function testFX() {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Requesting USD -> NGN from NOWPayments...`);
    
    // The exact method consumed by NoteStandard
    const estimate = await nowpaymentsService.getExchangeEstimate('usd', 'ngn', 1);
    
    console.log('\n--- EXACT RATE CONSUMED BY NOTESTANDARD ---');
    console.log(`1 USD = ${estimate.rate} NGN`);
    
    console.log('\n--- PARSED RESPONSE ---');
    console.log(JSON.stringify(estimate, null, 2));

  } catch (err) {
    console.error('FX Test Failed:', err);
  }
}

testFX();
