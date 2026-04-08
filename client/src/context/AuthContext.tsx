import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { User, Session, RealtimeChannel } from "@supabase/supabase-js";
import { safeProfile, safeSubscription, supabase, resetRateLimiters, ensureProfile } from "../lib/supabaseSafe";
import type { Profile, Subscription } from "../types/auth";
import toast from "react-hot-toast";
import * as accountManager from "../utils/accountManager";

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

  // Use refs to track if data fetching is in progress for the current session to prevent throttling
  const fetchLockRef = useRef<string | null>(null);
  const isMounted = useRef(true);

  // Compute isPro based on subscription status (any paid plan)
  const isPro = useMemo(() => {
    return subscription?.status === 'active' && ['pro', 'team', 'business', 'enterprise'].includes(subscription?.plan_tier as string);
  }, [subscription]);

  // Compute isBusiness based on subscription status
  const isBusiness = useMemo(() => {
    return subscription?.status === 'active' && subscription?.plan_tier === 'business';
  }, [subscription]);

  // Compute isAdmin based on profile role
  const isAdmin = useMemo(() => {
    return profile?.role === 'admin' || profile?.role === 'support';
  }, [profile]);

  // Consolidated Fetch Profile & Subscription
  const syncUserData = useCallback(async (userId: string, userObj?: User, force = false) => {
    // If already fetching for this user and not forced, skip
    if (!force && fetchLockRef.current === userId) return;

    // Optimization: Skip if we already have data for this user and it's not a force refresh
    if (!force && profile?.id === userId && subscription) {
      console.log('[Auth] User data already cached for:', userId);
      return;
    }
    
    fetchLockRef.current = userId;
    
    try {
      if (!isMounted.current) return;

      const [profileResult, subResult] = await Promise.all([
        userObj ? ensureProfile(userObj) : safeProfile(userId),
        safeSubscription(userId)
      ]);
      
      if (isMounted.current && fetchLockRef.current === userId) {
        // Only update state if we didn't get a terminal ERROR
        if (profileResult !== 'ERROR') {
          const prof = profileResult as Profile;
          setProfile(prof);
          
          // Save to multi-account list if we have a session
          supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
            if (currentSession?.user?.id === userId) {
              accountManager.saveAccount(currentSession, prof);
            }
          });
        }
        
        if (subResult !== 'ERROR') {
          setSubscription(subResult as Subscription | null);
        }
      }
    } catch (err: unknown) {
      const isNetworkError = err instanceof Error && (err.message.includes('fetch') || err.message.includes('Network'));
      if (isNetworkError) {
        console.warn("[Auth] Sync deferred: Network error");
        // Don't set fetchLock to null to allow another attempt? 
        // Actually, let's just log it.
      } else {
        console.error("[Auth] Sync failed:", err);
      }
    } finally {
      if (isMounted.current && fetchLockRef.current === userId) {
        fetchLockRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshProfile = async () => {
    if (user?.id) {
       await syncUserData(user.id, user, true);
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // State cleanup
      if (user?.id) {
        accountManager.removeAccount(user.id);
      }
      
      setSession(null);
      setUser(null);
      setProfile(null);
      setSubscription(null);
      fetchLockRef.current = null;
      resetRateLimiters();
      
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    }
  };

  const addAccount = () => {
    // Explicitly save current account if it exists before navigating
    if (session && profile) {
      accountManager.saveAccount(session, profile);
    }
    // Correct URL path
    window.location.href = '/login?add_account=true';
  };

  const removeAccount = (userId: string) => {
    // Cannot remove current account via this method (use signOut instead)
    if (userId === user?.id) return;
    
    accountManager.removeAccount(userId);
    // Page reload or state update to refresh UI
    window.location.reload();
  };

  const switchAccount = async (userId: string) => {
    const target = accountManager.getAccount(userId);
    if (!target) {
      toast.error('Account not found. Please log in again.');
      return;
    }

    const toastId = toast.loading('Switching account...');
    try {
      const { error } = await supabase.auth.setSession({
        access_token: target.session.access_token,
        refresh_token: target.session.refresh_token
      });
      if (error) throw error;
      
      // Page reload to ensure all contexts are reset
      window.location.reload();
    } catch (err) {
      console.error('[Auth] Switch failed:', err);
      toast.error('Failed to switch account', { id: toastId });
    }
  };

    useEffect(() => {
      isMounted.current = true;
  
      const initAuthAndSubscribe = async () => {
        try {
          if (!isMounted.current) return;
          setLoading(true);
  
          // Step 1: Initial session check
          const { data: { session: initialSession }, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('[Auth] Initial session fetch failed:', error);
            // Don't throw here, might be a transient network error and we can't assume user is logged out
          }
  
          if (isMounted.current) {
            const currentUser = initialSession?.user ?? null;
            
            // Only update session if it's actually different from current to avoid redundant renders
            setSession(initialSession);
            setUser(currentUser);
            
            if (currentUser) {
              syncUserData(currentUser.id, currentUser).catch(err => {
                console.error('[Auth] Initial sync failed:', err);
              });
              // Setup subscriptions immediately
              setupSubscriptions(currentUser.id);
            }
  
            // Finalize boot
            setLoading(false);
            setAuthReady(true);
            console.log('[Auth] Boot Complete:', { userId: currentUser?.id });
          }
        } catch (err) {
          console.error('[Auth] Boot Error:', err);
          if (isMounted.current) {
            setLoading(false);
            setAuthReady(true);
          }
        }
      };
  
      // Step 2: Global Realtime Subscriptions for Profile and Billing
      let profileChannel: RealtimeChannel | null = null;
      let subscriptionChannel: RealtimeChannel | null = null;
  
      const setupSubscriptions = (userId: string) => {
        if (profileChannel) supabase.removeChannel(profileChannel);
        if (subscriptionChannel) supabase.removeChannel(subscriptionChannel);
  
        // Generate unique names to prevent re-using a cached, already-subscribed channel
        const timestamp = Date.now();
        
        profileChannel = supabase
          .channel(`public:profiles:${userId}:${timestamp}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, 
            () => syncUserData(userId, undefined, true))
          .subscribe();
  
        subscriptionChannel = supabase
          .channel(`public:subscriptions:${userId}:${timestamp}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` }, 
            () => syncUserData(userId, undefined, true))
          .subscribe();
      };
  
      // Pre-init
      initAuthAndSubscribe();
  
      // Step 3: Global Auth Listener
      const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (!isMounted.current) return;
        
        console.log(`[Auth] Event: ${event}`, { userId: newSession?.user?.id });
  
        const currentUser = newSession?.user ?? null;
        
        if (event === 'SIGNED_OUT') {
          if (profileChannel) supabase.removeChannel(profileChannel);
          if (subscriptionChannel) supabase.removeChannel(subscriptionChannel);
          setSession(null);
          setUser(null);
          setProfile(null);
          setSubscription(null);
          fetchLockRef.current = null;
          resetRateLimiters();
          return;
        }
  
        // Only trigger state updates/syncs if the user identity has actually changed or token was refreshed
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
          console.log(`[Auth] Updating session on ${event}`);
          setSession(newSession);
          setUser(currentUser);
          
          if (currentUser) {
            setupSubscriptions(currentUser.id);
            syncUserData(currentUser.id, currentUser).catch(err => {
              console.error('[Auth] Background sync on event failed:', err);
            });
          }
        }
      });

      // Step 4: Background Session Heartbeat
      // Periodically check if session is still valid (every 10 minutes)
      const heartbeat = setInterval(async () => {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession && isMounted.current) {
          setSession(currentSession);
          setUser(currentSession.user);
        }
      }, 1000 * 60 * 10);
  
      return () => {
        isMounted.current = false;
        authListener.unsubscribe();
        clearInterval(heartbeat);
        if (profileChannel) supabase.removeChannel(profileChannel);
        if (subscriptionChannel) supabase.removeChannel(subscriptionChannel);
      };
    }, [syncUserData]);

  // Removal of frequent logging to prevent console pressure in production

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      profile, 
      subscription, 
      loading, 
      authReady, 
      isPro,
      isBusiness,
      isAdmin, 
      signOut,
      switchAccount,
      addAccount,
      removeAccount,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};
