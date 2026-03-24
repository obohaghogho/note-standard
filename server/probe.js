const fs = require('fs');
const path = require('path');

console.log('Current __dirname:', __dirname);
console.log('Current process.cwd():', process.cwd());

const targetPath = path.resolve(__dirname, 'services/payment/providers/PaystackProvider.js');
console.log('Target Path:', targetPath);
console.log('Exists:', fs.existsSync(targetPath));

try {
  const PaystackProvider = require('./services/payment/providers/PaystackProvider.js');
  console.log('Successfully required PaystackProvider');
} catch (err) {
  console.error('Failed to require PaystackProvider:', err.message);
  console.error(err.stack);
}
