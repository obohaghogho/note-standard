# NOTESTANDARD PRODUCTION BASELINE

**Audit Date:** August 10, 2026
**Commit SHA:** `3617d1153412d2849aca3c8a608f45a0d03268da`
**Branch:** `main`
**Environment:** Production Readiness Forensic Audit

---

## 1. System Baseline Evidence Summary

| Dimension | Verification Status | Baseline Evidence / Details |
| :--- | :--- | :--- |
| **Commit SHA** | `3617d1153412d2849aca3c8a608f45a0d03268da` | Clean git status on `main` branch |
| **Client Build (`npm run build`)** | `PASS` | Vite 6 build complete, static output generated in `client/dist` |
| **Frozen Suite 1: State Machine** | `10/10 PASS` | `node server/tests/messageStateMachine.test.js` |
| **Frozen Suite 2: Offline Reconnect** | `20/20 PASS` | `node server/tests/offlineReconnect.test.js` |
| **Frozen Suite 3: Event Path** | `5/5 PASS` | `node server/tests/productionEventPath.test.js` |
| **TypeScript / TypeCheck** | `PASS` | Client typescript check passing |

---

## 2. Architecture & Monorepo Subsystems

1. **Client Workspace (`/client`):** React 19, Vite 6, TypeScript 5.9, Zustand 5, React Router DOM 7, TailwindCSS 4. Service Worker at `public/sw.js`.
2. **Server Workspace (`/server`):** Express 5 on Node.js 22. Controllers, middleware (`auth.js`), database access via `pg` and `@supabase/supabase-js`.
3. **Realtime Gateway (`/realtime-gateway`):** Standalone Socket.IO 4.7 server on port 4000. PostgreSQL `LISTEN/NOTIFY` pub/sub connector, `CorrelationRegistry.js`.
4. **Fincra Gateway (`/fincra-gateway`):** Nginx static IP proxy gateway for static outbound IP egress (DigitalOcean Droplet: `137.184.216.44`).
5. **Database Layer (`/supabase/migrations`):** Supabase PostgreSQL database schema, RLS policies, trigger functions, stored procedures (`confirm_deposit`).

---

## 3. Production Deployment Targets & Outbound Gateways

- **Frontend Target:** Vercel / PWA Static Hosting (`vercel.json`)
- **Backend API Target:** Render Web Service (`render.yaml`)
- **Realtime Gateway Target:** Render Web Service / Socket Server (`render.yaml`)
- **Fincra Static Egress Gateway:** Dedicated Nginx droplet (`137.184.216.44`)
- **Database Target:** Supabase Enterprise PostgreSQL instance

---

## 4. Frozen Subsystems (AUTHORITATIVE)

1. `client/src/utils/messageStatusEngine.ts`
2. `CorrelationRegistry` (`realtime-gateway/services/CorrelationRegistry.js`)
3. `mergeMessageMonotonic` (`client/src/context/ChatContext.tsx`)
4. `STATUS_RANK` state transition hierarchy
5. `server/tests/messageStateMachine.test.js` (10/10 PASS)
6. `shared/offlineQueueEngine.ts` / `client/src/services/messageQueue.ts`
7. `client/src/context/ChatContext.tsx`
8. `server/tests/offlineReconnect.test.js` (20/20 PASS)
9. `server/tests/productionEventPath.test.js` (5/5 PASS)

---

## 5. Mandatory Production Environment Variables (Keys Omitted)

- `NODE_ENV`, `PORT`, `CLIENT_URL`, `SERVER_URL`
- `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `JWT_SECRET`, `BCRYPT_SALT_ROUNDS`, `BANK_ENCRYPTION_KEY`
- `REDIS_URL`
- `ANCHOR_SECRET_KEY`, `ANCHOR_WEBHOOK_SECRET`, `ANCHOR_BASE_URL`
- `FINCRA_API_KEY`, `FINCRA_SECRET_KEY`, `FINCRA_PUBLIC_KEY`, `FINCRA_WEBHOOK_SECRET`, `FINCRA_GATEWAY_URL`
- `PAYSTACK_SECRET_KEY`
- `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`
- `CLOUDINARY_URL`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
