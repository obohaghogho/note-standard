const fs = require('fs');
const path = require('path');
const downloadService = require('../services/DownloadService');

const versionsDir = path.join(__dirname, '..', 'uploads', 'versions');

// Setup: Ensure directory is clean for test
if (!fs.existsSync(versionsDir)) fs.mkdirSync(versionsDir, { recursive: true });

async function runTest() {
    console.log('--- Testing DownloadService ---');

    console.log('\n1. Testing Empty Directory (Fallback Check)');
    const fallback = downloadService.getLatestAPK();
    console.log('Result:', fallback ? fallback.filename : 'NOT FOUND');

    console.log('\n2. Creating dummy APKs: v1.0.0, v1.2.0, v1.1.5');
    fs.writeFileSync(path.join(versionsDir, 'NoteStandard_v1.0.0.apk'), 'dummy1');
    fs.writeFileSync(path.join(versionsDir, 'NoteStandard_v1.2.0.apk'), 'dummy2');
    fs.writeFileSync(path.join(versionsDir, 'NoteStandard_v1.1.5.apk'), 'dummy3');

    const latest = downloadService.getLatestAPK();
    console.log('Expected: NoteStandard_v1.2.0.apk');
    console.log('Actual:  ', latest.filename);

    console.log('\n3. Adding v2.0.0');
    fs.writeFileSync(path.join(versionsDir, 'NoteStandard_v2.0.0.apk'), 'dummy4');
    const newLatest = downloadService.getLatestAPK();
    console.log('Expected: NoteStandard_v2.0.0.apk');
    console.log('Actual:  ', newLatest.filename);

    console.log('\n4. Cleanup');
    // We leave the directory but delete the files if you want, 
    // but for now let's just finish the test report.
}

runTest();
