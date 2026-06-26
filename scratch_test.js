const http = require('http');
const https = require('https');

const targetUrl = new URL('http://localhost:5000/internal/push');
const payloadBody = JSON.stringify({ test: true });

console.log('hostname:', targetUrl.hostname);
console.log('port:', targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80));
console.log('path:', targetUrl.pathname);
