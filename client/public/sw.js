/**
 * NoteStandard — Service Worker (Safe-Mode)
 * 
 * This file is purposefully minimal to resolve caching 
 * and production 'white screen' issues.
 */

self.addEventListener('install', (event) => {
    // Force immediate update to bypass aggressive caching
    self.skipWaiting();
});
// Cache Bust Timestamp: 2026-06-21T09:00:00 — v6: fast-path delivery via gateway (eliminates cold-start delay)

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
            // CRITICAL: persist targetAccountId so notificationclick can read it and
            // pass it to the React app for account switching
            targetAccountId: data.data?.targetAccountId || null,
            apiUrl: data.data?.apiUrl || 'https://note-standard-api.onrender.com',
            // FAST-PATH FIX: gateway URL bypasses the sleeping API server (Render cold-start fix).
            // When present, the SW calls the gateway directly — it is always awake because it
            // holds the sender's live socket connection.
            deliveryWebhookUrl: data.data?.deliveryWebhookUrl || null,
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

        // FAST-PATH: Use the gateway URL when available — the gateway is ALWAYS awake because it
        // holds the sender's live socket connection. The API server (note-standard-api.onrender.com)
        // sleeps after 15 min on Render free tier, causing a 30-90s cold-start delay before
        // the delivery receipt is processed and the double tick appears.
        // deliveryWebhookUrl points directly to /deliver/:messageId on the gateway.
        // Fall back to the old API path for backwards compatibility.
        const deliveryUrl = options.data.deliveryWebhookUrl
            || `${targetApiUrl}/api/chat/messages/${options.data.messageId}/webhook-deliver`;

        // iOS CRITICAL FIX:
        // iOS 16.4+ Web Push has a strict "silent push" policy. If the Service Worker
        // does not call showNotification() within a very short window, iOS treats the
        // push as a silent/background notification. After too many silent pushes,
        // iOS silently REVOKES push permission for the PWA — causing notifications to
        // completely stop working until the user re-installs.
        //
        // ROOT CAUSE OF THE BUG: The old code awaited the webhook fetch() BEFORE
        // calling showNotification(). If the server was slow, the SW would time out
        // before the notification was shown, accumulating silent push penalties.
        //
        // THE FIX: We now run showNotification() and the webhook fetch() in PARALLEL
        // using Promise.all(). This guarantees the notification shows immediately while
        // the delivery receipt is still sent to the server.
        event.waitUntil(
            new Promise((resolve) => {
                try {
                    const request = indexedDB.open('NoteStandardDB', 1);
                    request.onsuccess = (e) => {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains('sw_state')) return resolve(null);
                        const tx = db.transaction('sw_state', 'readonly');
                        const getReq = tx.objectStore('sw_state').get('activeAccountId');
                        getReq.onsuccess = () => resolve(getReq.result || null);
                        getReq.onerror = () => resolve(null);
                    };
                    request.onerror = () => resolve(null);
                } catch (err) {
                    resolve(null);
                }
            }).then((activeAccountId) => {
                return clients.matchAll({ type: 'window', includeUncontrolled: true })
                    .then(windowClients => {
                        // Check if any open window is already on this conversation
                        const activeClient = windowClients.find(client => {
                            try {
                                const clientUrl = new URL(client.url);
                                const clientConvId = clientUrl.searchParams.get('id');
                                const isOnChatPage = clientUrl.pathname.includes('/chat');
                                return isOnChatPage && clientConvId === notifConversationId && client.visibilityState !== 'hidden';
                            } catch (_) {
                                return false;
                            }
                        });

                        let isUserAlreadyViewing = !!activeClient;

                        // FIX: Ensure we only suppress the push if the active window is 
                        // ACTUALLY logged into the target account of the notification.
                        if (isUserAlreadyViewing && options.data.targetAccountId && activeAccountId) {
                            if (String(options.data.targetAccountId) !== String(activeAccountId)) {
                                console.log(`[SW] Overriding suppression: active window is on account ${activeAccountId}, but push is for ${options.data.targetAccountId}`);
                                isUserAlreadyViewing = false;
                            }
                        }

                        if (isUserAlreadyViewing) {
                            // User is actively viewing this conversation.
                            // 1. Post a message to the React tab to trigger read-receipt logic (blue ticks).
                            activeClient.postMessage({
                                type: 'CHAT_MESSAGE_RECEIVED',
                                conversationId: notifConversationId,
                                messageId: options.data.messageId
                            });
                            // 2. Fire delivery receipt silently via fast-path gateway URL.
                            //    This is NOT a silent push penalty because the user has the app open.
                            return fetch(deliveryUrl, { method: 'POST' })
                                .catch(err => console.error('[SW] Delivery receipt failed (foreground):', err));
                        }

                        // Broadcast BACKGROUND_PREFETCH to all open tabs (even hidden ones)
                        // This allows React to silently fetch the message so it's ready when the app opens
                        windowClients.forEach(client => {
                            client.postMessage({
                                type: 'BACKGROUND_PREFETCH',
                                conversationId: notifConversationId
                            });
                        });

                        // User is NOT in this conversation → show notification AND fire delivery receipt IN PARALLEL.
                        // This is the critical iOS fix: showNotification is called immediately.
                        return Promise.all([
                            self.registration.showNotification(title, options),
                            fetch(deliveryUrl, { method: 'POST' })
                                .catch(err => console.error('[SW] Delivery receipt failed (background):', err))
                        ]);
                    });
            }).catch(err => {
                // Safety net: if anything above throws, we MUST still show the notification.
                // Swallowing this would be a silent push and trigger the iOS penalty.
                console.error('[SW] Push handler error, falling back to show notification:', err);
                return self.registration.showNotification(title, options);
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
    let urlToOpen = new URL(data?.url || '/dashboard', self.location.origin).href;

    if (data?.targetAccountId) {
        const urlObj = new URL(urlToOpen);
        urlObj.searchParams.set('targetAccountId', data.targetAccountId);
        if (data?.conversationId) {
            urlObj.searchParams.set('conversationId', data.conversationId);
        }
        urlToOpen = urlObj.href;
    }
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // 1. Try to find an existing tab with the same URL or at least one on the same origin
            for (const client of windowClients) {
                if (client.url === urlToOpen && 'focus' in client) {
                    if (data?.conversationId) {
                        client.postMessage({ type: 'CHAT_MESSAGE_RECEIVED', conversationId: data.conversationId });
                    }
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
