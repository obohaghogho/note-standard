/**
 * NoteStandard — Service Worker (Safe-Mode)
 * 
 * This file is purposefully minimal to resolve caching 
 * and production 'white screen' issues.
 */

self.addEventListener('install', (event) => {
    // We intentionally pause here to allow the React UI to prompt the user
    // The UI handles posting a 'SKIP_WAITING' message!
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

    // BUG FIX: Extract conversationId from payload for proper tag scoping.
    // Previously all notifications shared the tag 'notestandard-push', meaning
    // each new push silently replaced the previous one instead of stacking.
    // Now: each conversation gets its own tag (stacks per-conversation),
    // but new messages in the same conversation update the existing notification.
    let notifConversationId = data.data?.conversationId || null;
    if (!notifConversationId && data.data?.url) {
        try {
            const notifUrl = new URL(data.data.url, self.location.origin);
            notifConversationId = notifUrl.searchParams.get('id');
        } catch (_) {
            const match = (data.data?.url || '').match(/[?&]id=([^&]+)/);
            notifConversationId = match ? match[1] : null;
        }
    }

    const options = {
        body: data.body || 'You have a new update.',
        icon: data.icon || '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.data?.url || data.url || '/dashboard',
            type: data.data?.type || data.type || 'general',
            messageId: data.data?.messageId,
            conversationId: notifConversationId,
            apiUrl: data.data?.apiUrl || 'https://note-standard-api.onrender.com'
        },
        actions: [
            { action: 'open', title: 'View Now' },
            { action: 'close', title: 'Dismiss' }
        ],
        // BUG FIX: Scope notification tag by conversationId.
        // Different conversations get different tags (they stack in notification center).
        // Same conversation updates the single existing notification (no spam).
        tag: notifConversationId ? `chat-${notifConversationId}` : (data.tag || `ns-${Date.now()}`),
        renotify: true,  // Always alert even when updating an existing tag
    };

    // If it's an incoming call, we explicitly enforce high-urgency ringing mappings natively
    if (options.data.type === 'call_incoming') {
        options.requireInteraction = true; // The notification stays on screen permanently until accepted/dismissed
        options.vibrate = [500, 200, 500, 200, 500, 200, 500, 200, 500]; // Extended vibration mimicry
        options.tag = `incoming-call-${Date.now()}`; // Unique tag so previous calls don't overwrite current ones
    }

    if (options.data.type === 'chat_message' && options.data.messageId) {
        const targetApiUrl = options.data.apiUrl || 'https://note-standard-api.onrender.com';

        event.waitUntil(
            // First check if the user is already viewing this exact conversation
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(windowClients => {
                    // Check if any open window is already on this conversation
                    const isUserAlreadyViewing = notifConversationId && windowClients.some(client => {
                        try {
                            const clientUrl = new URL(client.url);
                            const clientConvId = clientUrl.searchParams.get('id');
                            const isOnChatPage = clientUrl.pathname.includes('/chat');
                            // Consider "viewing" if tab is focused/visible, on the chat page, and has matching conversation
                            return isOnChatPage && clientConvId === notifConversationId && client.visibilityState !== 'hidden';
                        } catch (_) {
                            return false;
                        }
                    });

                    if (isUserAlreadyViewing) {
                        console.log('[SW] Suppressing push — user is already viewing conversation:', notifConversationId);
                        // Still fire the delivery receipt but skip showing the notification
                        return fetch(`${targetApiUrl}/api/chat/messages/${options.data.messageId}/webhook-deliver`, { method: 'POST' })
                            .catch(err => console.error('[SW] Delivery receipt failed:', err));
                    }

                    // User is NOT in this conversation → fire delivery receipt AND show notification
                    return fetch(`${targetApiUrl}/api/chat/messages/${options.data.messageId}/webhook-deliver`, { method: 'POST' })
                        .catch(err => console.error('[SW] Delivery receipt failed:', err))
                        .then(() => self.registration.showNotification(title, options));
                })
        );
    } else {
        event.waitUntil(self.registration.showNotification(title, options));
    }
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
