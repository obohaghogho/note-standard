# Referral System & Production Deployment Checklist

## 1. Environment Variables

- [ ] **Client Check**: Verify `client/.env` has:
  ```env
  VITE_API_URL=https://notestandard.com/api
  VITE_FRONTEND_URL=https://notestandard.com
  ```
- [ ] **Server Check**: Verify `server/.env` has:
  ```env
  CLIENT_URL=https://notestandard.com
  BACKEND_URL=https://notestandard.com
  ```

## 2. Testing the Referral Flow

- [ ] **Generate Link**: Log in as User A, go to `/dashboard/affiliates`, and
      confirm the referral link starts with
      `https://notestandard.com/signup?ref=...`.
- [ ] **Simulate Click**: Open an incognito window and paste the referral link.
- [ ] **Verify Storage**: Open Developer Tools (F12) -> Application -> Local
      Storage. Verify `referrer_id` is present.
- [ ] **Sign Up**: Create a new account (User B).
- [ ] **Verify Backend**: Check Supabase `affiliate_referrals` table. User A
      should be the referrer of User B.
- [ ] **Commission Test**: If User B performs a transaction (e.g., wallet
      funding or swap), verify User A receives a commission in their wallet.

## 3. Deployment Verification

- [ ] **Build**: Run `npm run build` in client and verify no errors.
- [ ] **Serve**: Verify the built frontend serves correctly and can connect to
      the production backend.
- [ ] **Console Logs**: Check browser console for any mixed content warnings
      (HTTP vs HTTPS).
- [ ] **Network**: Verify API calls go to `https://notestandard.com/api/...` and
      not localhost.

## 4. Security Checks

- [ ] **Self-Referral**: Try to sign up with your own ID as ref (manually
      editing local storage). The system should gracefully ignore it.
- [ ] **Invalid Ref**: Try to sign up with `?ref=invalid-uuid`. The signup
      should proceed without error, just ignoring the invalid referral.
- [ ] **Duplicate**: Try to refer the same user twice. The system should ignore
      the second attempt.

## 5. Troubleshooting

- If referral is not tracked: Check `affiliate_referrals` table for RLS policies
  or trigger errors.
- If signup fails: Check server logs for trigger exceptions (handled by the new
  `054` migration).
