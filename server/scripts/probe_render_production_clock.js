'use strict';

const axios = require('axios');
const https = require('https');

const agent = new https.Agent({ family: 4, timeout: 10000 });

async function probeRenderProductionClock() {
  console.log('── PROBING PRODUCTION RENDER API & GATEWAY CLOCKS ──\n');

  // 1. Probe Gateway Server (gateway.notestandard.com/health)
  let gwMs = null;
  let gwDateStr = null;
  try {
    const gwStart = Date.now();
    const gwRes = await axios.get('https://gateway.notestandard.com/health', { httpsAgent: agent, timeout: 10000 });
    const gwLatency = Date.now() - gwStart;
    gwDateStr = gwRes.headers['date'] || gwRes.data?.timestamp;
    gwMs = new Date(gwDateStr).getTime();
    console.log(`1. GATEWAY PROXY (gateway.notestandard.com):`);
    console.log(`   - HTTP Status: ${gwRes.status}`);
    console.log(`   - Date Header: "${gwRes.headers['date']}"`);
    console.log(`   - Data Timestamp: "${gwRes.data?.timestamp}"`);
    console.log(`   - Parsed Milliseconds: ${gwMs}`);
    console.log(`   - Latency: ${gwLatency}ms`);
  } catch (err) {
    console.error(`1. GATEWAY PROXY ERROR: ${err.message}`);
  }

  // 2. Probe Render Production Backend (note-standard-api.onrender.com/api/provider-health)
  let renderMs = null;
  let renderDateStr = null;
  try {
    const renderStart = Date.now();
    const renderRes = await axios.get('https://note-standard-api.onrender.com/api/provider-health', { httpsAgent: agent, timeout: 15000 });
    const renderLatency = Date.now() - renderStart;
    renderDateStr = renderRes.headers['date'];
    renderMs = new Date(renderDateStr).getTime();
    console.log(`\n2. PRODUCTION RENDER API (note-standard-api.onrender.com):`);
    console.log(`   - HTTP Status: ${renderRes.status}`);
    console.log(`   - Date Header: "${renderRes.headers['date']}"`);
    console.log(`   - Response Body Gateway Reachable: ${renderRes.data?.gatewayReachable}`);
    console.log(`   - Response Body Fincra Reachable: ${renderRes.data?.fincraConnectivity}`);
    console.log(`   - Parsed Milliseconds: ${renderMs}`);
    console.log(`   - Latency: ${renderLatency}ms`);
  } catch (err) {
    console.log(`\n2. PRODUCTION RENDER API PROBE: ${err.message}`);
    if (err.response) {
      console.log(`   - Status: ${err.response.status}`);
      console.log(`   - Date Header: "${err.response.headers['date']}"`);
      if (err.response.headers['date']) {
        renderDateStr = err.response.headers['date'];
        renderMs = new Date(renderDateStr).getTime();
      }
    }
  }

  // 3. Compare Render vs Gateway
  if (renderMs && gwMs) {
    const deltaMs = renderMs - gwMs;
    const deltaSec = Math.round(deltaMs / 1000);
    console.log(`\n── EMPIRICAL RENDER VS GATEWAY CLOCK COMPARISON ──`);
    console.log(`  Render Production Server Clock:  ${new Date(renderMs).toISOString()} (${renderMs})`);
    console.log(`  Gateway Proxy Server Clock:       ${new Date(gwMs).toISOString()} (${gwMs})`);
    console.log(`  Absolute Clock Delta:             ${Math.abs(deltaSec)} seconds`);

    if (Math.abs(deltaSec) <= 300) {
      console.log(`  ✅ PRODUCTION RENDER CLOCK IS WITHIN GATEWAY 5-MINUTE TOLERANCE (Delta: ${Math.abs(deltaSec)}s <= 300s)`);
    } else {
      console.log(`  ❌ PRODUCTION RENDER CLOCK DRIFT EXCEEDS TOLERANCE BY ${Math.abs(deltaSec) - 300}s`);
    }
  } else {
    console.log('\n⚠️  Could not compute exact delta because one or both timestamps were unavailable.');
  }
}

probeRenderProductionClock();
