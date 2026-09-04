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
      console.warn('[ACCOUNT_FORENSIC] Navigation container not ready — retrying in 100ms');
      setTimeout(() => deepNavigateToChat(conversationId), 100);
      return;
    }

    console.log(`[ACCOUNT_FORENSIC] Deep navigating to Chat screen, conversationId=${conversationId}`);

    // Immediate non-blocking navigation so the user lands on the Chat screen instantly
    (navigationRef as any).navigate('MainTabs', {
      screen: 'ChatTab',
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
          screen: 'ChatTab',
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

async function deepNavigateToTeam(teamId: string) {
  try {
    if (!navigationRef.isReady()) {
      console.warn('[ACCOUNT_FORENSIC] Navigation container not ready — retrying team navigate in 100ms');
      setTimeout(() => deepNavigateToTeam(teamId), 100);
      return;
    }

    console.log(`[ACCOUNT_FORENSIC] Deep navigating to Team screen, teamId=${teamId}`);

    (navigationRef as any).navigate('MainTabs', {
      screen: 'Teams',
      params: { teamId },
    });
  } catch (err) {
    console.error('[ACCOUNT_FORENSIC] deepNavigateToTeam error:', err);
  }
}

class NotificationRouterService {
  private resolveReadyQueue: Record<string, ((value: boolean | PromiseLike<boolean>) => void)[]> = {};
  private isAppReady = false;
  private pendingTapData: any = null;
  private processedTapKeys = new Set<string>();

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
            this.pendingTapData = null; // Clear pending to prevent double-firing
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
      // Support top-level, nested, stringified, and Firebase data payload structures
      let payload = data?.data ?? data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          console.warn('[ACCOUNT_FORENSIC] Failed to parse string payload:', e);
        }
      }

      const targetAccountId =
        payload?.targetAccountId ||
        payload?.target_account_id ||
        payload?.targetUserId ||
        payload?.target_user_id ||
        payload?.recipientId ||
        payload?.recipient_id ||
        payload?.receiver_id ||
        payload?.receiverId;

      let conversationId =
        payload?.conversationId ||
        payload?.conversation_id ||
        payload?.chat_id ||
        payload?.chatId ||
        payload?.id;

      let teamId =
        payload?.teamId ||
        payload?.team_id;

      // Fallback: extract conversationId / teamId from url string if missing from top-level fields
      if (typeof payload?.url === 'string') {
        if (!conversationId) {
          const convMatch = payload.url.match(/(?:id|conversationId|chat_id)=([a-zA-Z0-9_-]+)/);
          if (convMatch && convMatch[1]) {
            conversationId = convMatch[1];
          }
        }
        if (!teamId) {
          const teamMatch = payload.url.match(/(?:teamId|team_id)=([a-zA-Z0-9_-]+)/);
          if (teamMatch && teamMatch[1]) {
            teamId = teamMatch[1];
          }
        }
      }

      const type = payload?.type || payload?.notification_type;

      // Deduplication check: prevent handling exact same tap twice within 3 seconds
      const tapKey = `${teamId || ''}:${conversationId || ''}:${payload?.messageId || ''}:${type || ''}`;
      if (this.processedTapKeys.has(tapKey)) {
        console.log(`[ACCOUNT_FORENSIC] Skipping duplicate tap execution for key: ${tapKey}`);
        return;
      }
      this.processedTapKeys.add(tapKey);
      setTimeout(() => this.processedTapKeys.delete(tapKey), 3000);

      console.log(`[ACCOUNT_FORENSIC] Parsed payload — type=${type}, conversationId=${conversationId}, teamId=${teamId}, targetAccountId=${targetAccountId}`);

      const isTeamNotif = !!teamId || ['team_message', 'team_call', 'team_call_ended', 'team_invite'].includes(String(type || '').toLowerCase());

      // Any payload with a conversationId is a chat-related notification
      const isChatNotif =
        !!conversationId ||
        ['message', 'chat_message', 'chat_request', 'chat_accepted', 'chat', 'text', 'new_message', 'mention'].includes(
          String(type || '').toLowerCase()
        );

      if (!targetAccountId) {
        console.log('[ACCOUNT_FORENSIC] No targetAccountId in payload — navigating directly.');
        if (isTeamNotif && teamId) {
          await deepNavigateToTeam(teamId);
        } else if (isChatNotif && conversationId) {
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
          if (isTeamNotif && teamId) {
            await deepNavigateToTeam(teamId);
          } else if (isChatNotif && conversationId) {
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

      if (isTeamNotif && teamId) {
        await deepNavigateToTeam(teamId);
      } else if (isChatNotif && conversationId) {
        await deepNavigateToChat(conversationId);
      } else {
        console.log('[ACCOUNT_FORENSIC] Notification type/payload handled without deep route:', type);
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
