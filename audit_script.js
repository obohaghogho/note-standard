/* eslint-disable */
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

const issues = [];

allFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  let inUseEffect = false;
  let useEffectStartLine = 0;
  let useEffectContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 1. Check for .select('*')
    if (line.match(/\.select\(['"`]\*['"`]\)/)) {
      if (!line.match(/\.limit\(/) && !line.match(/\.single\(/) && !line.match(/\.maybeSingle\(/) && !content.slice(Math.max(0, i * 100), Math.min(content.length, i * 100 + 500)).match(/\.limit\(/)) {
          // Check following lines for limit or single just in case it's multiline
          let hasLimit = false;
          for(let j=i; j < Math.min(i+5, lines.length); j++) {
              if (lines[j].match(/\.limit\(/) || lines[j].match(/\.single\(/) || lines[j].match(/\.maybeSingle\(/) || lines[j].match(/\.range\(/)) {
                  hasLimit = true;
                  break;
              }
          }
          if (!hasLimit) {
              issues.push({
                file: file.replace(ROOT_DIR, ''),
                lineNum,
                type: 'unlimited_select_star',
                code: line.trim()
              });
          }
      }
    }

    // 2. Check for .subscribe()
    if (line.match(/\.subscribe\(/)) {
       issues.push({
         file: file.replace(ROOT_DIR, ''),
         lineNum,
         type: 'realtime_subscription',
         code: line.trim()
       });
    }

    // 3. Polling
    if (line.match(/setInterval\(/)) {
       // Check next few lines for supabase or fetch
       let hasFetch = false;
       for(let j=i; j < Math.min(i+10, lines.length); j++) {
           if (lines[j].match(/supabase|fetch|axios/)) {
               hasFetch = true;
               break;
           }
       }
       if (hasFetch) {
           issues.push({
             file: file.replace(ROOT_DIR, ''),
             lineNum,
             type: 'polling',
             code: line.trim()
           });
       }
    }
    
    // 4. In useEffect loops
    if (line.match(/useEffect\(/)) {
        // Just record that we saw a useEffect
        issues.push({
            file: file.replace(ROOT_DIR, ''),
            lineNum,
            type: 'useEffect',
            code: line.trim()
        })
    }
  }
});

fs.writeFileSync(path.join(ROOT_DIR, 'audit_results.json'), JSON.stringify(issues, null, 2));
console.log('Found', issues.length, 'potential issues.');
