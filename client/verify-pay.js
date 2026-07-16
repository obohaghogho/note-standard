import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scriptPath = path.resolve(__dirname, '../scripts/verify-apple-local.js');

if (fs.existsSync(scriptPath)) {
  console.log('[CI/CD] Running Apple Pay verification...');
  try {
    execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Verification script failed:', error.message);
    process.exit(1);
  }
} else {
  console.log('Skipping Apple Pay verification: script not found');
}
