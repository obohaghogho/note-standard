/**
 * Utility to persistently identify a device for Push Notification routing.
 * Stores the UUID in both LocalStorage and IndexedDB to survive basic cache clears.
 */

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Simple IndexedDB wrapper for fallback persistence
const DB_NAME = 'NoteStandardDeviceDB';
const STORE_NAME = 'device_store';
const KEY_NAME = 'device_id';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFromIDB(): Promise<string | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_NAME);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function setToIDB(id: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(id, KEY_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('Failed to set IDB', e);
  }
}

export async function getDeviceId(): Promise<string> {
  let id = localStorage.getItem('notestandard_device_id');
  if (id) {
    // Sync to IDB just in case
    await setToIDB(id);
    return id;
  }

  id = await getFromIDB();
  if (id) {
    // Sync to LS just in case
    localStorage.setItem('notestandard_device_id', id);
    return id;
  }

  id = generateUUID();
  localStorage.setItem('notestandard_device_id', id);
  await setToIDB(id);
  return id;
}

export function getDeviceMetadata() {
  const userAgent = navigator.userAgent;
  let platform = 'Unknown';
  if (/android/i.test(userAgent)) platform = 'Android';
  else if (/iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) platform = 'iOS';
  else if (/Win/.test(userAgent)) platform = 'Windows';
  else if (/Mac/.test(userAgent)) platform = 'MacOS';
  else if (/Linux/.test(userAgent)) platform = 'Linux';

  let browser = 'Unknown';
  if (/Chrome/.test(userAgent)) browser = 'Chrome';
  else if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) browser = 'Safari';
  else if (/Firefox/.test(userAgent)) browser = 'Firefox';

  return {
    platform,
    browser,
    device_name: `${platform} ${browser}`
  };
}
