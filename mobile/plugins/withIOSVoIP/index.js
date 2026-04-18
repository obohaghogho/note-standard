/* eslint-env node */
const { withAppDelegate, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withIOSVoIP(config) {
  // 1. Inject the Swift file
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const projectName = config.modRequest.projectName;
      const iosRoot = path.join(projectRoot, 'ios', projectName);
      
      const fileName = 'VoIPPushDelegate.swift';
      const sourceFile = path.join(projectRoot, 'plugins', 'withIOSVoIP', fileName);
      const destinationFile = path.join(iosRoot, fileName);

      if (fs.existsSync(sourceFile)) {
        if (!fs.existsSync(iosRoot)) {
          fs.mkdirSync(iosRoot, { recursive: true });
        }
        fs.copyFileSync(sourceFile, destinationFile);
        console.log(`[Plugin] Copied ${fileName} to ${destinationFile}`);
      }
      return config;
    },
  ]);

  // 2. Modify AppDelegate to register PushKit
  config = withAppDelegate(config, (config) => {
    let appDelegate = config.modResults.contents;

    // Add Imports
    if (!appDelegate.includes('#import <PushKit/PushKit.h>')) {
      appDelegate = '#import <PushKit/PushKit.h>\n' + appDelegate;
    }

    // Add PKPushRegistryDelegate registration logic in didFinishLaunchingWithOptions
    const registrationCode = `
  // VoIP Push Registration
  PKPushRegistry* voipRegistry = [[PKPushRegistry alloc] initWithQueue:dispatch_get_main_queue()];
  voipRegistry.delegate = [VoIPPushDelegate shared];
  voipRegistry.desiredPushTypes = [NSSet setWithObject:PKPushTypeVoIP];
    `;

    if (!appDelegate.includes('PKPushRegistry')) {
      appDelegate = appDelegate.replace(
        /(\[super\s+application:application\s+didFinishLaunchingWithOptions:launchOptions\];)/,
        `$1\n${registrationCode}`
      );
    }

    config.modResults.contents = appDelegate;
    return config;
  });

  return config;
};
