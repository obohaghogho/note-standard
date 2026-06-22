const fs = require('fs');
const path = require('path');

const ROOT_DIR = 'd:\\Users\\Manuel\\OneDrive\\Desktop\\note-standard';
const DIRS_TO_SCAN = ['server', 'mobile', 'frontend', 'shared'];

function scanDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === 'dist' || file === 'build' || file.startsWith('.')) continue;
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      scanDir(filePath, fileList);
    } else {
      if (filePath.match(/\.(js|jsx|ts|tsx)$/)) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

const allFiles = [];
DIRS_TO_SCAN.forEach(dir => {
  scanDir(path.join(ROOT_DIR, dir), allFiles);
});

const results = [];

// Tables known to be large -> High Risk
// Tables known to be small -> Low Risk
const HIGH_RISK_TABLES = ['transactions', 'messages', 'message_events', 'notes', 'ledger_entries', 'ledger_transactions_v6', 'payout_requests'];
const MEDIUM_RISK_TABLES = ['profiles', 'users', 'wallets', 'wallets_store', 'wallets_v6', 'reconciliation_proposals', 'ads'];

allFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Simple check for .select('*')
    if (line.match(/\.select\s*\(\s*['"`]\*['"`]\s*\)/)) {
      
      // Try to find the table name by looking backwards up to 5 lines for .from('...')
      let tableName = 'unknown_table';
      for (let j = i; j >= Math.max(0, i - 5); j--) {
        const fromMatch = lines[j].match(/\.from\s*\(\s*['"`](.*?)['"`]\s*\)/);
        if (fromMatch) {
          tableName = fromMatch[1];
          break;
        }
      }

      // Check if there's a limit or single
      let hasPagination = false;
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 5); j++) {
        if (lines[j].match(/\.limit\s*\(/) || lines[j].match(/\.single\s*\(/) || lines[j].match(/\.maybeSingle\s*\(/) || lines[j].match(/\.range\s*\(/) || lines[j].match(/\.head\s*\(/)) {
          hasPagination = true;
          break;
        }
      }

      let risk = 'Low';
      let riskScore = 1;
      
      if (!hasPagination) {
         if (HIGH_RISK_TABLES.includes(tableName)) {
            risk = 'High';
            riskScore = 3;
         } else if (MEDIUM_RISK_TABLES.includes(tableName)) {
            risk = 'Medium';
            riskScore = 2;
         } else if (tableName === 'unknown_table') {
            risk = 'Medium'; // Default unknown to medium
            riskScore = 2;
         }
      } else {
         risk = 'Low (Paginated/Single)';
         riskScore = 0;
      }

      results.push({
        file: file.replace(ROOT_DIR, ''),
        lineNum: i + 1,
        tableName,
        codeSnippet: line.trim(),
        hasPagination,
        risk,
        riskScore
      });
    }
  }
});

// Sort by Risk, then by Table Name, then File
results.sort((a, b) => {
  if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
  if (a.tableName !== b.tableName) return a.tableName.localeCompare(b.tableName);
  return a.file.localeCompare(b.file);
});

fs.writeFileSync(path.join(ROOT_DIR, 'select_star_report.json'), JSON.stringify(results, null, 2));
