import { useState, useEffect, useRef, useCallback } from 'react';
import { getStoredAccounts, isAccountSessionValid } from '../utils/accountManager';
import { refreshSessionIsolated } from '../utils/authUtils';
import { API_URL } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export const useMultiAccountNotifications = () => {
  const { user, isSwitching } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // In-memory-only skip list: never persisted to localStorage.
  // Resets fresh on every page load, so re-logging in always gives the account a clean slate.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingInProgress = useRef<boolean>(false);

  const fetchUnreadCounts = useCallback(async () => {
    // SILENCE all background polling if an identity switch is already happening.
    const isAddingAccount = sessionStorage.getItem('notestandard_is_switching') === 'true';
    if (pollingInProgress.current || isSwitching || isAddingAccount || !user) return;
    pollingInProgress.current = true;

    try {
      const acc = getStoredAccounts().find(a => a.id === user.id);
      if (!acc) return;

      let currentTokens = acc.tokens;

      // Ensure session is fresh for the request
      if (!isAccountSessionValid(acc.id)) {
        const refreshed = await refreshSessionIsolated(acc);
        if (refreshed) {
          currentTokens = {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: refreshed.expires_at || 0
          };
        } else {
          return;
        }
      }

      const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
        headers: { 'Authorization': `Bearer ${currentTokens.access_token}` }
      });

      if (res.ok) {
        const { count } = await res.json();
        setUnreadCounts({ [acc.id]: count });
      }
    } catch (err) {
      console.error(`[MultiAccountAuth] Error fetching unread count:`, err);
    } finally {
      pollingInProgress.current = false;
    }
  }, [user, isSwitching]);

  useEffect(() => {
    fetchUnreadCounts();
    intervalRef.current = setInterval(fetchUnreadCounts, 90000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchUnreadCounts]);

  return { unreadCounts };
};
