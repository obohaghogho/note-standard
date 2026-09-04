 
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
// Cache Bust Timestamp: 2026-07-30T18:35:00 — v10: enterprise PWA mobile viewport & layout recovery

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
            notifConversationId = notifUrl.searchParams.get('id') || (notifUrl.pathname.includes('/dashboard/chat/') ? notifUrl.pathname.split('/dashboard/chat/')[1] : null);
        } catch (_) {
            const match = (data.data?.url || '').match(/([?&]id=|\/chat\/)([^&/#?]+)/);
            notifConversationId = match ? match[2] : null;
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
        vibrate: [200, 100, 200, 100, 200],
        timestamp: Date.now(),
        data: {
            url: data.data?.url || data.url || '/dashboard',
            type: data.data?.type || data.type || 'general',
            messageId: data.data?.messageId,
            conversationId: notifConversationId,
            // CRITICAL: persist targetAccountId so notificationclick can read it and
            // pass it to the React app for account switching
            targetAccountId: data.data?.targetAccountId || data.data?.recipientId || null,
            apiUrl: data.data?.apiUrl || 'https://note-standard-api.onrender.com',
            // FAST-PATH FIX: gateway URL bypasses the sleeping API server (Render cold-start fix).
            // When present, the SW calls the gateway directly — it is always awake because it
            // holds the sender's live socket connection.
            deliveryWebhookUrl: data.data?.deliveryWebhookUrl || null,
            trace: data.data?.trace || null,
        },
        // Note: actions array omitted on desktop web push to prevent Chromium Windows Action Center notification suppression
        // Each message gets a unique tag (conversation + messageId) so rapid messages
        // stack as separate notifications instead of silently replacing each other.
        tag: notifConversationId
            ? `chat-${notifConversationId}-${data.data?.messageId || Date.now()}`
            : (data.tag || `ns-${Date.now()}`),
        renotify: true,  // Always alert even when updating an existing tag
    };

    // If it's an incoming call, we explicitly enforce high-urgency ringing mappings natively
    if (options.data.type === 'call_incoming') {
        options.requireInteraction = true; // The notification stays on screen permanently until accepted/dismissed
        options.vibrate = [500, 200, 500, 200, 500, 200, 500, 200, 500]; // Extended vibration mimicry
        options.tag = `incoming-call-${Date.now()}`; // Unique tag so previous calls don't overwrite current ones
    }

    const isChatPush = options.data.type === 'chat_message' || options.data.type === 'message' || options.data.type === 'chat_request' || options.data.type === 'chat_accepted';
    if (isChatPush && notifConversationId) {
        options.actions = [
            {
                action: 'reply',
                type: 'text',
                title: '💬 Reply',
                placeholder: 'Type a reply...'
            }
        ];
    }

    if (isChatPush && options.data.messageId) {
        const targetApiUrl = options.data.apiUrl || 'https://note-standard-api.onrender.com';

        // FAST-PATH: Use the gateway URL when available — the gateway is ALWAYS awake because it
        // holds the sender's live socket connection. The API server (note-standard-api.onrender.com)
        // sleeps after 15 min on Render free tier, causing a 30-90s cold-start delay before
        // the delivery receipt is processed and the double tick appears.
        // deliveryWebhookUrl points directly to /deliver/:messageId on the gateway.
        // Fall back to the old API path for backwards compatibility.
        let deliveryUrl = options.data.deliveryWebhookUrl;

        // Dynamic origin detection for Service Worker delivery ACK
        if (typeof self !== 'undefined' && self.location && self.location.hostname) {
            const swHost = self.location.hostname;
            const isLocalOrPrivateIP = swHost === 'localhost' ||
                                       swHost === '127.0.0.1' ||
                                       swHost.startsWith('192.168.') ||
                                       swHost.startsWith('10.') ||
                                       /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(swHost);

            if (isLocalOrPrivateIP && options.data?.messageId) {
                // Map deliveryUrl to the active local gateway running on port 5001 of the current host
                deliveryUrl = `${self.location.protocol}//${swHost}:5001/deliver/${options.data.messageId}`;
            }
        }

        if (!deliveryUrl) {
            deliveryUrl = `${targetApiUrl}/api/chat/messages/${options.data.messageId}/webhook-deliver`;
        }

        const sendDeliveryReceipt = async () => {
            if (!options.data?.messageId) return;

            // 1. Try Primary Delivery Endpoint (Gateway)
            try {
                const res = await fetch(deliveryUrl, { method: 'POST' });
                if (res && res.ok) {
                    console.log('[SW] ✅ Delivery ACK sent successfully via primary gateway URL.');
                    return;
                }
            } catch (e) {
                console.warn('[SW] Primary delivery ACK failed, trying fallback API endpoint...', e);
            }

            // 2. Fallback to API server delivery webhook
            const fallbackUrl = `${targetApiUrl}/api/chat/messages/${options.data.messageId}/webhook-deliver`;
            try {
                const fallbackRes = await fetch(fallbackUrl, { method: 'POST' });
                if (fallbackRes && fallbackRes.ok) {
                    console.log('[SW] ✅ Delivery ACK sent successfully via fallback API endpoint.');
                }
            } catch (err) {
                console.error('[SW] ❌ Both primary and fallback delivery ACK attempts failed:', err);
            }
        };

        // iOS CRITICAL FIX:
        // iOS 16.4+ Web Push has a strict "silent push" policy. If the Service Worker
        // does not call showNotification() within a very short window, iOS treats the
        // push as a silent/background notification. After too many silent pushes,
        // iOS silently REVOKES push permission for the PWA — causing notifications to
        // completely stop working until the user re-installs.
        //
        // THE FIX: We now run showNotification() and the webhook fetch() in PARALLEL
        // using Promise.all(). This guarantees the notification shows immediately while
        // the delivery receipt is still sent to the server.
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(windowClients => {
                    const hasWindows = windowClients && windowClients.length > 0;
                    
                    if (!hasWindows) {
                        console.log('[FORENSIC][SW] No window clients found (app is closed). Showing notification immediately.');
                        return Promise.all([
                            self.registration.showNotification(title, options),
                            sendDeliveryReceipt()
                        ]);
                    }

                    // There are open windows. Retrieve activeAccountId from IndexedDB with a safety timeout.
                    return new Promise((resolve) => {
                        try {
                            const request = indexedDB.open('NoteStandardDB', 1);
                            
                            const dbTimeout = setTimeout(() => {
                                console.warn('[SW] IndexedDB open timed out after 1000ms. Resolving with null.');
                                resolve(null);
                            }, 1000);

                            request.onsuccess = (e) => {
                                clearTimeout(dbTimeout);
                                const db = e.target.result;
                                if (!db.objectStoreNames.contains('sw_state')) return resolve(null);
                                const tx = db.transaction('sw_state', 'readonly');
                                const getReq = tx.objectStore('sw_state').get('activeAccountId');
                                getReq.onsuccess = () => resolve(getReq.result || null);
                                getReq.onerror = () => {
                                    console.error('[SW] IndexedDB get activeAccountId failed');
                                    resolve(null);
                                };
                            };
                            request.onerror = () => {
                                clearTimeout(dbTimeout);
                                console.error('[SW] IndexedDB open failed');
                                resolve(null);
                            };
                            request.onblocked = () => {
                                clearTimeout(dbTimeout);
                                console.warn('[SW] IndexedDB open blocked');
                                resolve(null);
                            };
                        } catch (err) {
                            console.error('[SW] IndexedDB try-catch error:', err);
                            resolve(null);
                        }
                    }).then((activeAccountId) => {
                        // Find any visible (non-hidden) window on our origin
                        const foregroundClient = windowClients.find(client => {
                            try {
                                return client.visibilityState === 'visible';
                            } catch (_) {
                                return false;
                            }
                        });

                        // Precise conversation view check: only suppress OS desktop notification popup
                        // if the user is actively focused inside THIS exact conversation ID.
                        const isActivelyViewingThisChat = !!(notifConversationId && windowClients.find(client => {
                            try {
                                const clientUrl = new URL(client.url);
                                // STRICT CHECK: client must be visible AND focused.
                                return client.visibilityState === 'visible' && client.focused && clientUrl.searchParams.get('id') === notifConversationId;
                            } catch (_) {
                                return false;
                            }
                        }));

                        let suppressOSNotification = isActivelyViewingThisChat;

                        // Account-switch guard: if the visible window is logged into a DIFFERENT account
                        // than the notification target, we must still show the OS notification.
                        if (suppressOSNotification && options.data.targetAccountId && activeAccountId) {
                            if (String(options.data.targetAccountId) !== String(activeAccountId)) {
                                console.log(`[SW] Account mismatch — visible window is account ${activeAccountId}, push is for ${options.data.targetAccountId}. Will show OS notification.`);
                                suppressOSNotification = false;
                            }
                        }

                        if (suppressOSNotification) {
                            // ── User is actively viewing this exact chat: update app in-line ──
                            console.log(`[FORENSIC][SW] User actively viewing conversation ${notifConversationId} — updating in-app UI.`);

                            const targetClient = foregroundClient;
                            if (targetClient) {
                                targetClient.postMessage({
                                    type: 'CHAT_MESSAGE_RECEIVED',
                                    conversationId: notifConversationId,
                                    messageId: options.data.messageId
                                });
                            }

                            return sendDeliveryReceipt();
                        }

                        // ── User is in another room, dashboard, or backgrounded: SHOW OS DESKTOP PUSH ──────────────
                        console.log(`[SW] Displaying OS Desktop Web Push notification popup.`);
                        windowClients.forEach(client => {
                            client.postMessage({
                                type: 'BACKGROUND_PREFETCH',
                                conversationId: notifConversationId,
                                message: {
                                    id: options.data?.messageId,
                                    content: options.body,
                                    senderName: title
                                }
                            });
                        });

                        return Promise.all([
                            self.registration.showNotification(title, options),
                            sendDeliveryReceipt()
                        ]);
                    });
                })
                .catch(err => {
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
    
    const data = event.notification.data;
    const replyText = event.reply || (event.action === 'reply' ? (event.replyText || null) : null);

    // Handle Quick Reply Action from OS System Notification Tray
    if (event.action === 'reply' || replyText) {
        event.notification.close();

        if (replyText && String(replyText).trim().length > 0) {
            const trimmedReply = String(replyText).trim();
            const convId = data?.conversationId;

            event.waitUntil(
                (async () => {
                    // 1. Post message to any active open tab windows
                    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
                    for (const client of windowClients) {
                        if ('postMessage' in client && convId) {
                            client.postMessage({
                                type: 'CHAT_MESSAGE_RECEIVED',
                                conversationId: convId,
                                content: trimmedReply
                            });
                        }
                    }

                    // 2. Direct HTTP POST from Service Worker to API server
                    try {
                        const token = await new Promise((resolve) => {
                            try {
                                const request = indexedDB.open('NoteStandardDB', 1);
                                request.onsuccess = (e) => {
                                    const db = e.target.result;
                                    if (!db.objectStoreNames.contains('sw_state')) return resolve(null);
                                    const tx = db.transaction('sw_state', 'readonly');
                                    const store = tx.objectStore('sw_state');
                                    const targetId = data?.targetAccountId ? String(data.targetAccountId).trim().toLowerCase() : null;

                                    if (targetId) {
                                        const targetReq = store.get(`token_${targetId}`);
                                        targetReq.onsuccess = () => {
                                            if (targetReq.result) return resolve(targetReq.result);
                                            const activeReq = store.get('authToken');
                                            activeReq.onsuccess = () => resolve(activeReq.result || null);
                                            activeReq.onerror = () => resolve(null);
                                        };
                                        targetReq.onerror = () => {
                                            const activeReq = store.get('authToken');
                                            activeReq.onsuccess = () => resolve(activeReq.result || null);
                                            activeReq.onerror = () => resolve(null);
                                        };
                                    } else {
                                        const activeReq = store.get('authToken');
                                        activeReq.onsuccess = () => resolve(activeReq.result || null);
                                        activeReq.onerror = () => resolve(null);
                                    }
                                };
                                request.onerror = () => resolve(null);
                            } catch (_) {
                                resolve(null);
                            }
                        });

                        if (token && convId) {
                            const targetApiUrl = data?.apiUrl || 'https://note-standard-api.onrender.com';
                            await fetch(`${targetApiUrl}/api/chat/conversations/${convId}/messages`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({
                                    content: trimmedReply,
                                    type: 'text'
                                })
                            });
                            console.log(`[SW] Quick reply sent directly for conversation: ${convId}`);
                        }
                    } catch (err) {
                        console.error('[SW] Quick reply direct API send error:', err);
                    }
                })()
            );
        }
        return;
    }

    if (event.action === 'close') return;

    let urlToOpen = new URL(data?.url || '/dashboard', self.location.origin).href;

    const urlObj = new URL(urlToOpen);
    if (data?.targetAccountId) {
        urlObj.searchParams.set('targetAccountId', data.targetAccountId);
    }
    if (data?.conversationId) {
        if (!urlObj.searchParams.has('id')) {
            urlObj.searchParams.set('id', data.conversationId);
        }
        if (!urlObj.searchParams.has('conversationId')) {
            urlObj.searchParams.set('conversationId', data.conversationId);
        }
    }
    if (urlToOpen.includes('/admin/')) {
        urlObj.searchParams.set('isSupport', 'true');
    }
    urlToOpen = urlObj.href;
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
