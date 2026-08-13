const fs = require('fs');
const path = require('path');

const DIRS_TO_SCAN = [
  path.join(__dirname, '..', 'mobile', 'src'),
  path.join(__dirname, '..', 'mobile', 'android', 'app', 'src'),
  path.join(__dirname, '..', 'client', 'src')
];

const PROHIBITED_PATTERNS = [
  { pattern: /localhost/i, name: 'localhost endpoint' },
  { pattern: /127\.0\.0\.1/, name: '127.0.0.1 loopback IP' },
  { pattern: /10\.0\.2\.2/, name: '10.0.2.2 Android emulator loopback IP' },
  { pattern: /staging/i, name: 'staging reference' },
  { pattern: /mockFinancial/i, name: 'mock financial implementation' }
];

function scanDirectory(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === 'dist' || file === 'build' || file.startsWith('.')) continue;
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      scanDirectory(filePath, fileList);
    } else if (filePath.match(/\.(js|jsx|ts|tsx|json|xml|gradle)$/)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

console.log('--- Starting Categorized Security Audit Scanner ---');
let files = [];
DIRS_TO_SCAN.forEach(dir => {
  files = scanDirectory(dir, files);
});

let prodFallbacks = [];
let devDetections = [];

files.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(path.join(__dirname, '..'), filePath);
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    PROHIBITED_PATTERNS.forEach(({ pattern, name }) => {
      if (pattern.test(line)) {
        const item = {
          file: relativePath,
          line: index + 1,
          type: name,
          code: line.trim()
        };

        // Classify: Development-only detection vs Unprotected Production Runtime Fallback
        const isDevDetection = 
          line.includes('import.meta.env.DEV') || 
          line.includes('window.location.hostname') || 
          line.includes('isLocalhostOrSandbox') ||
          line.includes('currentDomain') ||
          line.includes('parsed.hostname') ||
          line.includes('isLocalNet') ||
          line.includes('Accessible on localhost') ||
          line.includes('Developers can test');

        if (isDevDetection) {
          devDetections.push(item);
        } else {
          prodFallbacks.push(item);
        }
      }
    });
  });
});

console.log(`Scanned ${files.length} production files across mobile and client native codebases.`);
console.log(`ℹ️ Allowed Development Detections found: ${devDetections.length}`);

if (prodFallbacks.length === 0) {
  console.log('✅ ZERO unprotected production runtime fallbacks found! Application fails closed to production endpoints.');
  process.exit(0);
} else {
  console.error(`❌ FOUND ${prodFallbacks.length} UNPROTECTED PRODUCTION RUNTIME FALLBACKS:`);
  console.error(JSON.stringify(prodFallbacks, null, 2));
  process.exit(1);
}
