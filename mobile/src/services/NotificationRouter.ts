import EventEmitter from './EventEmitter';
import { navigationRef } from '../navigation/AppNavigator';
import { AuthService } from './AuthService';

/**
 * Deep-navigates to the Chat screen inside the nested navigator tree:
 * AppNavigator → MainStack (MainTabs) → Chat tab → ChatStack → Chat screen
 *
 * Navigates immediately to prevent landing on Home page, then enriches
 * the conversation object in the background.
 */
async function deepNavigateToChat(conversationId: string) {
  try {
    if (!navigationRef.isReady()) {
      console.warn('[ACCOUNT_FORENSIC] Navigation container not ready — aborting navigate');
      return;
    }

    console.log(`[ACCOUNT_FORENSIC] Deep navigating to Chat screen, conversationId=${conversationId}`);

    // Immediate non-blocking navigation so the user lands on the Chat screen instantly
    (navigationRef as any).navigate('MainTabs', {
      screen: 'Chat',
      params: {
        screen: 'Chat',
        params: { conversationId, conversation: null },
      },
    });

    // Best-effort background pre-fetch to enrich full conversation profile/member metadata
    try {
      const apiClient = require('../api/apiClient').default;
      const res = await apiClient.get(`/chat/conversations`);
      const conversations: any[] = res.data || [];
      const conversation = conversations.find((c: any) => c.id === conversationId) || null;

      if (conversation && navigationRef.isReady()) {
        (navigationRef as any).navigate('MainTabs', {
          screen: 'Chat',
          params: {
            screen: 'Chat',
            params: { conversationId, conversation },
          },
        });
      }
    } catch (apiErr) {
      console.warn('[ACCOUNT_FORENSIC] Non-blocking conversation pre-fetch notice:', apiErr);
    }
  } catch (err) {
    console.error('[ACCOUNT_FORENSIC] deepNavigateToChat error:', err);
  }
}

class NotificationRouterService {
  private resolveReadyQueue: Record<string, ((value: boolean | PromiseLike<boolean>) => void)[]> = {};
  private isAppReady = false;
  private pendingTapData: any = null;

  setAppReady() {
    this.isAppReady = true;
    console.log('[ACCOUNT_FORENSIC] App is ready. Checking for cold-boot or queued notification tap.');

    try {
      const Notifications = require('expo-notifications');
      Notifications.getLastNotificationResponseAsync()
        .then((response: any) => {
          if (response && response.notification?.request?.content?.data) {
            const data = response.notification.request.content.data;
            console.log('[ACCOUNT_FORENSIC] ❄️ Cold boot notification tap detected:', JSON.stringify(data));
            this.handleNotificationTap(data);
          } else if (this.pendingTapData) {
            const data = this.pendingTapData;
            this.pendingTapData = null;
            this.handleNotificationTap(data);
          }
        })
        .catch((err: any) => {
          console.warn('[ACCOUNT_FORENSIC] Error checking getLastNotificationResponseAsync:', err);
          if (this.pendingTapData) {
            const data = this.pendingTapData;
            this.pendingTapData = null;
            this.handleNotificationTap(data);
          }
        });
    } catch (err: any) {
      if (this.pendingTapData) {
        const data = this.pendingTapData;
        this.pendingTapData = null;
        this.handleNotificationTap(data);
      }
    }
  }

