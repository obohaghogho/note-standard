const https = require('https');

// Test with user 8677bd57 who has a RECENT FCM subscription (Jun 21)
const body = JSON.stringify({
  userId: '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd',
  title: 'Diagnostic Test',
  body: 'Testing push pipeline end-to-end',
  payload: {
    type: 'chat_message',
    conversationId: 'test-conv',
    messageId: 'test-msg-diag-002',
    url: '/dashboard/notifications',
    recipientId: '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd',
    targetUserId: '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd',
  }
});

const req = https.request({
  hostname: 'realtime-gateway-gsb5.onrender.com',
  port: 443,
  path: '/internal/push/diagnose',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  timeout: 30000
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('\n=== DIAGNOSTIC RESULT ===');
      console.log('Status:', parsed.ok ? '✅ OK' : '❌ FAILED');
      if (parsed.error) console.log('Error:', parsed.error);
      console.log('\n=== GATEWAY LOGS ===');
      (parsed.logs || []).forEach(l => console.log(`[${l.level.toUpperCase()}]`, l.msg));
    } catch(e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', err => console.error('Request failed:', err.message));
req.on('timeout', () => { console.error('Request timed out'); req.destroy(); });
req.write(body);
req.end();
