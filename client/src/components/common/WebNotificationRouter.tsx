import React, { useEffect, useRef, useState, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useChat } from '../../context/ChatContext';
import { NotificationContext } from '../../context/NotificationContext';
import { toast } from 'react-hot-toast';
import { accountManager } from '../../utils/accountManager';

/**
 * WebNotificationRouter
 *
 * Implements Soft-Navigation Account Switch Architecture (WhatsApp Web style).
 * It tears down the previous account's realtime and caches, switches auth, 
 * and cleanly initializes the new account's realtime and caches BEFORE navigation.
 */
export const WebNotificationRouter: React.FC = () => {
  const { user, authReady, switchAccount } = useAuth();
  const { socket, teardown: socketTeardown, initialize: socketInitialize } = useSocket();
  const { clearState: chatClearState, initialize: chatInitialize } = useChat();
  const notificationContext = useContext(NotificationContext);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [isSwitchingOverlay, setIsSwitchingOverlay] = useState(false);
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady || !notificationContext) return;

    const targetAccountId = searchParams.get('targetAccountId');
    const conversationId = searchParams.get('conversationId');

    if (!targetAccountId) return;

    const handledKey = `${targetAccountId}`;
    if (handledRef.current === handledKey) return;
    handledRef.current = handledKey;

    const handleNotificationNavigation = async () => {
      console.log('[ACCOUNT_FORENSIC] Notification Account ID:', targetAccountId);
      console.log('[ACCOUNT_FORENSIC] Active Account ID:', user?.id ?? 'none');

      // Scenario 1: Already on the correct account
      if (user?.id === targetAccountId) {
        console.log('[ACCOUNT_FORENSIC] Correct account already active — navigating directly.');
        const destination = conversationId ? `/dashboard/chat?id=${conversationId}` : '/dashboard';
        navigate(destination, { replace: true });
        handledRef.current = null;
        return;
      }

      // Scenario 2: Switch accounts
      console.log('[ACCOUNT_FORENSIC] Account Switch Started → target:', targetAccountId);
      
      // Step 1: Freeze navigation
      setIsSwitchingOverlay(true);

      // Step 2: Clear Caches Synchronously (non-fatal)
      try { chatClearState(); } catch (e) { console.warn('[ACCOUNT_FORENSIC] chatClearState error (non-fatal):', e); }
      try { notificationContext.clearState(); } catch (e) { console.warn('[ACCOUNT_FORENSIC] notificationContext.clearState error (non-fatal):', e); }

      // Step 3: Realtime teardown (non-fatal)
      try { socketTeardown(); } catch (e) { console.warn('[ACCOUNT_FORENSIC] socketTeardown error (non-fatal):', e); }

      // Step 4: Perform account switch — this is the ONLY fatal step
      try {
        await switchAccount(targetAccountId);
      } catch (switchErr) {
        console.error('[ACCOUNT_FORENSIC] Account Switch Fatal Error:', switchErr);
        toast.error(`Could not switch account. Please try again.`);
        handledRef.current = null;
        setIsSwitchingOverlay(false);
        return;
      }
      
      const active = accountManager.getActiveAccountId();
      if (active !== targetAccountId) {
        console.error('[ACCOUNT_FORENSIC] Verification failed — active:', active, 'target:', targetAccountId);
        toast.error('Account switch did not complete. Please tap the notification again.');
        handledRef.current = null;
        setIsSwitchingOverlay(false);
        return;
      }
      console.log('[ACCOUNT_FORENSIC] ACCOUNT_SWITCH_SUCCESS');

      const activeAccount = accountManager.getAccount(active);

      // Step 5: Navigate FIRST — WhatsApp/Messenger style: show UI immediately, sync in background.
      // Do NOT block navigation on socket/chat initialization.
      const destination = conversationId ? `/dashboard/chat?id=${conversationId}` : '/dashboard';
      console.log('[ACCOUNT_FORENSIC] NAVIGATION_COMPLETE - Navigating to:', destination);
      navigate(destination, { replace: true });
      setIsSwitchingOverlay(false);
      handledRef.current = null;

      // Step 6: Background re-initialization — failures here are non-fatal and logged only.
      // FIX: Chain chatInitialize AFTER socketInitialize resolves so the socket is
      // connected and has joined conversation rooms before delivery ACKs are emitted.
      // Previously both ran in parallel, causing ACKs to be dropped on a disconnected socket.
      if (activeAccount?.tokens?.access_token) {
        socketInitialize(activeAccount.tokens.access_token)
          .then(() => {
            console.log('[ACCOUNT_FORENSIC] SOCKET_CONNECTED (background)');
            // Only initialize chat AFTER socket is up so joinAllRooms works correctly
            return chatInitialize();
          })
          .then(() => console.log('[ACCOUNT_FORENSIC] CONVERSATIONS_READY (background)'))
          .catch(e => console.warn('[ACCOUNT_FORENSIC] Socket/Chat init non-fatal (will auto-retry):', e.message));
      } else {
        // No token — just init chat without socket dependency
        chatInitialize()
          .then(() => console.log('[ACCOUNT_FORENSIC] CONVERSATIONS_READY (no-socket path)'))
          .catch(e => console.warn('[ACCOUNT_FORENSIC] Chat init non-fatal:', e.message));
      }

      notificationContext.reinitialize()
        .then(() => console.log('[ACCOUNT_FORENSIC] NOTIFICATIONS_READY (background)'))
        .catch(e => console.warn('[ACCOUNT_FORENSIC] Notification reinit non-fatal:', e.message));

      // FIX (Bug 2): Re-register the existing browser push subscription under the new account.
      // Push subscriptions are browser-level (one per browser, not per account). After an
      // account switch, the subscription must be re-saved with the new account's bearer token
      // so the backend maps the endpoint to the correct user_id in push_subscriptions.
      if (
        typeof navigator !== 'undefined' &&
        'serviceWorker' in navigator &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        activeAccount?.tokens?.access_token
      ) {
        navigator.serviceWorker.ready
          .then(async (reg) => {
            const sub = await reg.pushManager.getSubscription();
            if (!sub) return;
            const apiBase = import.meta.env.VITE_API_URL || '';
            return fetch(`${apiBase}/api/notifications/subscribe`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${activeAccount.tokens.access_token}`
              },
              body: JSON.stringify({ subscription: sub })
            });
          })
          .then(() => console.log('[ACCOUNT_FORENSIC] PUSH_RE_REGISTERED for new account'))
          .catch(e => console.warn('[ACCOUNT_FORENSIC] Push re-registration non-fatal:', e.message));
      }
    };

    handleNotificationNavigation();
  }, [authReady, searchParams, user?.id, switchAccount, navigate, socket, chatClearState, chatInitialize, notificationContext, socketInitialize, socketTeardown]);

  if (isSwitchingOverlay) {
    return (
      <div style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100%', height: '100%',
        backgroundColor: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        color: '#fff',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: '#10b981',
          borderRadius: '50%',
          animation: 'sw-spin 0.8s linear infinite',
          marginBottom: 20,
        }} />
        <p style={{ fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.01em' }}>
          Switching Account…
        </p>
        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
          Opening your conversation
        </p>
        <style>{`@keyframes sw-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return null;
};
