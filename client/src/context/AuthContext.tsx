import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { User, Session, RealtimeChannel } from "@supabase/supabase-js";
import { safeProfile, safeSubscription, supabase, resetRateLimiters, ensureProfile, updateGlobalAuthState } from "../lib/supabaseSafe";
import type { Profile, Subscription } from "../types/auth";
import toast from "react-hot-toast";
import * as accountManager from "../utils/accountManager";
import { refreshSessionIsolated } from "../utils/authUtils";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  subscription: Subscription | null;
  loading: boolean;
  authReady: boolean;
  isPro: boolean;
  isBusiness: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  switchAccount: (userId: string) => Promise<void>;
  addAccount: () => void;
  removeAccount: (userId: string) => void;
  refreshProfile: () => Promise<void>;
  isSwitching: boolean;
  switchId: number;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchId, setSwitchId] = useState(0);

  const fetchLockRef = useRef<string | null>(null);
  const isMounted = useRef(true);
  const switchInProgress = useRef(false);
  const switchIdRef = useRef(0);

  // Rule 6: Sink state to safeCall guard
  useEffect(() => {
    updateGlobalAuthState(isSwitching, switchId);
  }, [isSwitching, switchId]);

  useEffect(() => {
    accountManager.clearLegacyStaleMarkers();
  }, []);

  const isPro = useMemo(() => {
    return subscription?.status === 'active' && ['pro', 'team', 'business', 'enterprise'].includes(subscription?.plan_tier as string);
  }, [subscription]);

  const isBusiness = useMemo(() => {
    return subscription?.status === 'active' && subscription?.plan_tier === 'business';
  }, [subscription]);

  const isAdmin = useMemo(() => {
    return profile?.role === 'admin' || profile?.role === 'support';
  }, [profile]);

  /**
   * Single Source of Truth for identity data fetching.
   * Respects switchIdRef to prevent race conditions.
   */
  const syncUserData = useCallback(async (userId: string, userObj?: User, currentSwitchId?: number) => {
    if (userId === fetchLockRef.current) return;
    
    // Discard if a switch happened before we started
    if (currentSwitchId !== undefined && currentSwitchId !== switchIdRef.current) return;

    fetchLockRef.current = userId;
    
    try {
      if (!isMounted.current) return;

      // Rule 5: profile fetch is non-blocking but respects switchId
      const [profileResult, subResult] = await Promise.all([
        userObj ? ensureProfile(userObj) : safeProfile(userId),
        safeSubscription(userId)
      ]);
      
      // Rule 5: Discard stale responses
      if (currentSwitchId !== undefined && currentSwitchId !== switchIdRef.current) {
        console.warn(`[Auth] Discarding stale sync for ${userId}. SwitchId mismatch.`);
        return;
      }

      if (isMounted.current) {
        if (profileResult && profileResult !== 'ERROR') {
          const prof = profileResult as Profile;
          setProfile(prof);
          
          // Atomic update to account manager
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (currentSession?.user?.id === userId) {
            accountManager.saveAccount(currentSession, prof);
          }
        }
        
        if (subResult && subResult !== 'ERROR') {
          setSubscription(subResult as Subscription | null);
        }
      }
    } catch (err) {
      console.error("[Auth] Sync failed:", err);
    } finally {
      if (isMounted.current) fetchLockRef.current = null;
    }
  }, []);

  const refreshProfile = async () => {
    if (user?.id) {
       await syncUserData(user.id, user, switchIdRef.current);
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      if (user?.id) {
        accountManager.removeAccount(user.id);
      }
      
      // Rule 9: state will be updated by onAuthStateChange listener
      resetRateLimiters();
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    }
  };

  const addAccount = () => {
    // Correct URL path for add account flow
    window.location.href = '/login?add_account=true';
  };

  const removeAccount = (userId: string) => {
    if (userId === user?.id) return;
    accountManager.removeAccount(userId);
  };

  /**
   * Refactored ATOMIC Switch logic (Rule 4)
   */
  const switchAccount = async (userId: string) => {
    // Rule 4: switchLock
    if (switchInProgress.current) return;

    const target = accountManager.getAccount(userId);
    if (!target) {
      toast.error('Account not found.');
      return;
    }

    const toastId = toast.loading('Switching to ' + target.email);

    try {
      setIsSwitching(true);
      switchInProgress.current = true;
      
      // Rule 5: switchIdRef
      switchIdRef.current += 1;
      setSwitchId(switchIdRef.current);
      const currentSwitchId = switchIdRef.current;

      console.log(`[Auth] Switch #${currentSwitchId}: refreshing ${target.email}...`);

      // Rule 13: refresh if needed before setSession
      let freshSession = await refreshSessionIsolated(target);
      
      if (!freshSession) {
        // Retry if something changed in storage
        const latestFromStorage = accountManager.getAccount(userId);
        if (latestFromStorage && latestFromStorage.tokens.refresh_token !== target.tokens.refresh_token) {
          freshSession = await refreshSessionIsolated(latestFromStorage);
        }
      }

      // Rule 5: Protect against overlapping switch
      if (currentSwitchId !== switchIdRef.current) return;

      if (!freshSession) {
        throw new Error('Session expired. Please log in again.');
      }

      // Rule 3: Update active account ID FIRST
      accountManager.setActiveAccountId(userId);

      // Rule 4: Atomic setSession
      const { error } = await supabase.auth.setSession({
        access_token: freshSession.access_token,
        refresh_token: freshSession.refresh_token
      });

      if (error) throw error;

      // Note: Logic continues in onAuthStateChange listener.
      // We don't need syncUserData here as listener will trigger it.
      
      toast.success(`Switched to ${target.email}`, { id: toastId });

    } catch (err) {
      console.error('[Auth] Switch failed:', err);
      toast.error(err instanceof Error ? err.message : 'Switch failed', { id: toastId });
      setIsSwitching(false);
      switchInProgress.current = false;
    }
  };

  useEffect(() => {
    isMounted.current = true;

    const initAuthAndSubscribe = async () => {
      try {
        setLoading(true);

        // Rule 10: Session Rehydration on App Load
        const activeId = accountManager.getActiveAccountId();
        if (activeId) {
          const acc = accountManager.getAccount(activeId);
          if (acc) {
            console.log(`[Auth] Rehydrating active account: ${acc.email}`);
            await supabase.auth.setSession({
              access_token: acc.tokens.access_token,
              refresh_token: acc.tokens.refresh_token
            });
          }
        }

        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (isMounted.current) {
          // Rule 9: Listener handles state, but we set initial once for loading sync
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
          
          if (initialSession?.user) {
            syncUserData(initialSession.user.id, initialSession.user, switchIdRef.current);
            setupSubscriptions(initialSession.user.id);
          }

          setLoading(false);
          setAuthReady(true);
        }
      } catch (err) {
        console.error('[Auth] Initial boot failed:', err);
        setLoading(false);
        setAuthReady(true);
      }
    };

    let profileChannel: RealtimeChannel | null = null;
    let subscriptionChannel: RealtimeChannel | null = null;

    const setupSubscriptions = (userId: string) => {
      // 1. Aggressively clean up ALL previous profile/subscription channels to prevent leaks and race conditions
      supabase.getChannels().forEach(c => {
        if (c.topic.startsWith('public:profiles:') || c.topic.startsWith('public:subscriptions:')) {
          supabase.removeChannel(c);
        }
      });

      // 2. Use a unique topic suffix to bypass the Supabase 'already subscribed' error entirely
      const uniqueTopic = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

      profileChannel = supabase
        .channel(`public:profiles:${userId}:${uniqueTopic}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, 
          () => syncUserData(userId, undefined, switchIdRef.current))
        .subscribe();

      subscriptionChannel = supabase
        .channel(`public:subscriptions:${userId}:${uniqueTopic}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` }, 
          () => syncUserData(userId, undefined, switchIdRef.current))
        .subscribe();
    };

    initAuthAndSubscribe();

    /**
     * Rule 9: The Listener is the MANDATORY Source of Truth
     */
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted.current) return;
      
      const currentId = switchIdRef.current;
      console.log(`[Auth] Event: ${event} (#${currentId})`, { email: newSession?.user?.email });

      if (event === 'SIGNED_OUT') {
        // If we are switching, we ignore SIGNED_OUT from the old account
        if (switchInProgress.current) return;

        setSession(null);
        setUser(null);
        setProfile(null);
        setSubscription(null);
        accountManager.setActiveAccountId(null);
        resetRateLimiters();
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        const currentUser = newSession?.user ?? null;
        
        setSession(newSession);
        setUser(currentUser);

        // Rule 4: Switch complete - Disable lock immediately to allow syncUserData to fetch
        if (switchInProgress.current) {
          switchInProgress.current = false;
          setIsSwitching(false);
          // Force it to global state immediately so safeCall won't be blocked
          updateGlobalAuthState(false, currentId);
        }

        if (newSession && currentUser) {
          // Sync tokens to multi-account storage
          accountManager.updateAccountTokens(currentUser.id, newSession);
          accountManager.setActiveAccountId(currentUser.id);

          setupSubscriptions(currentUser.id);
          syncUserData(currentUser.id, currentUser, currentId);
        }
      }
    });

    return () => {
      isMounted.current = false;
      authListener.unsubscribe();
      if (profileChannel) supabase.removeChannel(profileChannel);
      if (subscriptionChannel) supabase.removeChannel(subscriptionChannel);
    };
  }, [syncUserData]);

  return (
    <AuthContext.Provider value={{ 
      user, session, profile, subscription, loading, authReady, 
      isPro, isBusiness, isAdmin, signOut, switchAccount, 
      addAccount, removeAccount, refreshProfile, isSwitching, switchId
    }}>
      {children}
    </AuthContext.Provider>
  );
};
