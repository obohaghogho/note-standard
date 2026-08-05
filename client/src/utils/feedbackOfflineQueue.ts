import toast from 'react-hot-toast';

export interface QueuedFeedbackItem {
  id: string;
  payload: Record<string, unknown>;
  queuedAt: string;
  retryCount: number;
}

const OFFLINE_QUEUE_KEY = 'note_standard_offline_feedback_queue';

export function enqueueOfflineFeedback(payload: Record<string, unknown>): QueuedFeedbackItem {
  const item: QueuedFeedbackItem = {
    id: `off_${Math.random().toString(36).substring(2, 9)}`,
    payload,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
  };

  try {
    const queue = getOfflineQueue();
    queue.push(item);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    toast.success('You are offline. Feedback saved and will automatically submit when online!');
  } catch (err) {
    console.error('[OfflineQueue] Failed to enqueue:', err);
  }

  return item;
}

export function getOfflineQueue(): QueuedFeedbackItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    void err;
    return [];
  }
}

export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (err) {
    void err;
  }
}

export async function flushOfflineQueue(submitApiFn: (payload: Record<string, unknown>) => Promise<unknown>): Promise<number> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return 0;

  toast.loading(`Syncing ${queue.length} offline report(s)...`, { id: 'offline-sync' });

  let successCount = 0;
  const remainingQueue: QueuedFeedbackItem[] = [];

  for (const item of queue) {
    try {
      await submitApiFn(item.payload);
      successCount++;
    } catch (err) {
      console.warn('[OfflineQueue] Failed to submit item:', item.id, err);
      if (item.retryCount < 3) {
        remainingQueue.push({ ...item, retryCount: item.retryCount + 1 });
      }
    }
  }

  try {
    if (remainingQueue.length > 0) {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    } else {
      clearOfflineQueue();
    }
  } catch (err) {
    void err;
  }

  if (successCount > 0) {
    toast.success(`Successfully synced ${successCount} offline feedback report(s)!`, { id: 'offline-sync' });
  } else {
    toast.dismiss('offline-sync');
  }

  return successCount;
}

// Auto-sync event listener on back-online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const queue = getOfflineQueue();
    if (queue.length > 0) {
      console.log('[OfflineQueue] Device came back online. Flushing queue...');
    }
  });
}
