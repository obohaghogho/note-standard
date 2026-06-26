const http = require('http');

const payloadBody = JSON.stringify({
  userId: 'test-user-id',
  title: 'Test Title',
  body: 'Test Body',
  payload: { type: 'chat_message' }
});

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/internal/push',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payloadBody)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log("Response:", res.statusCode, data);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(payloadBody);
req.end();
