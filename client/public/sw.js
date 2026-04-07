/**
 * NoteStandard — Service Worker (Safe-Mode)
 * 
 * This file is purposefully minimal to resolve caching 
 * and production 'white screen' issues.
 */

self.addEventListener('install', () => {
    // We don't skipWaiting automatically anymore to allow for the UI notification
});

self.addEventListener('activate', (event) => {
    // Unclaim all potential clients and clear caches
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.map((k) => caches.delete(k)));
        })
    );
});

// Enable the browser to skip waiting for the new SW to take control
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Avoid intercepting any fetches during this "recovery" phase
self.addEventListener('fetch', () => {
    // No-op. Just let the browser handle it.
});
