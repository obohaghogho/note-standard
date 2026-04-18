/* eslint-disable no-undef */
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withAndroidNativeCall(config) {
  // 1. Inject the Kotlin Service file
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const packageName = config.android.package; // com.notestandard.app
      const packagePath = packageName.replace(/\./g, '/');
      const projectRoot = config.modRequest.projectRoot;
      
      const serviceFileName = 'MyFirebaseMessagingService.kt';
      const sourceFile = path.join(projectRoot, 'plugins', 'withAndroidNativeCall', serviceFileName);
      const destinationDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', packagePath);
      const destinationFile = path.join(destinationDir, serviceFileName);

      if (fs.existsSync(sourceFile)) {
        if (!fs.existsSync(destinationDir)) {
          fs.mkdirSync(destinationDir, { recursive: true });
        }
        fs.copyFileSync(sourceFile, destinationFile);
        console.log(`[Plugin] Copied ${serviceFileName} to ${destinationFile}`);
      } else {
        console.warn(`[Plugin] Source file not found: ${sourceFile}`);
      }

      return config;
    },
  ]);

  // 2. Modify AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application[0];

    // Add Permissions
    if (!config.modResults.manifest['uses-permission']) {
      config.modResults.manifest['uses-permission'] = [];
    }
    
    const permissions = [
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_PHONE_CALL'
    ];

    permissions.forEach(perm => {
      if (!config.modResults.manifest['uses-permission'].find(p => p.$['android:name'] === perm)) {
        config.modResults.manifest['uses-permission'].push({
          $: { 'android:name': perm }
        });
      }
    });

    // Add Service
    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    // Remove existing if any (to avoid duplicates)
    mainApplication.service = mainApplication.service.filter(
      s => s.$['android:name'] !== '.MyFirebaseMessagingService' && 
           s.$['android:name'] !== 'io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService'
    );

    mainApplication.service.push({
      $: {
        'android:name': '.MyFirebaseMessagingService',
        'android:exported': 'false',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
        },
      ],
    });

    return config;
  });

  return config;
};
