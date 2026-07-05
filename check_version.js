const http = require('https');

function checkVersion() {
  http.get('https://realtime-gateway-gsb5.onrender.com/internal/version', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Data: ${data}`);
    });
  }).on('error', err => console.error(err));
}

checkVersion();
