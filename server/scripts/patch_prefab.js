const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          results = results.concat(walk(filePath));
        } else if (file === 'abi.json') {
          results.push(filePath);
        }
      } catch (e) {}
    });
  } catch (e) {}
  return results;
}

const cacheDir = 'C:\\Users\\hp\\.gradle\\caches\\8.14.3\\transforms';
console.log('Searching for abi.json files in:', cacheDir);
const files = walk(cacheDir);
let updatedCount = 0;

files.forEach((file) => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('"api": 24')) {
      const updated = content.replace(/"api": 24/g, '"api": 21');
      fs.writeFileSync(file, updated, 'utf8');
      console.log('Patched:', file);
      updatedCount++;
    }
  } catch (e) {
    console.error('Error patching', file, e.message);
  }
});

console.log(`Successfully patched ${updatedCount} abi.json file(s).`);
