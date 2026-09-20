const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8090;
const FILE_PATH = path.join(__dirname, 'client', 'public', 'tiktok_video3.html');

const server = http.createServer((req, res) => {
  if (fs.existsSync(FILE_PATH)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(FILE_PATH));
  } else {
    res.writeHead(404);
    res.end('File not found');
  }
});

server.listen(PORT, () => {
  console.log(`Video server running at http://localhost:${PORT}`);
});
