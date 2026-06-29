import { idbEnqueueAction, idbGetAll, idbDelete, STORES, idbSet } from './indexedDB';

interface QueuedAction {
  id?: number;
  type: string; // 'LIKE', 'COMMENT', 'SAVE', etc.
  payload: any;
  timestamp: number;
  retryCount: number;
}

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000;

class OfflineQueue {
  private isProcessing = false;

  async enqueue(type: string, payload: any): Promise<number> {
    const actionId = await idbEnqueueAction({ type, payload });
    this.processQueue(); // Attempt to process immediately if online
    return actionId;
  }

  async processQueue() {
    if (this.isProcessing || !navigator.onLine) return;
    this.isProcessing = true;

    try {
      const actions: QueuedAction[] = await idbGetAll(STORES.OFFLINE_QUEUE);
      // Sort by timestamp
      actions.sort((a, b) => a.timestamp - b.timestamp);

      for (const action of actions) {
        if (!navigator.onLine) break; // Stop if we go offline during processing

        try {
          await this.executeAction(action);
          await idbDelete(STORES.OFFLINE_QUEUE, action.id!);
        } catch (error: any) {
          console.error('[OfflineQueue] Action failed:', action, error);
          
          if (action.retryCount >= MAX_RETRIES) {
             console.error('[OfflineQueue] Max retries reached, dropping action.');
             await idbDelete(STORES.OFFLINE_QUEUE, action.id!);
          } else {
             // Exponential backoff logic would be handled by delaying the next processQueue call
             // For now, increment retry
             action.retryCount += 1;
             await idbSet(STORES.OFFLINE_QUEUE, action);
             // Break processing loop to apply backoff
             setTimeout(() => this.processQueue(), BASE_BACKOFF_MS * Math.pow(2, action.retryCount));
             break;
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeAction(action: QueuedAction) {
    // In a real app, this routes to the appropriate API calls via supabase
    console.log('[OfflineQueue] Executing:', action.type, action.payload);
    // Simulate network delay
    await new Promise(res => setTimeout(res, 500));
    
    // Example:
    // if (action.type === 'LIKE') await supabase.from('community_likes').insert(action.payload);
  }

  startListening() {
    window.addEventListener('online', () => this.processQueue());
  }
}

export const offlineQueue = new OfflineQueue();
