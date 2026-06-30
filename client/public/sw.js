/**
 * NoteStandard — Service Worker (Safe-Mode)
 * 
 * This file is purposefully minimal to resolve caching 
 * and production 'white screen' issues.
 */

self.addEventListener('install', (event) => {
    console.log(`[FORENSIC][SW] INSTALL event at ${new Date().toISOString()}`);
    // Force immediate update to bypass aggressive caching
    self.skipWaiting();
});
// Cache Bust Timestamp: 2026-06-21T09:00:00 — v6: fast-path delivery via gateway (eliminates cold-start delay)

self.addEventListener('activate', (event) => {
    console.log(`[FORENSIC][SW] ACTIVATE event at ${new Date().toISOString()}`);
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
    const swWakeupTs = Date.now();
    console.log(`[FORENSIC][SW] PUSH RECEIVED at ${new Date().toISOString()}`);
    
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

    if (data.data?.trace) {
        const trace = data.data.trace;
        const totalLatency = swWakeupTs - trace.clientSendTs;
        const apiLatency = trace.dbStartTs - trace.apiReceiveTs;
        const dbLatency = trace.dbDoneTs - trace.dbStartTs;
        const gatewayLatency = trace.pushProviderStartTs - trace.gatewayReceiveTs;
        const pushProviderLatency = swWakeupTs - trace.pushProviderStartTs;
        
        console.log(`\n[LATENCY_TRACE] Push Delivery Breakdown for Message:\n- Total End-to-End Latency: ${totalLatency}ms\n- API Overhead: ${apiLatency}ms\n- Database Insert: ${dbLatency}ms\n- Gateway Processing: ${gatewayLatency}ms\n- Push Provider & Network: ${pushProviderLatency}ms`);
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
            trace: data.data?.trace || null,
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
                        // ── WhatsApp/Telegram-style suppression ─────────────────────────────
                        // RULE 1: If the user has the app OPEN and VISIBLE in any window,
                        //         suppress the notification and post a silent in-app update.
                        //         This matches WhatsApp: you never get a popup when looking at the app.
                        // RULE 2: If the app is backgrounded, minimized, or closed, show the notification.
                        //
                        // Old behavior (WRONG): Only suppressed when on the EXACT same conversation URL.
                        //   → User got notifications while on a different chat, home screen, settings, etc.
                        // New behavior (CORRECT): Suppress whenever ANY app window is in the foreground.

                        // Find any visible (non-hidden) window on our origin
                        const foregroundClient = windowClients.find(client => {
                            try {
                                // visibilityState === 'visible' means the tab is the active, focused tab
                                return client.visibilityState === 'visible';
                            } catch (_) {
                                return false;
                            }
                        });

                        // Find the exact conversation client for precise in-app routing
                        const conversationClient = notifConversationId
                            ? windowClients.find(client => {
                                try {
                                    const clientUrl = new URL(client.url);
                                    return clientUrl.searchParams.get('id') === notifConversationId;
                                } catch (_) {
                                    return false;
                                }
                            })
                            : null;

                        let appIsInForeground = !!foregroundClient;

                        // Account-switch guard: if the visible window is logged into a DIFFERENT account
                        // than the notification target, we must still show the notification.
                        if (appIsInForeground && options.data.targetAccountId && activeAccountId) {
                            if (String(options.data.targetAccountId) !== String(activeAccountId)) {
                                console.log(`[SW] Account mismatch — visible window is account ${activeAccountId}, push is for ${options.data.targetAccountId}. Will show notification.`);
                                appIsInForeground = false;
                            }
                        }

                        if (appIsInForeground) {
                            // ── App is in the foreground: suppress popup, update app silently ──
                            console.log(`[SW] App is visible — suppressing notification, posting in-app update.`);

                            // Post CHAT_MESSAGE_RECEIVED to the most appropriate tab:
                            //   • The exact conversation tab if open (triggers read-receipt + loadMessages)
                            //   • Otherwise the foreground tab (triggers conversation list refresh)
                            const targetClient = conversationClient || foregroundClient;
                            targetClient.postMessage({
                                type: 'CHAT_MESSAGE_RECEIVED',
                                conversationId: notifConversationId,
                                messageId: options.data.messageId
                            });

                            // Also notify all OTHER tabs to refresh their conversation list
                            windowClients.forEach(client => {
                                if (client !== targetClient) {
                                    client.postMessage({
                                        type: 'BACKGROUND_PREFETCH',
                                        conversationId: notifConversationId
                                    });
                                }
                            });

                            // Fire delivery receipt silently — user has the app open so this is not
                            // a "silent push" in the iOS penalty sense.
                            return fetch(deliveryUrl, { method: 'POST' })
                                .catch(err => console.error('[SW] Delivery receipt failed (foreground):', err));
                        }

                        // ── App is backgrounded or closed: show notification ──────────────
                        // Broadcast BACKGROUND_PREFETCH to all open (but hidden) tabs so React
                        // can silently pre-load the message and be ready when the user taps.
                        windowClients.forEach(client => {
                            client.postMessage({
                                type: 'BACKGROUND_PREFETCH',
                                conversationId: notifConversationId
                            });
                        });

                        // CRITICAL iOS FIX: showNotification and delivery receipt run in PARALLEL.
                        // Awaiting the fetch before showNotification would violate iOS's strict
                        // notification window policy and risk silent-push penalties.
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
    console.log(`[FORENSIC][SW] NOTIFICATIONCLICK event at ${new Date().toISOString()} | Action: ${event.action}`);
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

// Handle Push Subscription Change (Token Rotation)
self.addEventListener('pushsubscriptionchange', (event) => {
    const oldEndpoint = event.oldSubscription ? event.oldSubscription.endpoint.substring(0, 30) + '...' : 'UNKNOWN';
    console.log(`[FORENSIC][SW] PUSHSUBSCRIPTIONCHANGE event at ${new Date().toISOString()}`);
    console.log(`[FORENSIC][SW] Old endpoint: ${oldEndpoint}`);
    
    // The browser has invalidated the old token. We must resubscribe and 
    // send the new token to the backend, otherwise we will get 410 Gone errors.
    event.waitUntil(
        self.registration.pushManager.subscribe(event.oldSubscription.options)
            .then(subscription => {
                const newEndpoint = subscription ? subscription.endpoint.substring(0, 30) + '...' : 'UNKNOWN';
                console.log(`[FORENSIC][SW] Successfully resubscribed. New endpoint: ${newEndpoint}`);
                
                // Read auth token from IndexedDB to send back to server
                return new Promise((resolve) => {
                    try {
                        const request = indexedDB.open('NoteStandardDB', 1);
                        request.onsuccess = (e) => {
                            const db = e.target.result;
                            if (!db.objectStoreNames.contains('sw_state')) return resolve(null);
                            const tx = db.transaction('sw_state', 'readonly');
                            const getReq = tx.objectStore('sw_state').get('authToken');
                            getReq.onsuccess = () => resolve(getReq.result || null);
                            getReq.onerror = () => resolve(null);
                        };
                        request.onerror = () => resolve(null);
                    } catch (err) {
                        resolve(null);
                    }
                }).then(token => {
                    if (!token) {
                        console.warn('[SW] No auth token found in IndexedDB, cannot update backend. Will rely on useInstallationSync on next boot.');
                        return;
                    }

                    // We need to fetch the device ID. This is usually managed by the client,
                    // but the SW can't easily get it unless it's stored in IndexedDB. 
                    // If we can't update it from here, at least we logged it!
                    console.log('[SW] Found token, but full V2 sync requires deviceId. Client will handle it on next open.');
                });
            })
            .catch(err => console.error('[SW] Failed to resubscribe after rotation:', err))
    );
});