  async handleNotificationTap(data: any) {
    if (!this.isAppReady) {
      console.log('[ACCOUNT_FORENSIC] App not ready yet. Queuing notification tap:', JSON.stringify(data));
      this.pendingTapData = data;
      return;
    }

    console.log('[ACCOUNT_FORENSIC] Handling Notification Tap:', JSON.stringify(data));

    try {
      // Support top-level, nested, and Firebase data payload structures
      const payload = data?.data ?? data;
      const targetAccountId =
        payload?.targetAccountId ||
        payload?.target_account_id ||
        payload?.targetUserId ||
        payload?.target_user_id ||
        payload?.recipientId ||
        payload?.recipient_id ||
        payload?.receiver_id ||
        payload?.receiverId;

      const conversationId =
        payload?.conversationId ||
        payload?.conversation_id ||
        payload?.chat_id ||
        payload?.id;

      const type = payload?.type || payload?.notification_type;

      console.log(`[ACCOUNT_FORENSIC] Parsed payload — type=${type}, conversationId=${conversationId}, targetAccountId=${targetAccountId}`);

      // Any payload with a conversationId is a chat-related notification
      const isChatNotif =
        !!conversationId ||
        ['message', 'chat_message', 'chat_request', 'chat_accepted', 'chat', 'text', 'new_message', 'mention'].includes(
          String(type || '').toLowerCase()
        );

      if (!targetAccountId) {
        console.log('[ACCOUNT_FORENSIC] No targetAccountId in payload — navigating directly to conversation.');
        if (isChatNotif && conversationId) {
          await deepNavigateToChat(conversationId);
        }
        return;
      }

      const isSameAccount = (id1?: string | null, id2?: string | null) =>
        !!id1 && !!id2 && id1.trim().toLowerCase() === id2.trim().toLowerCase();

      const currentUser = await AuthService.getUser();
      console.log(`[ACCOUNT_FORENSIC] Current active account: ${currentUser?.id} | Target account: ${targetAccountId}`);

      if (!isSameAccount(currentUser?.id, targetAccountId)) {
        const storedAccounts = await AuthService.getStoredAccounts();
        const cleanTarget = String(targetAccountId).trim().toLowerCase();
        const storedAccount = storedAccounts.find(a => a.id && a.id.trim().toLowerCase() === cleanTarget);

        if (!storedAccount) {
          console.error(`[ACCOUNT_FORENSIC] ❌ Account ${targetAccountId} NOT found in local storage. Available accounts:`, storedAccounts.map(a => a.id));
          // If target account is missing from device storage, still attempt chat navigation on active session if conversationId exists
          if (isChatNotif && conversationId) {
            await deepNavigateToChat(conversationId);
          }
          return;
        }

        console.log(`[ACCOUNT_FORENSIC] Switching active account: ${currentUser?.id} → ${targetAccountId}`);

        // Set up the ready promise BEFORE emitting the switch event
        const readyPromise = this.waitForReady(targetAccountId);
        EventEmitter.emit('notification:switch_account', { userId: targetAccountId });

        try {
          const success = await readyPromise;
          if (!success) {
            console.warn(`[ACCOUNT_FORENSIC] ❌ Account switch failed or timed out. Attempting best-effort navigation...`);
          } else {
            console.log(`[ACCOUNT_FORENSIC] ✅ Account ${targetAccountId} is fully ready.`);
          }
        } catch (switchErr) {
          console.error('[ACCOUNT_FORENSIC] ❌ Account switch error:', switchErr);
        }

        // Give React one tick to commit context updates before navigation
        await new Promise(resolve => setTimeout(resolve, 150));
      } else {
        console.log('[ACCOUNT_FORENSIC] Already on correct target account — skipping switch.');
      }

      if (isChatNotif && conversationId) {
        await deepNavigateToChat(conversationId);
      } else {
        console.log('[ACCOUNT_FORENSIC] Notification type/payload handled without deep chat route:', type);
      }

    } catch (err) {
      console.error('[ACCOUNT_FORENSIC] Fatal error in handleNotificationTap:', err);
    }
  }

  waitForReady(userId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.resolveReadyQueue[userId]) {
        this.resolveReadyQueue[userId] = [];
      }
      this.resolveReadyQueue[userId].push(resolve);

      const timeout = setTimeout(() => {
        const queue = this.resolveReadyQueue[userId];
        if (queue) {
          const idx = queue.indexOf(resolve);
          if (idx > -1) {
            queue.splice(idx, 1);
          }
        }
        console.warn(`[ACCOUNT_FORENSIC] ⏰ Timeout waiting for account ready signal: ${userId}`);
        resolve(false);
      }, 5000);

      const originalResolve = resolve;
      this.resolveReadyQueue[userId][this.resolveReadyQueue[userId].length - 1] = (success: boolean | PromiseLike<boolean>) => {
        clearTimeout(timeout);
        originalResolve(success);
      };
    });
  }

  signalAccountReady(userId: string, success: boolean = true) {
    console.log(`[ACCOUNT_FORENSIC] signalAccountReady called for: ${userId} with success=${success}`);
    const queue = this.resolveReadyQueue[userId];
    if (queue && queue.length > 0) {
      queue.forEach(resolve => resolve(success));
      this.resolveReadyQueue[userId] = [];
    } else {
      console.warn(`[ACCOUNT_FORENSIC] signalAccountReady called but no listeners for: ${userId}`);
    }
  }
}

export const NotificationRouter = new NotificationRouterService();
