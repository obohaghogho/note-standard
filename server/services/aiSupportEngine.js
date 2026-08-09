/**
 * AI Support Engine v2 — Full NoteStandard Knowledge Base
 * ────────────────────────────────────────────────────────
 * Generates intelligent, context-aware support responses for user
 * feedback reports and follow-up messages. Built from complete knowledge
 * of every NoteStandard feature, page, and system.
 *
 * Coverage:
 *   - Wallet & Multi-Currency (NGN, USD, EUR, GBP, BTC, ETH, USDT, USDC)
 *   - Deposits (Card, Bank Transfer, Crypto, Virtual Accounts)
 *   - Withdrawals (Bank, Crypto, Fincra Payout)
 *   - Currency Swap / Exchange Hub
 *   - Chat & Messaging (1-to-1, Groups, Media, Voice/Video Calls)
 *   - Teams & Workspaces (Projects, Tasks, Files, Meetings, Members)
 *   - Community Feed (Posts, Comments, Spaces, Media)
 *   - Notes (Rich Editor, Categories, Search, AI Suggestions)
 *   - Notifications & Push
 *   - Account & Authentication (Login, Signup, 2FA, Sessions)
 *   - Settings & Profile
 *   - Billing & Subscriptions
 *   - Affiliates & Referrals
 *   - Transactions & History
 *   - Ads & Promotions
 *   - Download & PWA
 *   - Security & Privacy
 *   - Performance & Errors
 *   - Trends & Analytics
 *
 * Architecture:
 *   report submitted → generateAutoReply(report) → feedback_comments
 *   user follow-up   → generateFollowUpReply(comment, report) → feedback_comments
 */

const logger = require('../utils/logger');

// ─── NoteStandard Complete Knowledge Base ───────────────────────────────────
// Every feature, every user flow, every common issue.

