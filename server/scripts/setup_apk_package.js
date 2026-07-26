const fs = require('fs');
const path = require('path');

function setupApkFiles() {
  console.log("Setting up NoteStandard APK package files...");

  const targetDirs = [
    path.join(__dirname, '..', '..', 'client', 'public', 'downloads'),
    path.join(__dirname, '..', 'uploads', 'versions')
  ];

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log("Created directory:", dir);
    }
  }

  const clientDownloads = path.join(__dirname, '..', '..', 'client', 'public', 'downloads');
  const serverVersions = path.join(__dirname, '..', 'uploads', 'versions');

  // Ensure NoteStandard.apk and app-release.apk exist in client/public/downloads
  const NoteStandardApk = path.join(clientDownloads, 'NoteStandard.apk');
  const AppReleaseApk = path.join(clientDownloads, 'app-release.apk');
  const ServerVersionApk = path.join(serverVersions, 'NoteStandard_v1.6.8.apk');

  // Dummy binary content if file doesn't exist or is tiny
  const dummyBinaryBuffer = Buffer.from('PK\x03\x04NoteStandard Android Package Build v1.6.8');

  if (!fs.existsSync(NoteStandardApk)) {
    fs.writeFileSync(NoteStandardApk, dummyBinaryBuffer);
    console.log("Created:", NoteStandardApk);
  }

  if (!fs.existsSync(AppReleaseApk)) {
    fs.writeFileSync(AppReleaseApk, dummyBinaryBuffer);
    console.log("Created:", AppReleaseApk);
  }

  if (!fs.existsSync(ServerVersionApk)) {
    fs.writeFileSync(ServerVersionApk, dummyBinaryBuffer);
    console.log("Created:", ServerVersionApk);
  }

  console.log("✅ APK package files successfully set up!");
}

setupApkFiles();
