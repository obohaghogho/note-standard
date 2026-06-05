import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { toast } from 'react-hot-toast';
import { accountManager } from '../../utils/accountManager';

/**
 * WebNotificationRouter
 *
 * Headless component. Sits at the root of the app and intercepts URL parameters
 * injected by the Service Worker after a push notification click.
 *
 * Full account-resolution chain:
 *   Push Notification
 *   → Service Worker (injects ?targetAccountId=&conversationId=)
 *   → URL Parameters
 *   → WebNotificationRouter  ← handles switch + KEEPS targetAccountId in URL
 *   → Chat.tsx guard          ← blocks conversation load until user.id commits
 *   → Chat.tsx cleanup        ← removes targetAccountId from URL when safe
 *
 * This two-stage approach eliminates the stale-data flash:
 *   - No fixed delay. The Chat page guard is the synchronisation point.
 *   - handledRef is reset after every handled notification so future taps work.
 *
 * Fallback: If switchAccount() fails, redirects to /login — NEVER wrong account.
 */
export const WebNotificationRouter: React.FC = () => {
  const { user, authReady, switchAccount } = useAuth();
  const { socket } = useSocket();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [isSwitchingOverlay, setIsSwitchingOverlay] = useState(false);
  // Per-notification guard. Cleared after each handled notification so future
  // taps of any notification are always processed.
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    // Step 1: Wait for auth layer to fully rehydrate (critical for cold-boot scenario)
    if (!authReady) return;

    const targetAccountId = searchParams.get('targetAccountId');
    const conversationId = searchParams.get('conversationId');

    // No notification context in URL
    if (!targetAccountId) return;

    // Guard: deduplicate within the same render cycle only.
    // We use targetAccountId alone (not including conversationId) as the key so that
    // switching to the same account twice in a row still works.
    const handledKey = `${targetAccountId}`;
    if (handledRef.current === handledKey) return;
    handledRef.current = handledKey;

    const handleNotificationNavigation = async () => {
      // ── Forensic Logs: Entry ──────────────────────────────────────────
      console.log('[ACCOUNT_FORENSIC] Notification Account ID:', targetAccountId);
      console.log('[ACCOUNT_FORENSIC] Active Account ID:', user?.id ?? 'none');
      const socketWithAuth = socket as (typeof socket & { auth?: { token?: string } }) | null;
      console.log('[ACCOUNT_FORENSIC] Socket connected:', !!socket?.connected);
      console.log('[ACCOUNT_FORENSIC] Socket has auth token:', !!socketWithAuth?.auth?.token);

      // ── Scenario 1: Already on the correct account ───────────────────
      if (user?.id === targetAccountId) {
        console.log('[ACCOUNT_FORENSIC] Correct account already active — navigating directly.');

        // Clean targetAccountId from URL immediately (no switch needed)
        const destination = conversationId
          ? `/dashboard/chat?id=${conversationId}`
          : '/dashboard';
        navigate(destination, { replace: true });

        // Reset so future notifications are processed
        handledRef.current = null;
        return;
      }

      // ── Scenario 2: Need to switch accounts ──────────────────────────
      console.log('[ACCOUNT_FORENSIC] Account Switch Started → target:', targetAccountId);
      setIsSwitchingOverlay(true);

      try {
        await switchAccount(targetAccountId);
        
        // ── Safeguard: Verify the account switch actually persisted ──
        // Note: accountManager saves synchronously to localStorage.
        const active = accountManager.getActiveAccountId();
        if (active !== targetAccountId) {
           throw new Error("Account switch verification failed");
        }

        console.log('[ACCOUNT_FORENSIC] Account Switch Success & Verified');

        // ── Clear account-scoped caches before reload ──
        // Clear sessionStorage to ensure no stale UI state survives the reload.
        // The hard reload natively destroys all in-memory React caches (conversations, messages, realtime, presence).
        // Stored accounts and refresh tokens remain safely in localStorage.
        try {
            sessionStorage.clear();
        } catch (e) {
            console.warn("[ACCOUNT_FORENSIC] Failed to clear session storage", e);
        }

        // KEY DESIGN: HARD RELOAD
        // Using window.location.href forces the browser to discard the entire React tree,
        // socket connections, and in-memory caches, and perform a full cold boot into Account B.
        // This guarantees 100% correct hydration.
        if (conversationId) {
          console.log('[ACCOUNT_FORENSIC] Hard Reload Navigation Started:', conversationId);
          window.location.href = `/dashboard/chat?id=${conversationId}`;
        } else {
          console.log('[ACCOUNT_FORENSIC] Hard Reload Navigation Started (Dashboard)');
          window.location.href = `/dashboard`;
        }

        // We do not reset handledRef or hide the overlay here because the page is immediately reloading.


      } catch (err) {
        // ── Fallback: NEVER silently open wrong account ───────────────
        console.error('[ACCOUNT_FORENSIC] Account Switch Failed:', err);
        toast.error('Session expired for the target account. Please log in again.', { duration: 5000 });
        navigate('/login?add_account=true', { replace: true });
        handledRef.current = null;
        setIsSwitchingOverlay(false);
      }
    };

    handleNotificationNavigation();
  }, [authReady, searchParams, user?.id, switchAccount, navigate, socket]);

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
