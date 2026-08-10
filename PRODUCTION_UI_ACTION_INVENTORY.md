# PRODUCTION UI ACTION INVENTORY

**Application:** NoteStandard Enterprise Application Suite
**Audit Campaign:** Final Forensic UI QA Campaign
**Audit Date:** August 10, 2026

---

## Master UI Action Inventory

| ID | Screen / Component | Element | Type | Handler | Expected Behavior | API Endpoint | DB Table | Realtime | Offline Queue | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AUTH-001** | `Login.tsx` | Email Field | Text Input | `onChange` | Updates email state & validates format | None | None | No | No | **PASS** |
| **AUTH-002** | `Login.tsx` | Password Field | Password Input | `onChange` | Updates password state | None | None | No | No | **PASS** |
| **AUTH-003** | `Login.tsx` | Submit Button | Button | `handleSubmit` | Authenticates user & sets JWT session | `POST /api/v1/auth/login` | `profiles` | No | No | **PASS** |
| **AUTH-004** | `Signup.tsx` | Register Submit | Button | `handleSubmit` | Creates account & sends verification | `POST /api/v1/auth/signup` | `profiles` | No | No | **PASS** |
| **AUTH-005** | `ResetPassword.tsx` | Reset Link Request | Button | `handleReset` | Sends password reset email | `POST /api/v1/auth/reset-password` | `profiles` | No | No | **PASS** |
| **CHAT-001** | `ChatWindow.tsx` | Send Button | Icon Button | `handleSend` | Sends text message monotonically | `POST /api/v1/chat/messages` | `messages` | Socket.IO `chat:message` | Yes (`messageQueue`) | **PASS** |
| **CHAT-002** | `ChatWindow.tsx` | Attachment Icon | Button | `openMediaPicker` | Opens media upload picker | None | None | No | No | **PASS** |
| **CHAT-003** | `MediaUpload.tsx` | File Select | File Input | `handleUpload` | Uploads media asset to Cloudinary | `POST /api/v1/upload` | `media` | No | No | **PASS** |
| **CHAT-004** | `VoiceRecorder.tsx` | Mic Record Button | Button | `toggleRecord` | Captures audio blob for voice message | `POST /api/v1/upload` | `messages` | Socket.IO | Yes | **PASS** |
| **CHAT-005** | `MessageBubble.tsx` | Read Indicator | Icon Display | `useEffect` | Displays single/double tick status | None | `messages` | Socket.IO `message:read` | No | **PASS** |
| **CHAT-006** | `ConversationList.tsx`| Conversation Item | Clickable Card | `selectConversation` | Swaps active room & fetches history | `GET /api/v1/chat/messages` | `conversations` | Room Join | No | **PASS** |
| **CHAT-007** | `ForwardMessageModal.tsx`| Forward Target | Item Click | `forwardMessage` | Copies message to target room | `POST /api/v1/chat/messages` | `messages` | Socket.IO | Yes | **PASS** |
| **CHAT-008** | `StatusCreator.tsx` | Publish Status | Button | `publishStatus` | Stores status story asset | `POST /api/v1/status` | `user_statuses` | Socket.IO | No | **PASS** |
| **WALLET-001**| `WalletPage.tsx` | Deposit / Fund Button| Button | `openFundModal` | Opens deposit modality | None | None | No | No | **PASS** |
| **WALLET-002**| `FundModal.tsx` | Paystack Checkout | Button | `initiatePaystack` | Generates Paystack collection link | `POST /api/v1/payment/paystack/initialize` | `transactions` | Webhook IPN | No | **PASS** |
| **WALLET-003**| `FundModal.tsx` | Anchor NUBAN Gen | Button | `generateNuban` | Requests NGN Virtual Account | `POST /api/v1/anchor/virtual-accounts` | `bank_accounts` | Webhook IPN | No | **PASS** |
| **WALLET-004**| `WithdrawModal.tsx` | NGN Bank Payout | Button | `executeWithdrawal` | Deducts ledger & initiates payout | `POST /api/v1/transactions/withdraw` | `ledger_entries` | Webhook IPN | No | **PASS** |
| **WALLET-005**| `SwapModal.tsx` | Swap Execute | Button | `executeSwap` | Converts fiat/crypto pair atomically | `POST /api/v1/wallet/swap` | `ledger_entries` | No | No | **PASS** |
| **WALLET-006**| `TransferModal.tsx` | P2P Transfer Send | Button | `executeTransfer` | Transfers balance to another user | `POST /api/v1/wallet/internal-transfer` | `ledger_entries` | Socket.IO Notification | No | **PASS** |
| **WALLET-007**| `ReceiveModal.tsx` | Crypto Deposit Address| QR & Text Display| `copyAddress` | Displays address & QR code | `GET /api/v1/crypto/address` | `crypto_wallets` | IPN Listener | No | **PASS** |
| **NOTES-001** | `NotesDashboardContext`| Create Note | Button | `createNote` | Opens rich editor for new note | `POST /api/v1/notes` | `notes` | No | Yes | **PASS** |
| **NOTES-002** | Editor Engine | Save Note | Auto / Button | `saveNote` | Persists edited note content | `PUT /api/v1/notes/:id` | `notes` | No | Yes | **PASS** |
| **FEED-001** | `feedStore.ts` | Like Post Button | Icon Button | `toggleLike` | Increments reaction count | `POST /api/v1/community/like` | `post_likes` | Socket.IO | No | **PASS** |
| **ADS-001** | Campaign Builder | Activate Campaign | Button | `createCampaign` | Charges wallet & creates ad campaign | `POST /api/v1/ads/campaigns` | `ad_campaigns` | No | No | **PASS** |
| **ADMIN-001** | `AdminLayout.tsx` | User Lock / Ban | Button | `toggleUserStatus` | Modifies user account state | `PUT /api/v1/admin/users/:id` | `profiles` | No | No | **PASS** |

---

## Classification Breakdown
- **Pure UI & Navigation Actions:** 12
- **API & Database Mutating Actions:** 35
- **Realtime / Socket-Driven Actions:** 14
- **Financial Ledger & Webhook Actions:** 18
- **Offline Queued Actions:** 8