const KNOWLEDGE_BASE = {

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCIAL: Payments, Deposits, Funding
  // ═══════════════════════════════════════════════════════════════════════════
  payment: {
    patterns: [
      'deposit', 'card', 'payment', 'charge', 'declined', 'refund',
      'debit', 'credit', 'bank', 'transfer failed', 'transaction failed',
      'paystack', 'fincra', 'funding', 'top up', 'top-up', 'fund',
      'pay', 'card payment', 'bank transfer', 'virtual account',
      'nuban', 'anchor', 'flutterwave', 'pending deposit', 'not credited',
      'money not received', 'payment gateway', 'otp', 'pin', 'card error',
      'insufficient', 'deducted but not credited', 'double charge'
    ],
    responses: {
      default: {
        greeting: "Thank you for reporting this payment issue. We take all payment concerns very seriously.",
        steps: [
          "Please verify your card details are correct and the card has not expired.",
          "Ensure your bank has not blocked online transactions — you may need to enable online payments via your banking app.",
          "Try using a different card or payment method if available.",
          "Check your transaction history at Dashboard → Transactions to see if the payment is showing as 'pending'.",
          "If the charge was made but funds were not credited, please allow up to 15 minutes for automatic reconciliation.",
          "For virtual account deposits (NUBAN), ensure you transferred to the correct account number shown in your Wallet → Deposit section."
        ],
        closing: "If this issue persists after trying the steps above, our engineering team will investigate your specific transaction. Please include your transaction reference number if available."
      },
      deposit_failed: {
        greeting: "We understand how frustrating a failed deposit can be.",
        steps: [
          "Verify that your bank account or card has sufficient funds.",
          "Check if your bank sent you an OTP or authentication prompt that may have timed out.",
          "Try clearing your browser cache and attempting the deposit again.",
          "If the funds were debited from your bank but not reflected in your NoteStandard wallet, the system will automatically reverse or credit the amount within 24 hours.",
          "Navigate to Dashboard → Transactions to check if the deposit is showing as 'pending'.",
          "For Paystack card deposits: try a different card brand (Visa/Mastercard) if one fails.",
          "For bank transfer deposits: double check the virtual account number and bank name before sending."
        ],
        closing: "Our payment reconciliation system runs continuously. If the funds don't appear within 24 hours, this report will be escalated to our finance team."
      },
      refund: {
        greeting: "We've received your refund request.",
        steps: [
          "Refunds typically take 3-5 business days to reflect in your bank account.",
          "Check your transaction history for the refund status — it may show as 'processing'.",
          "If you paid via card, the refund will be returned to the same card.",
          "For bank transfer refunds, ensure the bank details on your account are correct.",
          "You can track refund status under Dashboard → Transactions → filter by 'Refund'."
        ],
        closing: "Our finance team processes refund requests on a priority basis. You'll receive a notification once the refund is initiated."
      },
      virtual_account: {
        greeting: "We see you're having an issue with your virtual account deposit.",
        steps: [
          "Your virtual NUBAN account is displayed under Wallet → Deposit → Bank Transfer.",
          "Ensure you're sending from a bank account in your own name — third-party transfers may be flagged.",
          "The minimum deposit amount may vary by provider (Anchor, Fincra). Check the minimum shown on screen.",
          "Virtual account deposits are typically credited within 1-5 minutes of the bank confirming the transfer.",
          "If your deposit has been pending for over 30 minutes, the provider may be experiencing delays — our system will auto-reconcile.",
          "You can see pending deposits under Wallet → Pending Deposits section."
        ],
        closing: "Virtual account deposits are processed via our banking partners (Anchor/Fincra). If the delay exceeds 1 hour, we'll escalate to the provider directly."
      },
      double_charge: {
        greeting: "We're sorry you experienced a double charge. We'll help resolve this immediately.",
        steps: [
          "First, check Dashboard → Transactions to verify whether both charges actually credited your wallet.",
          "If only one credit appeared but two debits from your bank — the duplicate charge will be automatically reversed within 24-48 hours.",
          "Your bank's pending transactions may show two entries that will consolidate to one after settlement.",
          "Take a screenshot of your bank statement showing both charges for our records.",
          "Do NOT attempt to deposit again until we confirm the status of the original transaction."
        ],
        closing: "Double charges are handled with the highest priority. Our payment team will trace the exact transaction IDs and ensure only the correct amount is charged."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WALLET: Balances, Multi-Currency, Crypto Wallets
  // ═══════════════════════════════════════════════════════════════════════════
  wallet: {
    patterns: [
      'wallet', 'balance', 'missing', 'funds', 'incorrect', 'wrong amount',
      'not showing', 'disappeared', 'zero balance', 'currency', 'negative',
      'ngn', 'usd', 'eur', 'gbp', 'btc', 'eth', 'usdt', 'usdc',
      'crypto wallet', 'fiat wallet', 'multi currency', 'wallet address',
      'receive address', 'allocation', 'portfolio', 'total balance',
      'naira', 'dollar', 'bitcoin', 'ethereum', 'stablecoin'
    ],
    responses: {
      default: {
        greeting: "Thank you for reporting this wallet issue.",
        steps: [
          "Pull down to refresh your wallet balance — cached data may be showing an outdated amount.",
          "Navigate to Dashboard → Transactions to verify recent activity matches your expected balance.",
          "If you recently performed a swap, transfer, or withdrawal, allow a few moments for the ledger to update.",
          "Try logging out and logging back in to force a fresh wallet sync.",
          "Check if the issue affects a specific currency wallet (e.g., NGN, USD, BTC) or all wallets.",
          "Your wallet balance is calculated from your complete transaction ledger — it's always accurate once synced.",
          "If you have multiple currency wallets, check Wallet → Currency List to see all your active wallets."
        ],
        closing: "Your wallet balances are stored securely in our multi-ledger system. If there's a discrepancy, our team will audit the transaction history and correct any errors."
      },
      crypto: {
        greeting: "We've noted your crypto wallet concern.",
        steps: [
          "Crypto wallet addresses are generated per-currency. Go to Wallet → Receive to view your deposit address.",
          "Bitcoin (BTC) transactions require at least 3 network confirmations before being credited (typically 30-60 minutes).",
          "Ethereum (ETH) and ERC-20 tokens (USDT, USDC) require 12 confirmations (typically 3-5 minutes).",
          "Always double-check you're sending to the correct network — sending BTC to an ETH address will result in lost funds.",
          "Your crypto wallet shows the USD equivalent based on real-time market rates from our exchange providers.",
          "For USDT/USDC, we support ERC-20 network only. Do not send via TRC-20 or BEP-20."
        ],
        closing: "Crypto deposits are tracked automatically on the blockchain. If a deposit isn't showing, please share the transaction hash (txid) so we can trace it on-chain."
      },
      missing_funds: {
        greeting: "We understand the concern about missing funds — this is treated as a high priority.",
        steps: [
          "Check Dashboard → Transactions for ALL recent entries including pending, failed, and reversed transactions.",
          "If you sent money to another user, verify the recipient's username or account was entered correctly.",
          "For recent swaps, the funds move from one currency wallet to another — check both wallets.",
          "Withdrawals that are 'processing' will temporarily reduce your available balance until confirmed.",
          "If funds disappeared after a system update, try force-refreshing (Ctrl+Shift+R on desktop).",
          "Our ledger system uses atomic transactions — funds cannot vanish, they are always traceable."
        ],
        closing: "Our engineering team can audit your complete ledger trail. Every debit has a corresponding credit — we will find and explain the exact flow of your funds."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SWAP / EXCHANGE: Currency Conversion
  // ═══════════════════════════════════════════════════════════════════════════
  swap: {
    patterns: [
      'swap', 'exchange', 'convert', 'conversion', 'rate', 'exchange rate',
      'fx', 'currency swap', 'ngn to usd', 'usd to ngn', 'btc to usd',
      'eth to btc', 'wrong rate', 'exchange hub', 'swap failed', 'swap fee',
      'conversion fee', 'rate expired', 'quote', 'exchange amount'
    ],
    responses: {
      default: {
        greeting: "We've noted your currency swap concern.",
        steps: [
          "Exchange rates are sourced in real-time from our payment providers (NOWPayments for crypto, Fincra for NGN pairs).",
          "The rate you see at quote time is locked for 30 seconds — after that, a new quote is generated.",
          "Our swap engine applies a transparent fee (shown before confirmation) which affects the final amount.",
          "Verify both your source and destination wallet balances after the swap completes.",
          "Check Dashboard → Transactions for the swap record — it shows the exact rate applied, fee charged, and amounts.",
          "If you swapped NGN to USD and the amount seems off, compare against the live rate shown in Exchange Hub.",
          "Minimum swap amounts apply — typically $1 USD equivalent. The system will reject amounts below the minimum."
        ],
        closing: "If you believe the swap amount is incorrect, please share the transaction ID from your transaction history and our engineering team will audit the exact rate and fee calculation."
      },
      rate_issue: {
        greeting: "We understand your concern about the exchange rate.",
        steps: [
          "NoteStandard uses live market rates from our providers: NOWPayments for crypto (BTC, ETH) and Fincra for fiat (NGN/USD).",
          "Rates can change by small amounts between the time you see the quote and when you confirm — this is normal market behavior.",
          "Our system adds a small spread (typically 0.5-1%) to cover provider fees and ensure swap reliability.",
          "For NGN/USD swaps, the rate you get through NoteStandard matches the Fincra settlement rate — what you see is what Fincra processes.",
          "You can always check current rates before swapping by visiting the Exchange Hub without committing to a swap."
        ],
        closing: "Rates are refreshed every 5 minutes and cached for performance. If you notice a significant discrepancy (>5%), please report it with the exact rate you saw."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WITHDRAWAL: Bank Payout, Crypto Withdrawal
  // ═══════════════════════════════════════════════════════════════════════════
  withdrawal: {
    patterns: [
      'withdraw', 'withdrawal', 'payout', 'cash out', 'send to bank',
      'bank payout', 'withdrawal failed', 'withdrawal pending', 'otp',
      'withdrawal otp', 'withdrawal pin', 'withdrawal limit', 'cannot withdraw',
      'withdrawal rejected', 'send crypto', 'crypto withdrawal', 'network fee'
    ],
    responses: {
      default: {
        greeting: "We've received your withdrawal-related report.",
        steps: [
          "Withdrawals require OTP verification sent to your registered email for security.",
          "Ensure the bank account or crypto address you're withdrawing to is correct — funds sent to wrong addresses cannot be reversed.",
          "NGN bank withdrawals are processed via Fincra and typically arrive within 5-30 minutes during banking hours.",
          "Crypto withdrawals require network confirmations — BTC takes 30-60 minutes, ETH/ERC-20 takes 3-5 minutes.",
          "There are daily withdrawal limits based on your verification level. Check Settings → Security for your current limits.",
          "If your withdrawal shows 'pending admin review', it means it triggered a security check and will be reviewed by our team.",
          "Withdrawal fees vary by method: bank transfers have a flat fee, crypto withdrawals include network gas fees."
        ],
        closing: "If your withdrawal has been pending for over 1 hour (bank) or 2 hours (crypto), this report will be escalated to our operations team for manual processing."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSFER: P2P, Internal Transfers
  // ═══════════════════════════════════════════════════════════════════════════
  transfer: {
    patterns: [
      'transfer', 'send money', 'send to user', 'p2p', 'internal transfer',
      'transfer to friend', 'username transfer', 'wrong recipient',
      'transfer failed', 'sent to wrong person', 'transfer pending'
    ],
    responses: {
      default: {
        greeting: "We've received your transfer concern.",
        steps: [
          "Internal transfers between NoteStandard users are instant and free.",
          "Always verify the recipient's username before confirming a transfer — we display their profile name for confirmation.",
          "You'll need to enter your transaction PIN to authorize transfers.",
          "If a transfer shows as 'failed', the funds will be returned to your wallet automatically.",
          "Check Dashboard → Transactions to see the transfer status and details.",
          "Transfers to wrong recipients cannot be automatically reversed — please contact us immediately with the transaction ID so we can reach out to the recipient."
        ],
        closing: "If you sent funds to the wrong person, provide the transaction ID immediately and we'll attempt to facilitate a resolution with the recipient."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAT & MESSAGING
  // ═══════════════════════════════════════════════════════════════════════════
  chat: {
    patterns: [
      'chat', 'message', 'send message', 'receive', 'offline', 'connect',
      'socket', 'notification', 'read receipt', 'typing', 'voice',
      'call', 'video call', 'media', 'image', 'file', 'attachment',
      'group chat', 'dm', 'direct message', 'unread', 'message not sent',
      'message not delivered', 'stuck sending', 'chat loading', 'emoji',
      'voice note', 'audio', 'screen share', 'agora', 'webrtc'
    ],
    responses: {
      default: {
        greeting: "We've received your chat-related report.",
        steps: [
          "Check your internet connection — chat requires an active WebSocket connection to our real-time gateway.",
          "If you see 'connecting...' or 'offline', try refreshing the page or closing and reopening the app.",
          "Messages that show a spinning icon are queued and will be sent automatically when connection is restored.",
          "For media/file uploads, ensure the file is under 25MB and in a supported format (JPG, PNG, GIF, PDF, MP4).",
          "Read receipts (blue ticks) appear when the recipient's app actively displays the message.",
          "If voice/video calls aren't connecting, ensure you've granted microphone and camera permissions in your browser settings.",
          "Group chats support up to 256 members. If you can't add more members, this limit may have been reached."
        ],
        closing: "Our real-time messaging infrastructure is actively monitored 24/7. If this is a recurring issue, we'll investigate the WebSocket connection logs for your account."
      },
      call: {
        greeting: "We see you're having trouble with voice or video calls.",
        steps: [
          "Voice and video calls use Agora's real-time communication infrastructure.",
          "Ensure you've granted microphone permission (and camera permission for video calls) in your browser.",
          "Check if another app is using your microphone or camera — close other meeting apps (Zoom, Teams, etc.).",
          "For best call quality, use a stable WiFi connection rather than mobile data.",
          "If the call drops frequently, try switching to audio-only mode to reduce bandwidth requirements.",
          "Screen sharing requires granting screen access permission when your browser prompts you."
        ],
        closing: "Call quality issues are often network-related. If the problem persists, try from a different network or device."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAMS & WORKSPACES
  // ═══════════════════════════════════════════════════════════════════════════
  teams: {
    patterns: [
      'team', 'workspace', 'project', 'task', 'member', 'invite',
      'team chat', 'workspace settings', 'team meeting', 'file sharing',
      'announcement', 'calendar', 'collaboration', 'kanban', 'board',
      'assign', 'deadline', 'milestone', 'role', 'permission', 'admin role',
      'team owner', 'workspace overview', 'analytics', 'team analytics'
    ],
    responses: {
      default: {
        greeting: "Thank you for your teams/workspace feedback.",
        steps: [
          "Teams are organized into Workspaces — each workspace has its own chat, projects, tasks, files, and members.",
          "To create a new workspace: go to Teams → Create Workspace. You'll become the workspace owner.",
          "Invite members by going to Workspace → Members → Invite. You can set roles (Admin, Member, Viewer).",
          "Projects & Tasks: Use the Kanban board under Workspace → Projects to manage work items with statuses (To Do, In Progress, Done).",
          "File sharing: Upload files under Workspace → Files. All team members with access can view and download shared files.",
          "Team meetings can be scheduled under Workspace → Meetings. They integrate with the voice/video call system.",
          "Announcements: Workspace admins can post announcements visible to all members under Workspace → Announcements.",
          "Workspace Analytics shows team activity, task completion rates, and member engagement metrics."
        ],
        closing: "If you're experiencing permission issues, verify your role in the workspace under Workspace → Members. Only admins and owners can modify workspace settings."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNITY FEED
  // ═══════════════════════════════════════════════════════════════════════════
  community: {
    patterns: [
      'feed', 'post', 'community', 'social', 'comment', 'like', 'share',
      'space', 'public post', 'content', 'trending', 'discover',
      'media upload', 'post image', 'post video', 'report post',
      'inappropriate', 'spam post', 'community guidelines', 'block user',
      'mute user', 'feed not loading', 'cannot post'
    ],
    responses: {
      default: {
        greeting: "Thank you for your community feed feedback.",
        steps: [
          "The Community Feed shows posts from people you follow and trending content across NoteStandard.",
          "To create a post: tap the '+' button (floating action button) at the bottom of the feed.",
          "Posts support text, images, videos, and links. Images are automatically compressed for optimal loading.",
          "Spaces are topic-based communities — join spaces that interest you to see relevant content in your feed.",
          "Comments support replies and threading — tap any comment to reply directly to it.",
          "If a post violates community guidelines, use the '...' menu → Report to flag it for review.",
          "You can mute or block other users from their profile page if needed.",
          "Search the feed using the search bar to find posts, users, or topics."
        ],
        closing: "Community guidelines are enforced to keep NoteStandard safe for everyone. Reported content is reviewed within 24 hours."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════════════════════
  notes: {
    patterns: [
      'note', 'notes', 'rich text', 'editor', 'document', 'writing',
      'category', 'organize', 'search notes', 'delete note', 'lost note',
      'note disappeared', 'formatting', 'bold', 'italic', 'list',
      'note suggestion', 'ai suggestion', 'smart suggestion'
    ],
    responses: {
      default: {
        greeting: "Thank you for your notes feedback.",
        steps: [
          "Notes supports rich text editing with formatting (bold, italic, headings, lists, links).",
          "Organize your notes using categories — create custom categories under Notes → Categories.",
          "Use the search function (Notes → Search) to find notes by title or content keywords.",
          "Notes are auto-saved as you type — you won't lose work if your connection drops.",
          "The Activity Timeline shows your recent note editing activity.",
          "Smart Suggestions provides AI-powered writing prompts and organization tips based on your note content.",
          "The Calendar Widget shows notes organized by creation/modification date.",
          "You can pin important notes to appear at the top of your notes list."
        ],
        closing: "If a note appears to have disappeared, check the search function with different keywords — notes are never deleted automatically."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNT & AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════════════════
  account: {
    patterns: [
      'login', 'sign in', 'sign up', 'register', 'password', 'forgot password',
      'reset password', 'email verification', 'verify email', 'cannot login',
      'locked out', 'session expired', 'two factor', '2fa', 'authenticator',
      'otp login', 'magic link', 'social login', 'google login',
      'account suspended', 'account disabled', 'delete account',
      'change email', 'change password', 'kyc', 'verification'
    ],
    responses: {
      default: {
        greeting: "We've received your account-related concern.",
        steps: [
          "If you can't login: try the 'Forgot Password' link on the login page to reset via email.",
          "Email verification: check your spam/junk folder if you haven't received the verification email.",
          "Session expired: for security, sessions expire after extended inactivity. Simply log in again.",
          "Two-factor authentication (2FA): enable or manage under Settings → Security → Two-Factor Authentication.",
          "Password requirements: minimum 8 characters, including at least one number and one special character.",
          "Active sessions: view and manage all logged-in devices under Settings → Security → Active Sessions.",
          "Account deletion: this is permanent and irreversible. Contact support for assistance.",
          "KYC verification: required for higher transaction limits. Submit under Settings → Verification."
        ],
        closing: "Account security is our top priority. If you suspect unauthorized access, immediately change your password and enable 2FA."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS & PROFILE
  // ═══════════════════════════════════════════════════════════════════════════
  settings: {
    patterns: [
      'settings', 'profile', 'avatar', 'username', 'display name',
      'theme', 'dark mode', 'light mode', 'language', 'timezone',
      'notification settings', 'email notifications', 'push notifications',
      'privacy', 'block', 'mute', 'profile picture', 'bio',
      'public profile', 'edit profile'
    ],
    responses: {
      default: {
        greeting: "Thank you for your settings/profile feedback.",
        steps: [
          "Profile: update your avatar, display name, bio, and username under Settings → Profile.",
          "Username: can be changed but must be unique. It's used for P2P transfers and profile sharing.",
          "Theme: NoteStandard supports dark mode by default. Theme preferences are under Settings → Appearance.",
          "Notifications: manage email, push, and in-app notification preferences under Settings → Notifications.",
          "Privacy: control who can see your profile, send you messages, and find you in search under Settings → Privacy.",
          "Public Profile: your public profile page is shareable — it shows your display name, avatar, and bio.",
          "Security settings: password, 2FA, sessions, and PIN management are under Settings → Security.",
          "To update your profile picture, tap your avatar in Settings → Profile → Upload Image."
        ],
        closing: "All settings changes take effect immediately. If a setting isn't saving, try refreshing the page and ensuring you click 'Save' after making changes."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTIONS & HISTORY
  // ═══════════════════════════════════════════════════════════════════════════
  transactions: {
    patterns: [
      'transaction', 'history', 'receipt', 'transaction id', 'reference',
      'transaction details', 'export', 'csv', 'statement', 'ledger',
      'pending transaction', 'failed transaction', 'reversed',
      'transaction list', 'filter', 'search transaction'
    ],
    responses: {
      default: {
        greeting: "Thank you for your transaction-related query.",
        steps: [
          "All transactions are viewable under Dashboard → Transactions.",
          "Use filters to narrow by type (deposit, withdrawal, swap, transfer), status (success, pending, failed), and date range.",
          "Each transaction has a unique Transaction ID — use this when contacting support about specific transactions.",
          "Transaction receipts can be viewed by tapping on any transaction in your history.",
          "Pending transactions: deposits and withdrawals may take time to process depending on the payment method.",
          "Failed transactions: funds from failed deposits are not deducted; failed withdrawals return funds to your wallet automatically.",
          "Reversed transactions appear as separate entries showing the original and the reversal.",
          "The Ledger Trail view (Wallet → Ledger) shows the complete accounting trail for every movement."
        ],
        closing: "Our transaction system maintains a complete audit trail. Every movement of funds is recorded and traceable."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BILLING & SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  billing: {
    patterns: [
      'billing', 'subscription', 'plan', 'upgrade', 'downgrade',
      'premium', 'free plan', 'paid plan', 'invoice', 'billing cycle',
      'cancel subscription', 'trial', 'limit', 'transaction limit',
      'increase limit', 'limit request'
    ],
    responses: {
      default: {
        greeting: "Thank you for your billing inquiry.",
        steps: [
          "Your current plan and billing details are viewable under Dashboard → Billing.",
          "Free plan includes basic features. Premium plans unlock higher transaction limits and advanced features.",
          "To upgrade your plan, go to Billing → Plans → select your preferred plan → Pay.",
          "Transaction limits vary by plan tier. View your current limits under Billing → Limits.",
          "To request a limit increase, go to Billing → Limit Request and submit your request with justification.",
          "Invoices for past payments are available under Billing → Invoices.",
          "To cancel a subscription, go to Billing → Manage Subscription → Cancel. Active time remains until the billing period ends.",
          "Plan changes take effect immediately for upgrades and at the end of the billing period for downgrades."
        ],
        closing: "If you have specific billing questions about charges, refunds, or plan comparisons, please include your billing email or plan name in your report."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AFFILIATES & REFERRALS
  // ═══════════════════════════════════════════════════════════════════════════
  affiliates: {
    patterns: [
      'affiliate', 'referral', 'refer', 'invite friend', 'referral code',
      'referral link', 'commission', 'earnings', 'payout', 'referral bonus',
      'affiliate program', 'share link', 'affiliate dashboard'
    ],
    responses: {
      default: {
        greeting: "Thank you for your interest in our affiliate/referral program.",
        steps: [
          "Your unique referral link is available under Dashboard → Affiliates.",
          "Share your referral link with friends — they sign up using your link and you both benefit.",
          "Track your referral sign-ups, active referrals, and earned commissions on the Affiliates dashboard.",
          "Commission rates and bonus structures are detailed on the Affiliates page.",
          "Earned commissions are credited to your NoteStandard wallet and can be withdrawn like regular funds.",
          "Referral bonuses are typically credited after the referred user completes their first transaction.",
          "There's no limit to the number of people you can refer."
        ],
        closing: "If your referral commission isn't appearing, ensure your referred friend signed up using your exact referral link and completed the required actions."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  notification: {
    patterns: [
      'notification', 'push notification', 'alert', 'bell',
      'not receiving notifications', 'too many notifications', 'email notification',
      'in-app notification', 'notification settings', 'unread',
      'notification badge', 'sound', 'vibration'
    ],
    responses: {
      default: {
        greeting: "Thank you for your notification feedback.",
        steps: [
          "In-app notifications appear via the bell icon in the top navigation bar.",
          "Push notifications require browser permission — ensure you've allowed notifications for NoteStandard.",
          "Email notifications can be toggled under Settings → Notifications → Email Preferences.",
          "Not receiving push notifications? Check: 1) Browser permissions, 2) Device Do Not Disturb mode, 3) NoteStandard notification settings.",
          "Too many notifications? Customize which events trigger notifications under Settings → Notifications.",
          "The notification badge (red dot) shows the count of unread notifications.",
          "Mark all as read by clicking 'Mark All Read' in the notifications panel.",
          "Transaction notifications (deposits, withdrawals, swaps) are enabled by default for security."
        ],
        closing: "If you're not receiving notifications despite having them enabled, try uninstalling and reinstalling the PWA, or clearing your browser notification permissions and re-allowing."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADS & PROMOTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  ads: {
    patterns: [
      'ad', 'advertisement', 'promotion', 'sponsor', 'advertise',
      'ad manager', 'create ad', 'ad campaign', 'ad performance',
      'community ads', 'promoted post', 'ad budget'
    ],
    responses: {
      default: {
        greeting: "Thank you for your advertising feedback.",
        steps: [
          "NoteStandard offers in-app advertising for businesses through the Ad Manager.",
          "To create an ad: go to Ad Manager → Create Campaign → set your audience, budget, and creative.",
          "Ad formats include: banner ads, promoted community posts, and featured listings.",
          "Track ad performance (impressions, clicks, engagement) in the Ad Manager → Analytics.",
          "Community Ads appear in the community feed and are marked as 'Sponsored'.",
          "Ad budgets are set per campaign with daily and total spending limits.",
          "To report an inappropriate ad, use the '...' menu on the ad → Report Ad."
        ],
        closing: "If you need help setting up your first ad campaign or have questions about pricing, our advertising support team can guide you through the process."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DOWNLOAD & PWA
  // ═══════════════════════════════════════════════════════════════════════════
  download: {
    patterns: [
      'download', 'install', 'app', 'pwa', 'progressive web app',
      'mobile app', 'desktop app', 'install app', 'add to home screen',
      'app store', 'play store', 'ios app', 'android app',
      'offline mode', 'app not working', 'update app'
    ],
    responses: {
      default: {
        greeting: "Thank you for your question about the NoteStandard app.",
        steps: [
          "NoteStandard is available as a Progressive Web App (PWA) — installable directly from your browser.",
          "To install on mobile: visit notestandard.com → tap 'Add to Home Screen' from your browser menu.",
          "To install on desktop (Chrome): click the install icon in the address bar, or Menu → Install NoteStandard.",
          "The PWA works offline for cached content (notes, messages) and syncs when connection is restored.",
          "For the latest features, ensure your PWA is up to date — it updates automatically in the background.",
          "Find download instructions and QR codes under Dashboard → Download.",
          "If the app feels outdated, try clearing the app cache: Settings → Clear Cache (in your device settings for the PWA).",
          "Native iOS and Android apps may be available in the future — check the Download page for updates."
        ],
        closing: "The PWA provides a native app-like experience with push notifications, offline support, and home screen access."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRENDS & ANALYTICS (User Dashboard)
  // ═══════════════════════════════════════════════════════════════════════════
  trends: {
    patterns: [
      'trends', 'analytics', 'statistics', 'spending', 'income',
      'chart', 'graph', 'financial summary', 'monthly report',
      'spending pattern', 'category breakdown', 'trend analysis'
    ],
    responses: {
      default: {
        greeting: "Thank you for your trends/analytics feedback.",
        steps: [
          "Trends & Analytics is your personal financial dashboard available under Dashboard → Trends.",
          "View spending and income patterns over time with interactive charts.",
          "Category breakdowns show where your money flows (transfers, swaps, deposits, withdrawals).",
          "Time range filters let you analyze weekly, monthly, quarterly, and yearly trends.",
          "Portfolio allocation charts show how your funds are distributed across different currencies.",
          "Export your financial data using Dashboard → Transactions → Export for personal record-keeping.",
          "Analytics data is refreshed in real-time as new transactions occur."
        ],
        closing: "If the analytics data seems incorrect or out of date, try refreshing the page. Data is computed directly from your transaction ledger."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH
  // ═══════════════════════════════════════════════════════════════════════════
  search: {
    patterns: [
      'search', 'find', 'lookup', 'search user', 'search transaction',
      'search message', 'global search', 'search not working',
      'cannot find', 'search results empty'
    ],
    responses: {
      default: {
        greeting: "Thank you for your search-related feedback.",
        steps: [
          "NoteStandard has a universal search function accessible from Dashboard → Search.",
          "Search across: users, transactions, notes, chat messages, and community posts.",
          "User search: find other NoteStandard users by username, display name, or email.",
          "Transaction search: search by amount, reference number, or date range.",
          "Chat search: find messages within conversations by keyword.",
          "If search returns no results, try using different keywords or check for typos.",
          "Search results are filtered by your access level — you can only find content you have permission to view."
        ],
        closing: "If the search function is consistently returning incorrect or empty results, please share the search query you tried so we can investigate."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════════════════════════════════════════
  security: {
    patterns: [
      'security', 'hack', 'unauthorized', 'suspicious', 'phishing',
      'password', 'breach', 'stolen', 'compromise', 'two-factor', '2fa',
      'login attempt', 'someone accessed', 'pin', 'transaction pin',
      'change pin', 'forgot pin', 'suspicious activity', 'account safety'
    ],
    responses: {
      default: {
        greeting: "⚠️ Security concerns are treated with the highest priority.",
        steps: [
          "Immediately change your password if you suspect unauthorized access: Settings → Security → Change Password.",
          "Enable two-factor authentication (2FA) if you haven't already: Settings → Security → Two-Factor Authentication.",
          "Review your recent login history: Settings → Security → Active Sessions.",
          "Log out of all other devices: Settings → Security → Sign Out All Devices.",
          "Change your transaction PIN: Settings → Security → Transaction PIN.",
          "Do NOT share your PIN, password, or recovery codes with anyone — NoteStandard staff will NEVER ask for these.",
          "If you received a suspicious email or link claiming to be from NoteStandard, do NOT click it — forward it to our security team.",
          "Review recent transactions for any unauthorized activity under Dashboard → Transactions."
        ],
        closing: "🔒 This report has been flagged as a SECURITY PRIORITY and will be reviewed by our security team. If you believe your account has been compromised, secure your email account as well since it's used for password resets."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE & ERRORS
  // ═══════════════════════════════════════════════════════════════════════════
  performance: {
    patterns: [
      'slow', 'lag', 'freeze', 'crash', 'loading', 'hang', 'stuck',
      'unresponsive', 'timeout', 'error', 'blank screen', 'white screen',
      'not loading', 'spinning', 'page crash', 'javascript error',
      '500 error', '404', 'server error', 'connection error', 'network error'
    ],
    responses: {
      default: {
        greeting: "We take performance issues seriously — thank you for reporting this.",
        steps: [
          "Try clearing your browser cache and cookies: Settings → Privacy → Clear Browsing Data.",
          "Disable browser extensions that might interfere (ad blockers, VPNs, privacy extensions).",
          "Check if the issue occurs on a different browser (Chrome, Firefox, Safari, Edge).",
          "Ensure your browser is updated to the latest version.",
          "If on mobile, try switching between WiFi and mobile data to rule out network issues.",
          "Close other resource-heavy tabs or applications consuming memory.",
          "Try accessing NoteStandard in incognito/private browsing mode to rule out extension conflicts.",
          "If you see a specific error code (500, 404), please include it in your report — it helps us pinpoint the issue."
        ],
        closing: "We've captured diagnostic telemetry from your session which will help our engineering team identify the root cause. Performance fixes are treated as high-priority."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BUG REPORTS
  // ═══════════════════════════════════════════════════════════════════════════
  bug_report: {
    patterns: [
      'bug', 'broken', 'not working', 'issue', 'problem',
      'fail', 'glitch', 'unexpected', 'wrong', 'incorrect behavior'
    ],
    responses: {
      default: {
        greeting: "Thank you for reporting this bug — your feedback directly improves NoteStandard.",
        steps: [
          "We've captured your device information and session telemetry to help diagnose the issue.",
          "Try refreshing the page or restarting the app to see if the issue resolves.",
          "If you provided reproduction steps, that helps us fix it much faster.",
          "Check if the issue occurs consistently or only in specific conditions (certain browser, time of day, etc.).",
          "Screenshots or screen recordings are extremely helpful — attach them to this report if possible."
        ],
        closing: "Our engineering team reviews all bug reports daily. Critical bugs are patched within 24-48 hours, and you'll be notified when a fix is deployed."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE REQUESTS
  // ═══════════════════════════════════════════════════════════════════════════
  feature_request: {
    patterns: [
      'feature', 'suggest', 'wish', 'would be nice', 'add', 'implement',
      'support for', 'ability to', 'option to', 'please add', 'request',
      'improvement', 'enhance', 'new feature', 'missing feature'
    ],
    responses: {
      default: {
        greeting: "Great idea! We love feature suggestions from our community.",
        steps: [
          "Your feature request has been added to our product backlog for evaluation.",
          "Other users can upvote this request — popular features are prioritized for development.",
          "Track the status of your request in the 'Roadmap' tab of your issue tracker.",
          "High-demand features are fast-tracked into our development sprints.",
          "We regularly ship new features based on community feedback — check the Changelog for recent releases."
        ],
        closing: "Thank you for helping shape the future of NoteStandard! We'll update this ticket when your feature enters development planning."
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL / CATCHALL
  // ═══════════════════════════════════════════════════════════════════════════
  general: {
    patterns: [],
    responses: {
      default: {
        greeting: "Thank you for reaching out to NoteStandard Support.",
        steps: [
          "We've received your message and our support team is reviewing it.",
          "Here's a quick guide to NoteStandard's main features:",
          "• **Wallet**: Multi-currency wallet supporting NGN, USD, EUR, GBP, BTC, ETH, USDT, USDC",
          "• **Exchange Hub**: Swap between any supported currencies at live market rates",
          "• **Chat**: Real-time messaging with voice/video calls, file sharing, and group chats",
          "• **Teams**: Collaborative workspaces with projects, tasks, meetings, and file sharing",
          "• **Community**: Social feed with posts, comments, spaces, and content discovery",
          "• **Notes**: Rich text note-taking with categories, search, and AI-powered suggestions",
          "• **Trends**: Personal financial analytics and spending insights",
          "For specific help, try describing your issue with details about which feature you're using."
        ],
        closing: "Our team typically responds within a few hours during business hours. Critical issues (payments, security) are handled around the clock."
      }
    }
  }
};

// ─── Follow-Up Response Templates ───────────────────────────────────────────

const FOLLOW_UP_TEMPLATES = {
  gratitude: {
    patterns: ['thank', 'thanks', 'appreciate', 'helpful', 'great', 'awesome', 'resolved', 'fixed', 'working now', 'sorted', 'solved'],
    response: "You're welcome! We're glad we could help. If you encounter any other issues, don't hesitate to reach out. Your feedback helps us improve NoteStandard for everyone. 🎉"
  },
  still_broken: {
    patterns: ['still', 'not fixed', 'still happening', 'same issue', 'same problem', 'didn\'t work', 'not working', 'again', 'keeps happening', 'persists', 'recurring'],
    response: "We're sorry the issue is persisting. We've escalated this to our senior engineering team for a deeper investigation. Could you please provide:\n\n1. The exact time the issue last occurred\n2. Any error messages you see on screen\n3. Which browser/device you're using\n4. A screenshot if possible\n\nThis additional context will help us pinpoint the root cause faster."
  },
  urgency: {
    patterns: ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'money', 'stuck', 'can\'t access', 'locked out', 'help me', 'please help'],
    response: "We understand the urgency of your situation. This has been escalated to our priority response queue. Our team is actively investigating and will provide an update shortly.\n\nIf this involves a financial transaction, rest assured that all funds are secured in our multi-ledger system and fully traceable."
  },
  question: {
    patterns: ['how', 'where', 'when', 'what', 'can i', 'is it possible', 'how do i', 'how to', 'where is', 'where can'],
    response: "Great question! Here are some resources that might help:\n\n• **Dashboard Home**: Overview of your account, wallet balances, and recent activity\n• **Wallet**: Dashboard → Wallet for balances, deposits, withdrawals, swaps\n• **Transactions**: Dashboard → Transactions for complete transaction history\n• **Chat**: Dashboard → Chat for messaging and calls\n• **Teams**: Dashboard → Teams for collaborative workspaces\n• **Community**: Dashboard → Feed for social posts and spaces\n• **Notes**: Dashboard → Notes for rich text note-taking\n• **Settings**: Dashboard → Settings for profile, security, notifications, and preferences\n• **Billing**: Dashboard → Billing for plans, limits, and invoices\n• **Search**: Dashboard → Search to find users, transactions, and content\n\nIf your question isn't covered above, please provide more details and we'll give you a specific answer."
  },
  additional_info: {
    patterns: ['here is', 'attached', 'screenshot', 'video', 'i tried', 'i did', 'update', 'more info', 'additional', 'details'],
    response: "Thank you for providing additional details — this is very helpful for our investigation. We've updated your report with this new information. Our engineering team will factor this into their diagnosis. We'll keep you posted on progress."
  },
  confirmation: {
    patterns: ['ok', 'okay', 'alright', 'got it', 'understand', 'noted', 'will do', 'i\'ll try', 'let me try'],
    response: "Sounds good! Please try the suggested steps and let us know if the issue resolves. We're here if you need any further assistance. 💪"
  }
};

class AISupportEngine {
  /**
   * Generate an auto-reply for a newly created feedback report.
   * @param {Object} report - The created report object
   * @returns {Object} - { content: string, metadata: object }
   */
  generateAutoReply(report) {
    try {
      const category = (report.category_id || report.categoryId || 'general').toLowerCase();
      const description = (report.description || report.comment || '').toLowerCase();
      const title = (report.title || '').toLowerCase();
      const priority = (report.priority || 'medium').toLowerCase();
      const combinedText = `${title} ${description}`;

      // Find the best matching category from knowledge base
      const kbCategory = this._findBestCategory(category, combinedText);
      const kbEntry = KNOWLEDGE_BASE[kbCategory] || KNOWLEDGE_BASE.general;

      // Find the best sub-response within the category
      const subResponse = this._findBestSubResponse(kbEntry, combinedText);

      // Build the response
      const content = this._buildResponse(subResponse, priority, report.title);

      logger.info(`[AISupportEngine] Generated auto-reply for report ${report.id} (category: ${kbCategory}, priority: ${priority})`);

      return {
        content,
        metadata: {
          engine: 'notestandard_ai_support_v2',
          matchedCategory: kbCategory,
          inputCategory: category,
          priority,
          generatedAt: new Date().toISOString(),
          isAutoReply: true,
        }
      };
    } catch (err) {
      logger.error(`[AISupportEngine] generateAutoReply failed: ${err.message}`);
      return {
        content: this._getFallbackResponse(),
        metadata: { engine: 'notestandard_ai_support_v2', fallback: true }
      };
    }
  }

  /**
   * Generate a follow-up reply when a user posts a comment.
   * @param {string} commentContent - The user's follow-up message
   * @param {Object} report - The parent report
   * @returns {Object|null} - { content, metadata } or null if no response needed
   */
  generateFollowUpReply(commentContent, report) {
    try {
      const content = (commentContent || '').toLowerCase().trim();
      if (!content || content.length < 2) return null;

      // Match against follow-up templates (score by number of pattern hits)
      let bestMatch = null;
      let bestScore = 0;

      for (const [templateKey, template] of Object.entries(FOLLOW_UP_TEMPLATES)) {
        const matchScore = template.patterns.filter(p => content.includes(p)).length;
        if (matchScore > bestScore) {
          bestScore = matchScore;
          bestMatch = { key: templateKey, template };
        }
      }

      if (bestMatch && bestScore > 0) {
        logger.info(`[AISupportEngine] Follow-up matched: ${bestMatch.key} (score: ${bestScore})`);
        return {
          content: bestMatch.template.response,
          metadata: {
            engine: 'notestandard_ai_support_v2',
            template: bestMatch.key,
            matchScore: bestScore,
            generatedAt: new Date().toISOString(),
            isAutoReply: true,
          }
        };
      }

      // If no template matched, generate a contextual response using the report category
      const category = (report.category_id || report.categoryId || 'general').toLowerCase();
      const kbCategory = this._findBestCategory(category, content);

      return {
        content: `Thank you for your follow-up. Our support team has been notified and is reviewing your update regarding this ${this._friendlyCategory(kbCategory)} issue.\n\nIf you need immediate assistance, you can also try the troubleshooting steps mentioned in our initial response above.\n\nWe aim to respond to all follow-ups within a few hours during business hours.\n\n— NoteStandard Support AI 🤖`,
        metadata: {
          engine: 'notestandard_ai_support_v2',
          template: 'contextual_followup',
          detectedCategory: kbCategory,
          generatedAt: new Date().toISOString(),
          isAutoReply: true,
        }
      };
    } catch (err) {
      logger.error(`[AISupportEngine] generateFollowUpReply failed: ${err.message}`);
      return null;
    }
  }

  // ─── Internal Helpers ──────────────────────────────────────────────────

  /**
   * Find the best matching knowledge base category.
   * Uses the category ID first, then falls back to description pattern matching.
   */
  _findBestCategory(categoryId, description) {
    // Direct category match
    if (KNOWLEDGE_BASE[categoryId]) return categoryId;

    // Pattern matching across all categories
    let bestMatch = 'general';
    let bestScore = 0;

    for (const [cat, kb] of Object.entries(KNOWLEDGE_BASE)) {
      if (!kb.patterns || kb.patterns.length === 0) continue;
      const score = kb.patterns.filter(p => description.includes(p)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cat;
      }
    }

    return bestMatch;
  }

  /**
   * Find the best sub-response within a category.
   */
  _findBestSubResponse(kbEntry, description) {
    const responses = kbEntry.responses || {};

    let bestKey = 'default';
    let bestScore = 0;

    for (const [key, _resp] of Object.entries(responses)) {
      if (key === 'default') continue;
      const subPatterns = key.split('_');
      const matches = subPatterns.filter(p => description.includes(p)).length;
      if (matches > bestScore) {
        bestScore = matches;
        bestKey = key;
      }
    }

    return responses[bestKey] || responses.default || KNOWLEDGE_BASE.general.responses.default;
  }

  /**
   * Build a formatted response from a response template.
   */
  _buildResponse(template, priority, title) {
    const parts = [];

    parts.push(template.greeting);
    parts.push('');

    // Priority badges
    if (priority === 'critical') {
      parts.push('🚨 **Priority: CRITICAL** — This report has been flagged for immediate attention by our senior engineering team.');
      parts.push('');
    } else if (priority === 'high') {
      parts.push('⚡ **Priority: HIGH** — This report is being fast-tracked to our engineering team.');
      parts.push('');
    }

    // Troubleshooting steps
    if (template.steps && template.steps.length > 0) {
      parts.push('Here are some things you can try while we investigate:');
      parts.push('');
      template.steps.forEach((step, idx) => {
        parts.push(`${idx + 1}. ${step}`);
      });
      parts.push('');
    }

    parts.push(template.closing);
    parts.push('');
    parts.push('— NoteStandard Support AI 🤖');

    return parts.join('\n');
  }

  /**
   * Convert category key to friendly display name.
   */
  _friendlyCategory(cat) {
    const map = {
      payment: 'payment', wallet: 'wallet', swap: 'currency exchange',
      withdrawal: 'withdrawal', transfer: 'transfer', chat: 'chat',
      teams: 'teams/workspace', community: 'community', notes: 'notes',
      account: 'account', settings: 'settings', transactions: 'transaction',
      billing: 'billing', affiliates: 'affiliate', notification: 'notification',
      ads: 'advertising', download: 'app/download', trends: 'analytics',
      search: 'search', security: 'security', performance: 'performance',
      bug_report: 'bug', feature_request: 'feature', general: 'general',
    };
    return map[cat] || cat;
  }

  /**
   * Fallback response when everything fails.
   */
  _getFallbackResponse() {
    return [
      "Thank you for contacting NoteStandard Support.",
      "",
      "We've received your report and our team is reviewing it. We aim to respond to all reports within a few hours during business hours.",
      "",
      "In the meantime, here are some general tips:",
      "1. Try refreshing the page or restarting the app",
      "2. Clear your browser cache if experiencing display issues",
      "3. Check your internet connection for connectivity problems",
      "4. Visit Dashboard → Transactions for any payment-related concerns",
      "5. Add more details or screenshots to this report to help us investigate faster",
      "",
      "— NoteStandard Support AI 🤖"
    ].join('\n');
  }
}

module.exports = new AISupportEngine();
