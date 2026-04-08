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

// Handle Push Notifications
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const data = event.data.json();
        const title = data.title || 'New Notification';
        const options = {
            body: data.body || '',
            icon: data.icon || '/logo192.png',
            badge: '/logo192.png',
            data: data.data || {}
        };

        event.waitUntil(self.registration.showNotification(title, options));
    } catch (e) {
        console.error('Error in push event:', e);
        // Fallback for non-JSON push data
        const title = 'New Notification';
        const options = {
            body: event.data.text(),
            icon: '/logo192.png'
        };
        event.waitUntil(self.registration.showNotification(title, options));
    }
});

// Handle Notification Clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data;
    const urlToOpen = data && data.url ? data.url : '/dashboard';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Check if there is already a window/tab open with the target URL
            for (const client of windowClients) {
                if ('focus' in client) {
                    return client.focus();
                }
            }
            // If no window/tab is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
