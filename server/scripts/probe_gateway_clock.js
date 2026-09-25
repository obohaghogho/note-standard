'use strict';

const axios = require('axios');
const https = require('https');

const agent = new https.Agent({ family: 4 });

async function probeGatewayClock() {
  console.log('── PROBING GATEWAY SERVER CLOCK (https://gateway.notestandard.com/health) ──');

  const startLocalMs = Date.now();
  const startLocalIso = new Date().toISOString();

  try {
    const res = await axios.get('https://gateway.notestandard.com/health', {
      httpsAgent: agent,
      timeout: 10000,
    });

    const endLocalMs = Date.now();

    console.log('\nHTTP Response Status:', res.status);
    console.log('Gateway Response Data:', JSON.stringify(res.data, null, 2));
    console.log('\nGateway HTTP Response Headers:');
    Object.keys(res.headers).forEach(k => {
      console.log(`  - ${k}: ${res.headers[k]}`);
    });

    const gatewayDateHeader = res.headers['date'];
    console.log(`\nGateway Date Header: "${gatewayDateHeader}"`);

    if (gatewayDateHeader) {
      const gatewayMs = new Date(gatewayDateHeader).getTime();
      console.log(`Gateway Parsed Unix Milliseconds: ${gatewayMs}`);
      console.log(`Gateway Parsed UTC String: ${new Date(gatewayMs).toISOString()}`);
      console.log(`Local Machine Time at Request Start: ${startLocalIso} (${startLocalMs})`);

      const diffMs = gatewayMs - startLocalMs;
      const diffSec = Math.round(diffMs / 1000);
      const diffDays = (diffSec / 86400).toFixed(2);

      console.log(`\n── EMPIRICAL CLOCK DIFFERENCE ANALYSIS ──`);
      console.log(`  Local OS Clock (Test Environment): ${startLocalIso}`);
      console.log(`  Gateway Server Clock (DigitalOcean Egress): ${new Date(gatewayMs).toISOString()}`);
      console.log(`  Absolute Time Delta: ${Math.abs(diffSec)} seconds (~${diffDays} days)`);
      if (Math.abs(diffSec) > 300) {
        console.log(`  ⚠️  CLOCK DRIFT EXCEEDS GATEWAY 300-SECOND TOLERANCE BY ${Math.abs(diffSec) - 300} SECONDS!`);
      } else {
        console.log(`  ✅ Clock is within 300-second tolerance.`);
      }
    }

  } catch (err) {
    console.error('Probe Error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response headers:', err.response.headers);
    }
  }
}

probeGatewayClock();
