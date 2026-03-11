const fs = require('fs');
const filePath = 'server/services/walletService.js';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to \r\n
content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// Remove any previous botched insertion attempt
content = content.replace(/\n\s*\/\/ SAFEGUARD:.*?recipientAddress = undefined;\n\s*\}/s, '');

// Find the target and insert after it
const target = '    const upNetwork = normNetwork;\n';
const safeguard = `    const upNetwork = normNetwork;

    // SAFEGUARD: If recipientAddress looks like a UUID, treat it as recipientId.
    // UUIDs (36 chars) can be misclassified as crypto addresses by old frontend builds.
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!recipientId && recipientAddress && UUID_REGEX.test(recipientAddress)) {
      recipientId = recipientAddress;
      recipientAddress = undefined;
    }
`;

if (content.includes('UUID_REGEX')) {
  // Clean previous attempt first
  content = content.replace(/    \/\/ SAFEGUARD:.*?\n.*?\n.*?UUID_REGEX.*?\n.*?if.*?\n.*?recipientId.*?\n.*?recipientAddress.*?\n.*?\}\n/s, '');
}

content = content.replace(target, safeguard);

// Write back with \r\n
content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, content);
console.log('Done - safeguard patched with correct line endings.');
