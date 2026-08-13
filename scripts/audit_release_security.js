const fs = require('fs');
const path = require('path');

const MOBILE_SRC = path.join(__dirname, '..', 'mobile', 'src');

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
    } else if (filePath.match(/\.(js|jsx|ts|tsx|json)$/)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

console.log('--- Starting Mobile Release Security Audit ---');
const files = scanDirectory(MOBILE_SRC);
let violations = [];

files.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(path.join(__dirname, '..'), filePath);

  PROHIBITED_PATTERNS.forEach(({ pattern, name }) => {
    if (pattern.test(content)) {
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          violations.push({
            file: relativePath,
            line: index + 1,
            type: name,
            code: line.trim()
          });
        }
      });
    }
  });
});

const appJsonPath = path.join(__dirname, '..', 'mobile', 'app.json');
if (fs.existsSync(appJsonPath)) {
  const appJsonContent = fs.readFileSync(appJsonPath, 'utf8');
  PROHIBITED_PATTERNS.forEach(({ pattern, name }) => {
    if (pattern.test(appJsonContent)) {
      violations.push({
        file: 'mobile/app.json',
        line: 1,
        type: name,
        code: 'Found in app.json'
      });
    }
  });
}

console.log(`Scanned ${files.length} files in mobile/src.`);
if (violations.length === 0) {
  console.log('✅ ZERO prohibited endpoints, emulator IPs, or mock financial patterns found!');
  process.exit(0);
} else {
  console.error(`❌ FOUND ${violations.length} VIOLATIONS:`);
  console.error(JSON.stringify(violations, null, 2));
  process.exit(1);
}
