const fs = require('fs');
const path = 'client/src/utils/accountManager.ts';
let code = fs.readFileSync(path, 'utf8');

const target = `  setActiveAccountId(id: string | null) {
    if (id) {
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    }
  },`;

const replacement = `  setActiveAccountId(id: string | null) {
    if (id) {
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    }

    try {
      const request = indexedDB.open('NoteStandardDB', 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sw_state')) {
          db.createObjectStore('sw_state');
        }
      };
      request.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sw_state')) return;
        const tx = db.transaction('sw_state', 'readwrite');
        const store = tx.objectStore('sw_state');
        if (id) {
          store.put(id, 'activeAccountId');
        } else {
          store.delete('activeAccountId');
        }
      };
    } catch (err) {
      console.warn('[AccountManager] Failed to sync activeAccountId to IndexedDB', err);
    }
  },`;

if (code.includes(target)) {
  fs.writeFileSync(path, code.replace(target, replacement));
  console.log('Success LF');
} else {
  const targetCRLF = target.replace(/\n/g, '\r\n');
  if (code.includes(targetCRLF)) {
    fs.writeFileSync(path, code.replace(targetCRLF, replacement.replace(/\n/g, '\r\n')));
    console.log('Success CRLF');
  } else {
    console.log('Failed to find target');
  }
}
