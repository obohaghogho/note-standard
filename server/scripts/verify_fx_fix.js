require('dotenv').config();
const fxService = require('../services/fxService');

async function verify() {
  const ts = new Date().toISOString();
  console.log('[' + ts + '] Running post-fix FX verification...');
  
  // Test 1: getAllRates should work (CoinGecko primary now)
  const all = await fxService.getAllRates('USD');
  
  console.log('\n--- RATES ---');
  for (const [sym, rate] of Object.entries(all.rates)) {
    const meta = all.metadata[sym] || {};
    console.log('  ' + sym + ': ' + rate + ' (mode=' + meta.mode + ', canExecute=' + meta.canExecute + ')');
  }
  
  console.log('\n--- FROZEN ASSETS ---', all.frozenAssets);
  console.log('--- EVALUATION ID ---', all.evaluationId);
  
  // Test 2: Verify fiat is still Fincra
  const ngnRate = await fxService.getValidatedRate('USD', 'NGN');
  console.log('\n--- USD/NGN VALIDATED RATE ---');
  console.log(JSON.stringify(ngnRate, null, 2));
  
  // Test 3: Verify crypto uses CoinGecko now
  const btcRate = await fxService.getValidatedRate('BTC', 'USD');
  console.log('\n--- BTC/USD VALIDATED RATE ---');
  console.log(JSON.stringify(btcRate, null, 2));
  
  console.log('\n[DONE] Verification complete.');
}

verify().catch(console.error);
