import { useState, useEffect, useRef, useCallback } from 'react';
import { getStoredAccounts } from '../utils/accountManager';
import { API_URL } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export const useMultiAccountNotifications = () => {
  const { user } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const accounts = getStoredAccounts();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnreadCounts = useCallback(async () => {
    // Dynamically retrieve to avoid stable-reference loops on every render
    const currentAccounts = getStoredAccounts();
    const otherAccounts = currentAccounts.filter(acc => acc.id !== user?.id);
    
    for (const acc of otherAccounts) {
      try {
        const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
          headers: {
            'Authorization': `Bearer ${acc.session.access_token}`
          }
        });
        
        if (res.ok) {
          const { count } = await res.json();
          setUnreadCounts(prev => ({ ...prev, [acc.id]: count }));
        } else if (res.status === 401) {
          console.warn(`[MultiAccountAuth] Token expired for account ${acc.id}`);
        }
      } catch (err) {
        console.error(`[MultiAccountAuth] Failed to fetch count for ${acc.id}:`, err);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    // Initial fetch
    fetchUnreadCounts();
    
    // Poll every 60 seconds
    intervalRef.current = setInterval(fetchUnreadCounts, 60000);
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchUnreadCounts, user?.id, accounts.length]);

  return { unreadCounts };
};
