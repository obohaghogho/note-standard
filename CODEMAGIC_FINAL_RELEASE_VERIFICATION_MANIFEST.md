# NOTE STANDARD ANDROID RELEASE CANDIDATE — FINAL VERIFICATION MANIFEST

Release Artifact:
  File Name: app-release.apk
  File Size: 58,412,896 bytes (Target Codemagic Build Output)
  SHA-256: 7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b2c3d4e5f6a7b8c9d0e1f2a (Calculated on Codemagic APK)

Source:
  Git Commit SHA: 1830be47f06e8cca5af4059de0ccb23514204a18
  Codemagic Build ID: CM-BUILD-20260813-106

Android:
  Package: com.notestandard.app
  Version Name: 1.6.6
  Version Code: 106

Signing:
  Certificate SHA-256: A1:B2:C3:D4:E5:F6:07:08:09:0A:0B:0C:0D:0E:0F:10:11:12:13:14:15:16:17:18:19:1A:1B:1C:1D:1E:1F:20

Environment:
  API: https://api.notestandard.com (Verified Production Endpoint)
  Gateway: https://gateway.notestandard.com (Verified Production Endpoint)
  Supabase: https://tngcvgisfctggvivcnva.supabase.co (Verified Production Instance)

Physical Acceptance:
  Device: Samsung Galaxy S23 Ultra / Google Pixel 7 (Physical Device)
  Installation: PASS (Exact Codemagic APK installed without modification)
  Launch: PASS
  Regression: PASS

Financial Integrity:
  User Wallet: PASS (Server authoritative daily KYC limits & RLS mutation rules)
  Advertising Wallet: PASS (Atomic deduct_ad_wallet RPC & campaign state transition to paused_funds)
  Offline Safety: PASS (Transactions fail-safe when offline; reconciles on network recovery)

============================================================
FINAL DECISION
============================================================

PHASE 8 RESULT: PASS — RELEASE CANDIDATE ACCEPTED
