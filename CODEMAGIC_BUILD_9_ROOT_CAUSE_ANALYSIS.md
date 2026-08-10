# CODEMAGIC BUILD #9 FORENSIC ROOT CAUSE ANALYSIS

**Application:** NoteStandard Android App
**Codemagic Build ID:** `6a79c5014c28286892f49529`
**Workflow:** Android Release Build
**Branch:** `main`
**Commit:** `63a2b71`
**Audit Date:** August 10, 2026

---

## 1. Forensic Diagnosis & Stack Trace Analysis

```
Relevant stack locations:
- mobile/android/app/build.gradle:92 (android {)
- mobile/android/app/build.gradle:105 (defaultConfig {)
```

- **A. FIRST REAL ERROR:** `groovy.lang.MissingPropertyException` / extra properties extension resolution failure.
- **B. EXACT ERROR MESSAGE:** `Could not get unknown property 'minSdkVersion'` for extra properties extension on `rootProject.ext`.
- **C. EXACT FILE AND LINE:**
  - Invocation Line 1: [mobile/android/app/build.gradle:92](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/android/app/build.gradle#L92) (`android {`)
  - Invocation Line 2: [mobile/android/app/build.gradle:105](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/android/app/build.gradle#L105) (`defaultConfig {`)
  - Misconfiguration Source: [mobile/android/build.gradle:4–11](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/android/build.gradle#L4-L11) (`ext { ... }` nested inside `buildscript { ... }`).

---

## 2. Technical Explanation

In Gradle Groovy DSL:
- Defining `ext { ... }` *inside* `buildscript { ... }` sets extra properties on `buildscript.extra` (the build script classpath extension).
- Defining `ext { ... }` at top-level (outside `buildscript { ... }`) sets extra properties on `rootProject.extra`.

Because `ext { ... }` was nested inside `buildscript { ... }` in `mobile/android/build.gradle`, `rootProject.ext` remained empty during subproject evaluation. When `mobile/android/app/build.gradle` evaluated line 92 (`android {`) and line 105 (`defaultConfig {`), calls to `rootProject.ext.has("minSdkVersion")` / `rootProject.ext.get(...)` failed.

---

## 3. Proposed Minimal Safe Fix Plan

1. **Move `ext { ... }` block in `mobile/android/build.gradle` to top-level scope (outside `buildscript`):**
   ```groovy
   ext {
     buildToolsVersion = findProperty('android.buildToolsVersion') ?: "35.0.0"
     minSdkVersion = Integer.parseInt(findProperty('android.minSdkVersion') ?: "23")
     compileSdkVersion = Integer.parseInt(findProperty('android.compileSdkVersion') ?: "35")
     targetSdkVersion = Integer.parseInt(findProperty('android.targetSdkVersion') ?: "34")
     ndkVersion = findProperty('android.ndkVersion') ?: "26.1.10909125"
     kotlinVersion = findProperty('android.kotlinVersion') ?: "2.0.21"
   }
   ```
2. **Refactor helper functions in `mobile/android/app/build.gradle` to use Gradle's built-in `project.hasProperty(...)`:**
   ```groovy
   def safeExt(String prop, defaultValue) {
       return rootProject.hasProperty(prop) ? rootProject.property(prop) : defaultValue
   }

   def safeExtInt(String prop, int defaultValue) {
       return rootProject.hasProperty(prop) ? Integer.parseInt(rootProject.property(prop).toString()) : defaultValue
   }
   ```

---

## 4. Scope & Application Integrity Confirmation

- **Files To Modify:** `mobile/android/build.gradle` and `mobile/android/app/build.gradle`.
- **Application Code Status:** **ZERO APPLICATION CODE TOUCHED.** No financial logic, wallet/ledger rules, chat state machines, offline reconnect, authentication, Team, Note, or Feed code will be touched.
- **Verification Gates Required:**
  - `./gradlew assembleRelease` PASS
  - `./gradlew bundleRelease` PASS
  - `npm run build` PASS
  - `messageStateMachine.test.js` 10/10 PASS
  - `offlineReconnect.test.js` 20/20 PASS
  - `productionEventPath.test.js` 5/5 PASS
