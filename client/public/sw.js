/**
 * NoteStandard — Service Worker (Safe-Mode)
 * 
 * This file is purposefully minimal to resolve caching 
 * and production 'white screen' issues.
 */

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(key => caches.delete(key)))
        )
    );
    self.clients.claim();
});

// Enable the browser to skip waiting for the new SW to take control
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});



// Handle Push Notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push Received');
    
    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            console.warn('[SW] Push data is not JSON:', event.data.text());
            data = { title: 'New Notification', body: event.data.text() };
        }
    }

    const title = data.title || 'NoteStandard Notification';
    const options = {
        body: data.body || 'You have a new update.',
        icon: data.icon || '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.data?.url || data.url || '/dashboard',
            type: data.data?.type || data.type || 'general'
        },
        actions: [
            { action: 'open', title: 'View Now' },
            { action: 'close', title: 'Dismiss' }
        ],
        tag: data.tag || 'notestandard-push', // Prevents duplicates
        renotify: true
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Handle Notification Clicks
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification Clicked:', event.action);
    event.notification.close();

    if (event.action === 'close') return;

    const data = event.notification.data;
    const urlToOpen = new URL(data?.url || '/dashboard', self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // 1. Try to find an existing tab with the same URL or at least one on the same origin
            for (const client of windowClients) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // 2. If no exact match, focus any tab on our origin and navigate it
            for (const client of windowClients) {
                if ('focus' in client && 'navigate' in client) {
                    return client.focus().then(() => client.navigate(urlToOpen));
                }
            }
            // 3. If no window/tab is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
