import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { toast } from 'react-hot-toast';

/**
 * WebNotificationRouter
 *
 * A headless component that sits at the root of the app and intercepts
 * URL parameters injected by the Service Worker after a push notification click.
 *
 * It implements the full Account-Resolution chain:
 *   Push Notification
 *   → Service Worker (injects ?targetAccountId=&conversationId=)
 *   → URL Parameters
 *   → WebNotificationRouter (this component)
 *   → Account Switch (via switchAccount())
 *   → Conversation Navigation
 *
 * Fallback: If switchAccount() fails, it redirects to /login?add_account=true
 * and NEVER silently falls back to the wrong account.
 */
export const WebNotificationRouter: React.FC = () => {
  const { user, authReady, switchAccount } = useAuth();
  const { socket } = useSocket();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [isSwitchingOverlay, setIsSwitchingOverlay] = useState(false);
  // Guard to prevent double-firing on strict-mode double-render or param re-read
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    // Step 1: Wait for auth layer to fully rehydrate (critical for cold-boot / app-closed scenario)
    if (!authReady) return;

    // Step 2: Read params — derived inside the effect for correct closure
    const targetAccountId = searchParams.get('targetAccountId');
    const conversationId = searchParams.get('conversationId');

    // No notification context present in the URL — nothing to do
    if (!targetAccountId) return;

    // Guard against duplicate handling for the same notification context
    const handledKey = `${targetAccountId}:${conversationId}`;
    if (handledRef.current === handledKey) return;
    handledRef.current = handledKey;

    // Step 3: Clean params from URL immediately to prevent loops on reload
    const cleanParams = () => {
      const next = new URLSearchParams(searchParams);
      next.delete('targetAccountId');
      next.delete('conversationId');
      setSearchParams(next, { replace: true });
    };

    const handleNotificationNavigation = async () => {
      // ── Forensic Log: Entry ─────────────────────────────────────────
      console.log('[ACCOUNT_FORENSIC] Notification Account ID:', targetAccountId);
      console.log('[ACCOUNT_FORENSIC] Active Account ID:', user?.id ?? 'none');
      // Read socket's auth token to confirm it belongs to the correct account
      const socketWithAuth = socket as (typeof socket & { auth?: { token?: string } }) | null;
      console.log('[ACCOUNT_FORENSIC] Socket connected:', !!socket?.connected);
      console.log('[ACCOUNT_FORENSIC] Socket has auth token:', !!socketWithAuth?.auth?.token);

      // ── Scenario 1: Already on the correct account ───────────────────
      if (user?.id === targetAccountId) {
        console.log('[ACCOUNT_FORENSIC] Account IDs match — no switch needed.');
        cleanParams();
        if (conversationId) {
          console.log('[ACCOUNT_FORENSIC] Conversation Navigation Started:', conversationId);
          navigate(`/dashboard/chat?id=${conversationId}`, { replace: true });
          console.log('[ACCOUNT_FORENSIC] Conversation Navigation Success');
        }
        return;
      }

      // ── Scenario 2: Need to switch accounts ──────────────────────────
      console.log('[ACCOUNT_FORENSIC] Account Switch Started → target:', targetAccountId);
      setIsSwitchingOverlay(true);

      try {
        await switchAccount(targetAccountId);
        console.log('[ACCOUNT_FORENSIC] Account Switch Success');

        // Give React one tick to commit the new user state to context before navigating
        await new Promise<void>(resolve => setTimeout(resolve, 400));

        // Post-switch forensic: confirm all three IDs align
        console.log('[ACCOUNT_FORENSIC] Active User ID (post-switch):', targetAccountId);
        console.log('[ACCOUNT_FORENSIC] Socket User ID (expected):', targetAccountId);
        console.log('[ACCOUNT_FORENSIC] Notification User ID:', targetAccountId);

        cleanParams();

        if (conversationId) {
          console.log('[ACCOUNT_FORENSIC] Conversation Navigation Started:', conversationId);
          navigate(`/dashboard/chat?id=${conversationId}`, { replace: true });
          console.log('[ACCOUNT_FORENSIC] Conversation Navigation Success');
        } else {
          navigate('/dashboard', { replace: true });
        }
      } catch (err) {
        // ── Fallback Path ─────────────────────────────────────────────
        // NEVER silently drop into the wrong account.
        // Redirect to login with re-auth hint.
        console.error('[ACCOUNT_FORENSIC] Account Switch Failed:', err);
        cleanParams();
        toast.error('Session expired for the target account. Please log in again.', { duration: 5000 });
        navigate(`/login?add_account=true`, { replace: true });
      } finally {
        setIsSwitchingOverlay(false);
      }
    };

    handleNotificationNavigation();
  }, [authReady, searchParams, user?.id, switchAccount, navigate, setSearchParams, socket]);

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
