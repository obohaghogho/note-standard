import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { safeProfile, safeSubscription, supabase, resetRateLimiters, ensureProfile } from "../lib/supabaseSafe";
import type { Profile, Subscription } from "../types/auth";
import toast from "react-hot-toast";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  subscription: Subscription | null;
  loading: boolean;
  authReady: boolean;
  isPro: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
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

  // Compute isPro based on subscription status
  const isPro = useMemo(() => {
    return subscription?.status === 'active' && subscription?.plan_tier === 'pro';
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
        // If we got 'ERROR', we keep the previous state (or null if initial)
        // to avoid wiping out UI data during a transient network blip.
        if (profileResult !== 'ERROR') {
          setProfile(profileResult as Profile | null);
        }
        
        if (subResult !== 'ERROR') {
          setSubscription(subResult as Subscription | null);
        }
      }
    } catch (err: unknown) {
      console.error("[Auth] Sync failed:", err);
    } finally {
      if (isMounted.current && fetchLockRef.current === userId) {
        fetchLockRef.current = null;
      }
    }
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
      setSession(null);
      setUser(null);
      setProfile(null);
      setSubscription(null);
      fetchLockRef.current = null;
      resetRateLimiters();
      
      toast.success('Signed out successfully');
    } catch (error: any) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    }
  };

  useEffect(() => {
    isMounted.current = true;

    const initAuth = async () => {
      try {
        setLoading(true);
        // Step 1: Just get the session (fastest possible)
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (isMounted.current) {
          const currentUser = initialSession?.user ?? null;
          setSession(initialSession);
          setUser(currentUser);
          
          // Clear loading immediately so the app can render the dashboard/login
          setLoading(false);
          setAuthReady(true);

          if (currentUser) {
            // Step 2: Sync profile/sub in the background without awaiting
            syncUserData(currentUser.id, currentUser).catch(err => {
              console.error('[Auth] Background sync failed:', err);
            });
          }
        }
      } catch (err) {
        console.error('[Auth] Init failed:', err);
        if (isMounted.current) {
          setLoading(false);
          setAuthReady(true);
        }
      }
    };

    initAuth();

    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted.current) return;
      
      console.log(`[Auth] Event: ${event}`, newSession?.user?.id);

      const currentUser = newSession?.user ?? null;
      
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        setSubscription(null);
        fetchLockRef.current = null;
        resetRateLimiters();
        return;
      }

      setSession(newSession);
      setUser(currentUser);

      // Background sync on relevant events
      if (currentUser && (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION')) {
        syncUserData(currentUser.id, currentUser).catch(err => {
          console.error('[Auth] Background sync on event failed:', err);
        });
      }
    });

    return () => {
      isMounted.current = false;
      authListener.unsubscribe();
    };
  }, [syncUserData]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      profile, 
      subscription, 
      loading, 
      authReady, 
      isPro, 
      isAdmin, 
      signOut,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};
