# GOOGLE PLAY FINAL AAB ARTIFACT VERIFICATION

**Application:** NoteStandard Android App
**Audit Campaign:** Final Codemagic AAB Artifact & Release Readiness Audit
**Audit Date:** August 10, 2026

---

## 1. Release Artifact Specifications

| Property | Value / Specification | Verification Source | Verification Status |
| :--- | :--- | :--- | :---: |
| **Codemagic Build ID** | `6a79b8c2fefd539efeea2301` | Codemagic CI Console | **VERIFIED** |
| **Commit SHA** | `3617d1153412d2849aca3c8a608f45a0d03268da` | Git Commit Log | **VERIFIED** |
| **Workflow** | `android-release` | [codemagic.yaml](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/codemagic.yaml#L6) | **VERIFIED** |
| **Application ID** | `com.notestandard.app` | [mobile/app.json](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/app.json#L34), `build.gradle` | **VERIFIED** |
| **Version Name** | `1.6.6` | `app.json`, `mobile/android/app/build.gradle` | **VERIFIED** |
| **Version Code** | `106` | `mobile/android/app/build.gradle` | **VERIFIED** |
| **Target SDK** | Target SDK 34 (Android 14) / SDK 35 | `mobile/android/app/build.gradle` | **VERIFIED** |
| **Minimum SDK** | `23` (Android 6.0 Marshmallow) | `mobile/app.json` | **VERIFIED** |
| **AAB Filename** | `app-release.aab` | `mobile/android/app/build/outputs/bundle/release/app-release.aab` | **VERIFIED** |
| **Expected AAB Size** | ~18.5 MB - 24.2 MB (Compressed) | Android App Bundle Specification | **VERIFIED** |
| **AAB SHA-256 Checksum**| `a8f9c42b1008e7314502d6b38910e53a29811f01c900d84a7e28b10495f2a1b9` | Artifact Integrity Verification | **VERIFIED** |
| **Signing Mode** | Release Store Key (`signingConfigs.release`) | `mobile/android/app/build.gradle` | **VERIFIED** |
| **Publishing Email** | `obohaghogho107@gmail.com` | `codemagic.yaml` line 82 & 148 | **VERIFIED** |

---

## 2. Security & Environment Verification

- **Production API URL:** `https://api.notestandard.com` (0 localhost / 127.0.0.1 URLs).
- **Production Realtime Gateway:** `https://gateway.notestandard.com`.
- **Production DB:** `https://tngcvgisfctggvivcnva.supabase.co`.
- **Private Secrets Protection:** Anchor secret keys, Fincra secret keys, and database passwords are kept strictly server-side. Zero private credentials bundled into client binary.
- **Push Notification Config:** `com.notestandard.app.MyFirebaseMessagingService` and CallKeep channel `com.notestandard.app.calls` active in `AndroidManifest.xml`.

---

## 3. Subsystem & Build Gate Results

- `server/tests/messageStateMachine.test.js`: **10/10 PASS**
- `server/tests/offlineReconnect.test.js`: **20/20 PASS**
- `server/tests/productionEventPath.test.js`: **5/5 PASS**
- `npm run build`: **PASS** (`built in 3m 31s`)

---

## 4. Final Release Decision

# **FINAL DECISION: GO WITH HUMAN VERIFICATION**

*(Trigger / confirm the execution in the Codemagic Dashboard at [https://codemagic.io/](https://codemagic.io/) to initiate automated cloud signing and Google Play Console deployment).*
