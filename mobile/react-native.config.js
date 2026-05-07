/**
 * react-native.config.js
 *
 * Excludes iOS-only libraries from Android autolinking.
 * react-native-voip-push-notification is iOS-only (VoIP PushKit).
 * Linking it on Android causes Gradle compilation failures.
 */
module.exports = {
  dependencies: {
    'react-native-voip-push-notification': {
      platforms: {
        android: null, // Disabled: iOS-only library
      },
    },
  },
};
