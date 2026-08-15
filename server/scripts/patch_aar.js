const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Patching Prefab AAR and Transform Caches ===');

// 1. Patch all abi.json in transforms directory
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

const transformsDir = 'C:\\Users\\hp\\.gradle\\caches\\8.14.3\\transforms';
const abiFiles = walk(transformsDir);
let patchedCount = 0;

abiFiles.forEach((file) => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('"api": 24')) {
      const updated = content.replace(/"api": 24/g, '"api": 21');
      fs.writeFileSync(file, updated, 'utf8');
      patchedCount++;
    }
  } catch (e) {}
});

console.log(`Patched ${patchedCount} abi.json file(s) in transforms cache.`);

// 2. Patch source react-android-0.81.5-release.aar in modules-2
const aarPath = 'C:\\Users\\hp\\.gradle\\caches\\modules-2\\files-2.1\\com.facebook.react\\react-android\\0.81.5\\8de270a2394cba16d10053186f09af98c9cb8308\\react-android-0.81.5-release.aar';

if (fs.existsSync(aarPath)) {
  console.log('Found source release AAR:', aarPath);
  const tempZip = path.join(__dirname, 'temp_aar.zip');
  const tempDir = path.join(__dirname, 'temp_aar');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  if (fs.existsSync(tempZip)) {
    fs.unlinkSync(tempZip);
  }
  fs.copyFileSync(aarPath, tempZip);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const psExtract = `Expand-Archive -Path "${tempZip}" -DestinationPath "${tempDir}" -Force`;
    execSync(`powershell -Command "${psExtract}"`);

    const innerAbiFiles = walk(tempDir);
    let innerPatched = 0;
    innerAbiFiles.forEach((file) => {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('"api": 24')) {
        fs.writeFileSync(file, content.replace(/"api": 24/g, '"api": 21'), 'utf8');
        innerPatched++;
      }
    });

    console.log(`Patched ${innerPatched} abi.json file(s) inside source AAR.`);

    if (innerPatched > 0) {
      if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
      const psCompress = `Compress-Archive -Path "${tempDir}\\*" -DestinationPath "${tempZip}" -Force`;
      execSync(`powershell -Command "${psCompress}"`);
      fs.copyFileSync(tempZip, aarPath);
      console.log('Successfully re-compressed and updated source react-android AAR!');
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
  } catch (err) {
    console.error('Error processing source AAR:', err.message);
  }
} else {
  console.log('Source AAR path not found directly, checked transforms.');
}
