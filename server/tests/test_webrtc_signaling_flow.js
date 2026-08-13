'use strict';

const io = require('socket.io-client');
const axios = require('axios');

const API_URL = process.env.API_URL || 'https://api.notestandard.com';
const GATEWAY_URL = process.env.GATEWAY_URL || 'https://gateway.notestandard.com';

async function runWebRTCAudit() {
  console.log('--- Starting WebRTC Audio & Video Signaling & ICE Audit ---');

  // 1. Audit ICE Server Resolution via API server endpoint
  console.log('1. Fetching ICE/STUN/TURN server configuration from API server...');
  try {
    const iceRes = await axios.get(`${API_URL}/api/webrtc/ice-servers`, { timeout: 8000 });
    console.log('✅ ICE Servers Response:', JSON.stringify(iceRes.data, null, 2));
  } catch (iceErr) {
    console.warn('⚠️ API ICE endpoint warning:', iceErr.message);
  }

  // 2. Audit Direct Gateway ICE endpoint
  console.log('2. Fetching ICE/STUN/TURN server configuration from Gateway...');
  try {
    const iceGwRes = await axios.get(`${GATEWAY_URL}/webrtc/ice-servers`, { timeout: 8000 });
    console.log('✅ Gateway ICE Servers Response:', JSON.stringify(iceGwRes.data, null, 2));
  } catch (iceGwErr) {
    console.warn('⚠️ Gateway ICE endpoint warning:', iceGwErr.message);
  }

  console.log('3. WebRTC Architecture Audit Complete.');
  process.exit(0);
}

runWebRTCAudit().catch(err => {
  console.error('❌ WebRTC Audit Error:', err.message);
  process.exit(1);
});
