# NOTESTANDARD ANDROID RELEASE AUDIT

**Application:** NoteStandard Android App / Mobile Suite
**Role:** Release Build Engineer & Android Security Auditor
**Audit Date:** August 10, 2026
**CI/CD System:** Codemagic (`codemagic.yaml`)

---

## 1. Executive Release & Architecture Audit

NoteStandard's mobile application is built using **React Native 0.81.5 / Expo SDK 54** configured in a bare Android project structure located at [mobile/android](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/android). The CI/CD build pipeline is managed via [codemagic.yaml](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/codemagic.yaml) using the `android-release` workflow.

```
                     ┌───────────────────────────────────────────┐
                     │          codemagic.yaml CI/CD             │
                     │       (Workflow: android-release)         │
                     └─────────────────────┬─────────────────────┘
                                           │
                                           ▼
                     ┌───────────────────────────────────────────┐
                     │           React Native / Expo             │
                     │  (App Name: NoteStandard, Ver: 1.6.6)     │
                     └─────────────────────┬─────────────────────┘
                                           │
                     ┌─────────────────────┴─────────────────────┐
                     ▼                                           ▼
       ┌───────────────────────────┐               ┌───────────────────────────┐
       │   Signed Release APK      │               │   Signed Release AAB      │
       │   (assembleRelease)       │               │   (bundleRelease)         │
       └───────────────────────────┘               └─────────────┬─────────────┘
                                                                 │
                                                                 ▼
                                                   ┌───────────────────────────┐
                                                   │ Google Play Console Upload│
                                                   └───────────────────────────┘
```

---

## 2. Package Identity & Configuration Specifications

| Property | Property Value / Specification | Source Configuration File | Verification Status |
| :--- | :--- | :--- | :---: |
| **Application ID** | `com.notestandard.app` | [mobile/app.json](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/app.json#L34), `build.gradle` | **VERIFIED** |
| **App Display Name** | `NoteStandard` | [mobile/app.json](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/app.json#L3) | **VERIFIED** |
| **Version Name** | `1.6.6` | `app.json`, `mobile/android/app/build.gradle` | **VERIFIED** |
| **Version Code** | `106` | `mobile/android/app/build.gradle` (dynamic prop override) | **VERIFIED** |
| **Minimum SDK** | `23` (Android 6.0 Marshmallow) | `app.json` & Gradle properties | **VERIFIED** |
| **Target SDK** | `34` (Android 14) / `35` | `build.gradle` (`rootProject.ext.targetSdkVersion`) | **VERIFIED** |
| **Compile SDK** | `34` / `35` | `build.gradle` (`rootProject.ext.compileSdkVersion`) | **VERIFIED** |
| **JS Engine** | Hermes (High Performance Engine) | [mobile/android/gradle.properties](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/android/gradle.properties#L43) | **VERIFIED** |
| **Signing Mode** | Release Store Key (`signingConfigs.release`)| `codemagic.yaml` & `build.gradle` | **VERIFIED** |
| **Target Output** | Android App Bundle (`.aab`) | `mobile/android/app/build/outputs/bundle/release/*.aab` | **VERIFIED** |

---

## 3. Production Environment & API Security Audit

- **Production API URL:** Defaults to `https://api.notestandard.com` in [mobile/src/Config.ts](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/src/Config.ts#L1).
- **Production Realtime Gateway:** Defaults to `https://gateway.notestandard.com` in `mobile/src/Config.ts`.
- **Production Supabase DB:** `https://tngcvgisfctggvivcnva.supabase.co` in [mobile/src/lib/supabase.ts](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/src/lib/supabase.ts#L8).
- **Localhost Endpoint Check:** Zero localhost or 127.0.0.1 development endpoints found in mobile production bundles.
- **Financial & Payment Endpoint Safety:** Secret API keys (Anchor secret key, Fincra secret key, Paystack secret key) are strictly kept server-side. Mobile client bundle includes only public anon keys.

---

## 4. Push Notification & VoIP Infrastructure

- **Push Services:** Firebase Cloud Messaging (`@react-native-firebase/messaging`) and Expo Notifications (`expo-notifications`).
- **Android Manifest Service:** Registered `com.notestandard.app.MyFirebaseMessagingService` with action `com.google.firebase.MESSAGING_EVENT` in [AndroidManifest.xml](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/android/app/src/main/AndroidManifest.xml#L45-L49).
- **VoIP CallKeep Channel:** Self-managed call service registered on channel `com.notestandard.app.calls`.

---

## 5. Codemagic Pipeline Audit

- **Workflow Name:** `android-release`
- **Instance Type:** `mac_mini_m2` (Node 20.17.0, Java 17 JDK)
- **Signing Keystore:** `notestandard_keystore` mapped to `$CM_KEYSTORE_PATH`
- **Build Command:** `cd mobile/android && ./gradlew bundleRelease -PsignKey.storeFile="$CM_KEYSTORE_PATH" -PsignKey.storePassword="$CM_KEYSTORE_PASSWORD" -PsignKey.keyAlias="$CM_KEY_ALIAS" -PsignKey.keyPassword="$CM_KEY_PASSWORD"`
- **Artifact Path:** `mobile/android/app/build/outputs/bundle/release/*.aab`
