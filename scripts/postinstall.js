const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  // 1. Run patch-package if patches directory exists
  if (fs.existsSync(path.join(__dirname, '../patches'))) {
    try {
      execSync('npx patch-package', { stdio: 'inherit' });
    } catch (err) {
      console.warn('[WARN] patch-package execution returned non-zero exit code.');
    }
  }

  // 2. Perform assertion only if expo-modules-core is installed
  const targetFile = path.join(__dirname, '../node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/jni/JavaScriptFunction.kt');
  const packageDir = path.join(__dirname, '../node_modules/expo-modules-core');

  if (!fs.existsSync(packageDir)) {
    console.log('[INFO] expo-modules-core not installed; skipping native Kotlin patch assertion.');
    process.exit(0);
  }

  if (!fs.existsSync(targetFile)) {
    console.error('FATAL: expo-modules-core is installed but JavaScriptFunction.kt does not exist.');
    process.exit(1);
  }

  const content = fs.readFileSync(targetFile, 'utf8');
  if (content.includes('internal var returnType')) {
    console.error('FATAL: expo-modules-core Kotlin patch was NOT applied (internal var returnType is still internal).');
    process.exit(1);
  }

  console.log('PASS: expo-modules-core Kotlin returnType visibility patch is present.');
} catch (error) {
  console.error('Postinstall error:', error.message);
  process.exit(1);
}
