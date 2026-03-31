import { useState, useEffect, useRef } from 'react';
import { getStoredAccounts } from '../utils/accountManager';
import { API_URL } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export const useMultiAccountNotifications = () => {
  const { user } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const accounts = getStoredAccounts();
  const intervalRef = useRef<any>(null);

  const fetchUnreadCounts = async () => {
    const updatedCounts: Record<string, number> = { ...unreadCounts };
    
    // Only poll for accounts that are NOT the current active user
    // (Active user's count is handled by NotificationContext)
    const otherAccounts = accounts.filter(acc => acc.id !== user?.id);
    
    for (const acc of otherAccounts) {
      try {
        const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
          headers: {
            'Authorization': `Bearer ${acc.session.access_token}`
          }
        });
        
        if (res.ok) {
          const { count } = await res.json();
          updatedCounts[acc.id] = count;
        } else if (res.status === 401) {
          // Token expired? We could potentially refresh it here or just mark as error
          console.warn(`[MultiAccountAuth] Token expired for account ${acc.id}`);
        }
      } catch (err) {
        console.error(`[MultiAccountAuth] Failed to fetch count for ${acc.id}:`, err);
      }
    }
    
    setUnreadCounts(updatedCounts);
  };

  useEffect(() => {
    // Initial fetch
    fetchUnreadCounts();
    
    // Poll every 60 seconds
    intervalRef.current = setInterval(fetchUnreadCounts, 60000);
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id, accounts.length]);

  return { unreadCounts };
};
