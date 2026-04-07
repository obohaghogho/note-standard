/**
 * NoteStandard — Service Worker (Safe-Mode)
 * 
 * This file is purposefully minimal to resolve caching 
 * and production 'white screen' issues.
 */

self.addEventListener('install', () => {
    // Force skip waiting to ensure the new "empty" worker takes over immediately
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Unclaim all potential clients and clear caches
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.map((k) => caches.delete(k)));
        })
    );
});

// Avoid intercepting any fetches during this "recovery" phase
self.addEventListener('fetch', () => {
    // No-op. Just let the browser handle it.
});
