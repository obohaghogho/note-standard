/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  // 1. Run patch-package if patches directory exists
  const patchesDir = path.join(__dirname, '../patches');
  if (fs.existsSync(patchesDir)) {
    try {
      const binPath = path.join(__dirname, '../node_modules/.bin/patch-package');
      const cmd = fs.existsSync(binPath) ? `"${binPath}"` : 'npx --no-install patch-package';
      execSync(cmd, { stdio: 'inherit' });
    } catch {
      try {
        execSync('npx patch-package', { stdio: 'inherit' });
      } catch {
        console.warn('[WARN] patch-package execution skipped or non-zero exit.');
      }
    }
  }

  // 2. Perform assertion only if expo-modules-core is installed
  const packageDir = path.join(__dirname, '../node_modules/expo-modules-core');
  const targetFile = path.join(packageDir, 'android/src/main/java/expo/modules/kotlin/jni/JavaScriptFunction.kt');

  if (!fs.existsSync(packageDir)) {
    console.log('[INFO] expo-modules-core not installed; skipping native Kotlin patch assertion.');
    process.exit(0);
  }

  if (!fs.existsSync(targetFile)) {
    console.warn('[WARN] expo-modules-core installed but JavaScriptFunction.kt missing.');
    process.exit(0);
  }

  const content = fs.readFileSync(targetFile, 'utf8');
  if (!content.includes('setReturnType')) {
    console.error('FATAL: expo-modules-core Kotlin patch was NOT applied (setReturnType method missing).');
    process.exit(1);
  }

  console.log('PASS: expo-modules-core Kotlin setReturnType PublishedApi patch is present.');
} catch (error) {
  console.error('Postinstall error:', error.message);
  process.exit(1);
}
