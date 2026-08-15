# Mobile ↔ Server Canonical API Contract Matrix

**Document Purpose:** Authoritative Contract Matrix for NoteStandard Phase 2 API Contract Layer  
**Target Features:** `B-02`, `B-06`, `B-07`, `B-08`, `B-09`, `B-12`  
**Base URL Namespace:** `apiClient.baseURL = "${API_URL}/api"`

---

## 1. Global API Configuration & Namespace Invariants

* **Client Base URL:** `${API_URL}/api` (Configured in [mobile/src/api/apiClient.ts](file:///d:/Users/Manuel/OneDrive/Desktop/note-standard-latest/mobile/src/api/apiClient.ts#L15))
* **Header Invariants:**
  * `Authorization: Bearer <JWT>` (Required for all protected endpoints)
  * `x-client-type: mobile`
  * `X-Session-ID: <session_id>`
* **Canonical Path Rule:** Client paths relative to `apiClient` (`/search`, `/upload/*`, `/feedback`) automatically map to `/api/search`, `/api/upload/*`, `/api/feedback` on the server.

---

## 2. API Contract Matrix Table

| Defect Ref | Mobile Feature | Client Call Path | Canonical Server Route | Method | Auth | Success HTTP Status | Expected Failure Statuses | Response Schema Summary |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **`B-02`** | Global Workspace Search | `apiClient.get('/search?q=...')` | `/api/search` | `GET` | JWT | `200 OK` | `400 Bad Request`, `401 Unauthorized` | `{ notes: [], chats: [], teams: [], users: [] }` |
| **`B-07`** | In-Chat Message Search | `apiClient.get('/chat/conversations/:id/search?q=...')` | `/api/chat/conversations/:id/search` | `GET` | JWT | `200 OK` | `400 Bad Request`, `401 Unauthorized`, `404 Not Found` | `{ messages: [], total: 0 }` |
| **`B-06`** | Community Post Image Upload | `apiClient.post('/upload/image?type=post', formData)` | `/api/upload/image` | `POST` | JWT | `201 Created` | `400 Bad Request`, `401 Unauthorized`, `413 File Too Large` | `{ url: string, key: string, mime: string }` |
| **`B-09`** | Chat Photo & File Attachment | `apiClient.post('/upload/file?type=chat', formData)` | `/api/upload/file` | `POST` | JWT | `201 Created` | `400 Bad Request`, `401 Unauthorized`, `413 File Too Large` | `{ url: string, key: string, name: string, mime: string }` |
| **`B-08`** | Voice Note Audio Recording | `apiClient.post('/upload/audio?type=voicenote', formData)` | `/api/upload/audio` | `POST` | JWT | `201 Created` | `400 Bad Request`, `401 Unauthorized`, `413 File Too Large` | `{ url: string, key: string, durationSecs: number }` |
| **`B-12`** | Submit Support Ticket | `apiClient.post('/feedback', { category, description })` | `/api/feedback` | `POST` | JWT | `201 Created` | `400 Bad Request`, `401 Unauthorized` | `{ id: string, category: string, status: "OPEN", created_at: string }` |
| **`B-12`** | List User Support Tickets | `apiClient.get('/feedback/my-feedback')` | `/api/feedback/my-feedback` | `GET` | JWT | `200 OK` | `401 Unauthorized` | `[{ id, category, description, status, created_at }]` |

---

## 3. Detailed Endpoint Contracts & Security Directives

### A. Global Search (`B-02`)
* **Endpoint:** `GET /api/search`
* **Query Parameters:** `q` (string, min length 2)
* **Auth Requirement:** Authenticated user JWT
* **Server Logic:** Queries active user's accessible `notes`, `conversations`, `teams`, and public `profiles`.
* **Failure Modes:**
  * `q` missing or length < 2 $\to$ HTTP 400 (`{ error: "Search query must be at least 2 characters" }`).
  * Unauthenticated $\to$ HTTP 401.

### B. In-Chat Search (`B-07`)
* **Endpoint:** `GET /api/chat/conversations/:id/search`
* **Route Parameter:** `:id` (UUIDv4 conversation ID)
* **Client Guard Rule:** `ChatScreen.tsx` MUST NOT issue request if `conversationId` is `undefined` or null.
* **Server Guard:** Verifies `req.user.id` is an active member of `:id` conversation.
* **Failure Modes:**
  * Invalid UUID / `undefined` param $\to$ HTTP 400.
  * User not a conversation member $\to$ HTTP 403 Forbidden.
  * Conversation not found $\to$ HTTP 404 Not Found.

### C. Unified `MediaUploadService` (`B-06`, `B-08`, `B-09`)
* **Architecture:** All media uploads route through a centralized server-side service (`MediaUploadService.js`).
* **Storage Provider:** Supabase Storage (Buckets: `community_media`, `chat_attachments`, `voice_notes`).
* **Endpoints:**
  1. `POST /api/upload/image`: Image validation (`image/jpeg`, `image/png`, `image/webp`; max 10MB).
  2. `POST /api/upload/file`: Document validation (`application/pdf`, `text/plain`, `application/msword`; max 25MB).
  3. `POST /api/upload/audio`: Audio voice note validation (`audio/m4a`, `audio/mp4`, `audio/aac`, `audio/wav`, `audio/webm`; max 15MB).
* **Security Rules:**
  * Authenticated JWT required.
  * File size, extension, and MIME header validation enforced server-side.
  * Storage path incorporates authenticated user ID (`storage_bucket/<user_id>/<timestamp>_<filename>`).

### D. User Support & Ticket System (`B-12`)
* **Endpoints:**
  1. `POST /api/feedback`: Submits feedback ticket. Expected body: `{ category: "bug" | "feature" | "wallet" | "general", description: string }`.
  2. `GET /api/feedback/my-feedback`: Fetches authenticated user's tickets only (`WHERE user_id = req.user.id`).
* **Lifecycle Statuses:** `"OPEN"` $\to$ `"IN_REVIEW"` $\to$ `"RESOLVED"`.
* **Security Guard:** `GET /my-feedback` strictly filters by `req.user.id` to prevent cross-user ticket exposure.

---

## 4. Phase 2 Verification & Release Gate Criteria

1. **Contract Matrix Gate:** `docs/forensics/api-contract-matrix.md` created and frozen.
2. **Route Integrity Gate:** Zero unexplained `404`, `405`, `401`, `403`, or `500` errors on audited endpoints.
3. **Security Gate:** Unauthenticated or cross-user access attempts return HTTP `401`/`403` strictly.
4. **Physical APK Gate:** Tested and verified on physical Android APK for Global Search (`B-02`), Chat Search (`B-07`), Post Image Upload (`B-06`), Chat File Attachment (`B-09`), Voice Note Audio Upload (`B-08`), and Support Ticket Submission/Retrieval (`B-12`).
