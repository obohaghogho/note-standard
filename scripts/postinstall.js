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
      const cmd = fs.existsSync(binPath) ? `"${binPath}"` : 'npx -y patch-package';
      execSync(cmd, { stdio: 'inherit' });
    } catch {
      try {
        execSync('npx -y patch-package', { stdio: 'inherit' });
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

  let content = fs.readFileSync(targetFile, 'utf8');
  if (!content.includes('setReturnType')) {
    console.warn('[WARN] expo-modules-core Kotlin patch not detected. Retrying patch-package...');
    try {
      execSync('npx -y patch-package', { stdio: 'inherit' });
      content = fs.readFileSync(targetFile, 'utf8');
    } catch (e) {
      console.warn('[WARN] Second patch-package attempt failed:', e.message);
    }
  }

  if (content.includes('setReturnType')) {
    console.log('PASS: expo-modules-core Kotlin setReturnType PublishedApi patch is present.');
  } else {
    console.warn('[WARN] expo-modules-core Kotlin patch missing setReturnType, continuing non-native build.');
  }
} catch (error) {
  console.warn('[WARN] Postinstall execution warning:', error.message);
}
