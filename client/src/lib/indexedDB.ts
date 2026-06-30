/* eslint-disable @typescript-eslint/no-unused-vars */
const DB_NAME = 'notestandard_feed_db';
const DB_VERSION = 1;

export const STORES = {
  FEED_CACHE: 'feed_cache',
  OFFLINE_QUEUE: 'offline_queue',
  DRAFTS: 'drafts',
  USER_PREFS: 'user_prefs'
};

let dbPromise: Promise<IDBDatabase> | null = null;

const initDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => reject(request.error);

    request.onsuccess = (event) => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      
      // Feed Cache Store (tab -> posts)
      if (!db.objectStoreNames.contains(STORES.FEED_CACHE)) {
        db.createObjectStore(STORES.FEED_CACHE, { keyPath: 'tabId' });
      }

      // Offline Queue Store (auto-incrementing ID)
      if (!db.objectStoreNames.contains(STORES.OFFLINE_QUEUE)) {
        const queueStore = db.createObjectStore(STORES.OFFLINE_QUEUE, { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Drafts Store
      if (!db.objectStoreNames.contains(STORES.DRAFTS)) {
        db.createObjectStore(STORES.DRAFTS, { keyPath: 'id' });
      }

      // User Preferences Store
      if (!db.objectStoreNames.contains(STORES.USER_PREFS)) {
        db.createObjectStore(STORES.USER_PREFS, { keyPath: 'key' });
      }
    };
  });

  return dbPromise;
};

// --- Generic Helpers ---

export const idbSet = async <T>(storeName: string, value: T): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const idbGet = async <T = unknown>(storeName: string, key: string | number): Promise<T | undefined> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const idbGetAll = async <T = unknown>(storeName: string): Promise<T[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const idbDelete = async (storeName: string, key: string | number): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// --- Offline Queue Specific Helpers ---

export const idbEnqueueAction = async <T extends Record<string, unknown>>(action: T): Promise<number> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.OFFLINE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.OFFLINE_QUEUE);
    const request = store.add({ ...action, timestamp: Date.now(), retryCount: 0 });
    tx.oncomplete = () => resolve(request.result as number);
    tx.onerror = () => reject(tx.error);
  });
};
