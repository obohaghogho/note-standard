const fs = require('fs');
const path = 'client/public/sw.js';
let code = fs.readFileSync(path, 'utf8');

const target = `        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
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

                    const isUserAlreadyViewing = !!activeClient;

                    if (isUserAlreadyViewing) {
                        // User is actively viewing this conversation.
                        // 1. Post a message to the React tab to trigger read-receipt logic (blue ticks).
                        activeClient.postMessage({
                            type: 'CHAT_MESSAGE_RECEIVED',
                            conversationId: notifConversationId,
                            messageId: options.data.messageId
                        });
                        // 2. Fire delivery receipt silently. No notification shown (user is looking at it).
                        //    This is NOT a silent push penalty because the user has the app open.
                        return fetch(
                            \`\${targetApiUrl}/api/chat/messages/\${options.data.messageId}/webhook-deliver\`,
                            { method: 'POST' }
                        ).catch(err => console.error('[SW] Delivery receipt failed (foreground):', err));
                    }

                    // User is NOT in this conversation → show notification AND fire delivery receipt IN PARALLEL.
                    // This is the critical iOS fix: showNotification is called immediately.
                    return Promise.all([
                        self.registration.showNotification(title, options),
                        fetch(
                            \`\${targetApiUrl}/api/chat/messages/\${options.data.messageId}/webhook-deliver\`,
                            { method: 'POST' }
                        ).catch(err => console.error('[SW] Delivery receipt failed (background):', err))
                    ]);
                })
                .catch(err => {
                    // Safety net: if anything above throws, we MUST still show the notification.
                    // Swallowing this would be a silent push and trigger the iOS penalty.
                    console.error('[SW] Push handler error, falling back to show notification:', err);
                    return self.registration.showNotification(title, options);
                })
        );`;

const replacement = `        event.waitUntil(
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
                                console.log(\`[SW] Overriding suppression: active window is on account \${activeAccountId}, but push is for \${options.data.targetAccountId}\`);
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
                            // 2. Fire delivery receipt silently. No notification shown (user is looking at it).
                            //    This is NOT a silent push penalty because the user has the app open.
                            return fetch(
                                \`\${targetApiUrl}/api/chat/messages/\${options.data.messageId}/webhook-deliver\`,
                                { method: 'POST' }
                            ).catch(err => console.error('[SW] Delivery receipt failed (foreground):', err));
                        }

                        // User is NOT in this conversation → show notification AND fire delivery receipt IN PARALLEL.
                        // This is the critical iOS fix: showNotification is called immediately.
                        return Promise.all([
                            self.registration.showNotification(title, options),
                            fetch(
                                \`\${targetApiUrl}/api/chat/messages/\${options.data.messageId}/webhook-deliver\`,
                                { method: 'POST' }
                            ).catch(err => console.error('[SW] Delivery receipt failed (background):', err))
                        ]);
                    });
            }).catch(err => {
                // Safety net: if anything above throws, we MUST still show the notification.
                // Swallowing this would be a silent push and trigger the iOS penalty.
                console.error('[SW] Push handler error, falling back to show notification:', err);
                return self.registration.showNotification(title, options);
            })
        );`;

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
