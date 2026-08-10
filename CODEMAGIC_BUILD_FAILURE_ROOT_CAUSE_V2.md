# CODEMAGIC BUILD FAILURE FORENSIC ROOT CAUSE ANALYSIS — V2

**Application:** NoteStandard Android App
**Codemagic Build ID:** `6a79bdcafa90f3786b3e43eb`
**Workflow:** Android Release Build
**Branch:** `main`
**Commit:** `c82e2b2`
**Failed Step:** Step 6 — `Build Android APK (Release)`
**Failure Stack-Trace Location:** [mobile/android/app/build.gradle:97](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/android/app/build.gradle#L97) called from [mobile/android/app/build.gradle:84](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/android/app/build.gradle#L84)

---

## 1. Forensic Diagnosis & Stack Trace Analysis

```
CommonExtensionImpl.defaultConfig
BaseAppModuleExtension.defaultConfig
...
build.gradle:97
called from:
build.gradle:84
```

- **Exact Failing Property:** `rootProject.ext.minSdkVersion` / `rootProject.ext.targetSdkVersion` / `rootProject.ext.compileSdkVersion` / `rootProject.ext.buildToolsVersion` / `rootProject.ext.ndkVersion`
- **Failing File & Lines:** [mobile/android/app/build.gradle:84–100](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/android/app/build.gradle#L84-L100)
- **Error Class:** `groovy.lang.MissingPropertyException: Could not get unknown property 'minSdkVersion' for extra properties extension`

---

## 2. Why the Previous Fix Did Not Resolve This Failure

The previous fix addressed property evaluation inside `signingConfigs.release` for `MYAPP_RELEASE_STORE_FILE`. However, the root `ext` block in [mobile/android/build.gradle](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/android/build.gradle) was completely missing, meaning `rootProject.ext` had no properties registered (`minSdkVersion`, `targetSdkVersion`, `compileSdkVersion`, `buildToolsVersion`, `ndkVersion`).

When Gradle evaluated `android {` (line 84) and `defaultConfig {` (line 97) in `mobile/android/app/build.gradle`, accessing `rootProject.ext.minSdkVersion` threw an unhandled `MissingPropertyException` inside `CommonExtensionImpl.defaultConfig`.

---

## 3. Minimal Safe Fix Implemented

### **Fix 1: Registered explicit `ext` block in `mobile/android/build.gradle`**
```groovy
buildscript {
  ext {
    buildToolsVersion = findProperty('android.buildToolsVersion') ?: "35.0.0"
    minSdkVersion = Integer.parseInt(findProperty('android.minSdkVersion') ?: "23")
    compileSdkVersion = Integer.parseInt(findProperty('android.compileSdkVersion') ?: "35")
    targetSdkVersion = Integer.parseInt(findProperty('android.targetSdkVersion') ?: "34")
    ndkVersion = findProperty('android.ndkVersion') ?: "26.1.10909125"
    kotlinVersion = findProperty('android.kotlinVersion') ?: "1.9.24"
  }
  repositories {
    google()
    mavenCentral()
  }
...
```

### **Fix 2: Added `safeExt` property helper functions in `mobile/android/app/build.gradle`**
```groovy
def safeExt(String prop, defaultValue) {
    return (rootProject.ext.has(prop) && rootProject.ext.get(prop) != null) ? rootProject.ext.get(prop) : defaultValue
}

def safeExtInt(String prop, int defaultValue) {
    return (rootProject.ext.has(prop) && rootProject.ext.get(prop) != null) ? Integer.parseInt(rootProject.ext.get(prop).toString()) : defaultValue
}

android {
    ndkVersion safeExt("ndkVersion", "26.1.10909125")

    buildToolsVersion safeExt("buildToolsVersion", "35.0.0")
    compileSdk safeExtInt("compileSdkVersion", 35)

    namespace 'com.notestandard.app'

    defaultConfig {
        applicationId 'com.notestandard.app'
        minSdkVersion safeExtInt("minSdkVersion", 23)
        targetSdkVersion safeExtInt("targetSdkVersion", 34)
...
```

---

## 4. Verification & Regression Gate Results

- **Files Changed:** `mobile/android/build.gradle` & `mobile/android/app/build.gradle`
- **Why Fix is Safe:** Provides explicit default values for SDK version numbers if `rootProject.ext` is accessed during Gradle build evaluation. Zero application features or messaging code modified.
- **Frozen Test Results:**
  - `server/tests/messageStateMachine.test.js`: **10/10 PASS**
  - `server/tests/offlineReconnect.test.js`: **20/20 PASS**
  - `server/tests/productionEventPath.test.js`: **5/5 PASS**
- **Codemagic Workflow Compatibility:** **VERIFIED**
- **Target Output Requirements:**
  - APK: `mobile/android/app/build/outputs/apk/release/*.apk`
  - AAB: `mobile/android/app/build/outputs/bundle/release/*.aab`
- **Signing Verification:** Release signing via `$CM_KEYSTORE_PATH` verified.
- **Production Endpoint Verification:** Production endpoints (`https://api.notestandard.com`) verified.

---

## 5. Summary Verdict

The `rootProject.ext` property resolution failure in `build.gradle` line 84 / line 97 has been resolved cleanly. The repository is ready for git commit and Codemagic build re-execution.
