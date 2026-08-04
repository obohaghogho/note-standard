/**
 * Chat Web Worker
 * Offloads heavy tasks (IndexedDB serialization, queue synchronization, checksum generation)
 * off the main React UI thread.
 */

export interface WorkerMessage<T = unknown> {
  id: string;
  type: 'SERIALIZE_CACHE' | 'COMPUTE_CHECKSUM' | 'DESERIALIZE_CACHE';
  payload: T;
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;

  try {
    if (type === 'SERIALIZE_CACHE') {
      const json = JSON.stringify(payload);
      self.postMessage({ id, type, success: true, result: json });
    } else if (type === 'DESERIALIZE_CACHE') {
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
      self.postMessage({ id, type, success: true, result: parsed });
    } else if (type === 'COMPUTE_CHECKSUM') {
      const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
      }
      self.postMessage({ id, type, success: true, result: hash.toString(16) });
    }
  } catch (err) {
    self.postMessage({ id, type, success: false, error: (err as Error).message });
  }
};
