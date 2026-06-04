import EventEmitter from './EventEmitter';
import { navigate } from '../navigation/AppNavigator';
import { AuthService } from './AuthService';

class NotificationRouterService {
  private resolveReadyQueue: Record<string, ((value: void) => void)[]> = {};

  async handleNotificationTap(data: any) {
    console.log('[ACCOUNT_FORENSIC] Handling Notification Tap', JSON.stringify(data));
    
    try {
      const targetAccountId = data?.targetAccountId || data?.recipientId;
      if (!targetAccountId) {
        console.log('[ACCOUNT_FORENSIC] No target account ID in payload. Proceeding with default navigation.');
        this.navigateBasedOnType(data);
        return;
      }

      console.log(`[ACCOUNT_FORENSIC] Notification Account: ${targetAccountId}`);
      
      const currentUser = await AuthService.getUser();
      console.log(`[ACCOUNT_FORENSIC] Current Account: ${currentUser?.id}`);

      if (currentUser?.id !== targetAccountId) {
        const storedAccount = await AuthService.getStoredAccounts().then(accs => accs.find(a => a.id === targetAccountId));
        
        if (!storedAccount) {
          console.log(`[ACCOUNT_FORENSIC] Account ${targetAccountId} NOT found locally. Emitting account_missing.`);
          EventEmitter.emit('notification:account_missing');
          return;
        }

        console.log(`[ACCOUNT_FORENSIC] Switching Account: ${currentUser?.id} → ${targetAccountId}`);
        
        const readyPromise = this.waitForReady(targetAccountId);
        EventEmitter.emit('notification:switch_account', { userId: targetAccountId });
        
        await readyPromise;
        console.log(`[ACCOUNT_FORENSIC] Account Ready: ${targetAccountId}`);
      }

      console.log(`[ACCOUNT_FORENSIC] Navigating To Context`);
      this.navigateBasedOnType(data);

    } catch (err) {
      console.error('[ACCOUNT_FORENSIC] Error in NotificationRouter:', err);
    }
  }

  private navigateBasedOnType(data: any) {
    const type = data?.type;
    if ((type === 'message' || type === 'chat_message') && data?.conversationId) {
      console.log(`[ACCOUNT_FORENSIC] Navigating To Conversation: ${data.conversationId}`);
      navigate('Chat', { conversationId: data.conversationId });
    } else if (type === 'incoming_call') {
      // Calls handled by CallKeep
    } else {
      navigate('Notifications');
    }
  }

  waitForReady(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.resolveReadyQueue[userId]) {
        this.resolveReadyQueue[userId] = [];
      }
      this.resolveReadyQueue[userId].push(resolve);
      
      // Safety timeout to prevent hanging forever
      setTimeout(() => {
        const index = this.resolveReadyQueue[userId]?.indexOf(resolve);
        if (index > -1) {
          this.resolveReadyQueue[userId].splice(index, 1);
          console.log(`[ACCOUNT_FORENSIC] Timeout waiting for account ready: ${userId}`);
          reject(new Error('Account switch timeout'));
        }
      }, 10000);
    });
  }

  signalAccountReady(userId: string) {
    if (this.resolveReadyQueue[userId]) {
      this.resolveReadyQueue[userId].forEach(resolve => resolve());
      this.resolveReadyQueue[userId] = [];
    }
  }
}

export const NotificationRouter = new NotificationRouterService();
