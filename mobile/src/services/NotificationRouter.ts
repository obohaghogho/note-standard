import EventEmitter from './EventEmitter';
import { navigationRef } from '../navigation/AppNavigator';
import { AuthService } from './AuthService';

/**
 * Deep-navigates to the Chat screen inside the nested navigator tree:
 * AppNavigator → MainStack (MainTabs) → Chat tab → ChatStack → Chat screen
 *
 * The conversation object must be fetched from the API before navigating
 * so that ChatScreen has the full member list, recipientName, etc.
 */
async function deepNavigateToChat(conversationId: string) {
  try {
    // Fetch the conversation object so ChatScreen has member/profile data
    const apiClient = require('../api/apiClient').default;
    const res = await apiClient.get(`/chat/conversations`);
    const conversations: any[] = res.data || [];
    const conversation = conversations.find((c: any) => c.id === conversationId) || null;

    if (!navigationRef.isReady()) {
      console.warn('[ACCOUNT_FORENSIC] Navigation container not ready — aborting navigate');
      return;
    }

    console.log(`[ACCOUNT_FORENSIC] Deep navigating to Chat screen, conversationId=${conversationId}`);

    // Navigate through the nested stack:
    // MainTabs → Chat tab → Chat screen (inside ChatStack)
    (navigationRef as any).navigate('MainTabs', {
      screen: 'Chat',
      params: {
        screen: 'Chat',
        params: { conversationId, conversation },
      },
    });
  } catch (err) {
    console.error('[ACCOUNT_FORENSIC] deepNavigateToChat error:', err);
    // Best-effort fallback — navigate without conversation object
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('MainTabs', {
        screen: 'Chat',
        params: {
          screen: 'Chat',
          params: { conversationId, conversation: null },
        },
      });
    }
  }
}

class NotificationRouterService {
  private resolveReadyQueue: Record<string, ((value: boolean | PromiseLike<boolean>) => void)[]> = {};
  private isAppReady = false;
  private pendingTapData: any = null;

  setAppReady() {
    this.isAppReady = true;
    console.log('[ACCOUNT_FORENSIC] App is ready. Processing any queued notification tap.');
    if (this.pendingTapData) {
      const data = this.pendingTapData;
      this.pendingTapData = null;
      this.handleNotificationTap(data);
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
      // Support both top-level and nested payload structures (Firebase wraps in data.data)
      const payload = data?.data ?? data;
      const targetAccountId = payload?.targetAccountId || payload?.recipientId;
      const conversationId = payload?.conversationId;
      const type = payload?.type;

      console.log(`[ACCOUNT_FORENSIC] Parsed payload — type=${type}, conversationId=${conversationId}, targetAccountId=${targetAccountId}`);

      if (!targetAccountId) {
        console.log('[ACCOUNT_FORENSIC] No targetAccountId in payload — navigating without account switch.');
        if ((type === 'message' || type === 'chat_message') && conversationId) {
          await deepNavigateToChat(conversationId);
        }
        return;
      }

      const currentUser = await AuthService.getUser();
      console.log(`[ACCOUNT_FORENSIC] Current account: ${currentUser?.id} | Target account: ${targetAccountId}`);

      if (currentUser?.id !== targetAccountId) {
        const storedAccounts = await AuthService.getStoredAccounts();
        const storedAccount = storedAccounts.find(a => a.id === targetAccountId);

        if (!storedAccount) {
          console.error(`[ACCOUNT_FORENSIC] ❌ Account ${targetAccountId} NOT found in local storage. Available accounts:`, storedAccounts.map(a => a.id));
          EventEmitter.emit('notification:account_missing', { targetAccountId });
          return;
        }

        console.log(`[ACCOUNT_FORENSIC] Switching account: ${currentUser?.id} → ${targetAccountId}`);

        // Set up the ready promise BEFORE emitting the event
        const readyPromise = this.waitForReady(targetAccountId);
        EventEmitter.emit('notification:switch_account', { userId: targetAccountId });

        try {
          const success = await readyPromise;
          if (!success) {
            console.warn(`[ACCOUNT_FORENSIC] ❌ Account switch failed. Aborting navigation to prevent Session Expired redirect.`);
            return;
          }
          console.log(`[ACCOUNT_FORENSIC] ✅ Account ${targetAccountId} is fully ready.`);
        } catch (switchErr) {
          console.error('[ACCOUNT_FORENSIC] ❌ Account switch timed out or failed:', switchErr);
          // Don't abort on unknown timeout, try navigation anyway with fresh token
        }

        // Give React one extra tick to commit the setUser() state update
        // before we fire navigation (prevents stale context in ChatScreen).
        await new Promise(resolve => setTimeout(resolve, 150));
      } else {
        console.log('[ACCOUNT_FORENSIC] Already on correct account — skipping switch.');
      }

      if ((type === 'message' || type === 'chat_message') && conversationId) {
        await deepNavigateToChat(conversationId);
      } else {
        console.log('[ACCOUNT_FORENSIC] Notification type not chat_message, no navigation needed:', type);
      }

    } catch (err) {
      console.error('[ACCOUNT_FORENSIC] Fatal error in handleNotificationTap:', err);
    }
  }

  waitForReady(userId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.resolveReadyQueue[userId]) {
        this.resolveReadyQueue[userId] = [];
      }
      this.resolveReadyQueue[userId].push(resolve);

      // Safety timeout — prevents hanging if AuthContext never signals back
      const timeout = setTimeout(() => {
        const queue = this.resolveReadyQueue[userId];
        if (queue) {
          const idx = queue.indexOf(resolve);
          if (idx > -1) {
            queue.splice(idx, 1);
          }
        }
        console.warn(`[ACCOUNT_FORENSIC] ⏰ Timeout waiting for account ready signal: ${userId}`);
        resolve(false); // Resolve false instead of rejecting to avoid unhandled promise rejections
      }, 8000);

      // Override resolve to clear timeout
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
