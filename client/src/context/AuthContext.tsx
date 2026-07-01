import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { User, Session, RealtimeChannel } from "@supabase/supabase-js";
import { safeProfile, safeSubscription, supabase, resetRateLimiters, ensureProfile, updateGlobalAuthState } from "../lib/supabaseSafe";
import type { Profile, Subscription } from "../types/auth";
import toast from "react-hot-toast";
import * as accountManager from "../utils/accountManager";
import { updateSessionMeta } from "../utils/accountManager";
import { refreshSessionIsolated } from "../utils/authUtils";
import { getDeviceId } from "../utils/deviceId";

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
        if (profileResult) {
          const prof = profileResult as Profile;
          setProfile(prof);
          
          // Atomic update to account manager
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (currentSession?.user?.id === userId) {
            accountManager.saveAccount(currentSession, prof);
          }
        }
        
        if (subResult) {
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
        accountManager.updateAccountTokens(user.id, { access_token: '', refresh_token: '', expires_at: 0 });
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

    if (userId === user?.id) {
      console.log(`[Auth] Already logged in as ${userId}. Skipping switch.`);
      return;
    }

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

      // Rule 13: Try to use the stored access token first via setSession.
      // CRITICAL: Do NOT call refreshSessionIsolated() eagerly. Supabase enforces single-use
      // refresh tokens. If the mobile app already consumed this refresh token, calling
      // refreshSessionIsolated() here will get a 400 'invalid_grant' error.
      // Strategy: Try setSession with the stored token first. If it succeeds (even with a stale
      // access token), Supabase's SDK will auto-refresh it. Only fall back to manual refresh
      // if we have no access token at all.

      const storedAccess = target.tokens?.access_token || target.session?.access_token;
      const storedRefresh = target.tokens?.refresh_token || target.session?.refresh_token;

      if (!storedRefresh) {
        toast.dismiss(toastId);
        toast.error(`No credentials found for ${target.email}. Please log in again.`);
        setIsSwitching(false);
        switchInProgress.current = false;
        window.location.href = `/login?add_account=true&hint=${encodeURIComponent(target.email)}`;
        return;
      }

      // Attempt setSession with whatever tokens we have.
      // Supabase SDK will silently auto-refresh the access token if it's expired.
      let freshSession: { access_token: string; refresh_token: string } | null = null;

      try {
        const { data: setResult, error: setError } = await supabase.auth.setSession({
          access_token: storedAccess || '',
          refresh_token: storedRefresh,
        });
        
        if (!setError && setResult.session) {
          // setSession succeeded — save any newly rotated tokens
          freshSession = {
            access_token: setResult.session.access_token,
            refresh_token: setResult.session.refresh_token,
          };
          accountManager.updateAccountTokens(userId, setResult.session);
          console.log('[Auth] setSession succeeded for', target.email);
        } else {
          console.warn('[Auth] setSession failed:', setError?.message, '— trying isolated refresh as last resort');
          // Only now try refreshSessionIsolated as last resort
          const latestAccount = accountManager.getAccount(userId);
          if (latestAccount) {
            const isolated = await refreshSessionIsolated(latestAccount);
            if (isolated) freshSession = isolated;
          }
        }
      } catch (sessionErr) {
        console.warn('[Auth] setSession threw:', sessionErr, '— trying isolated refresh as last resort');
        const latestAccount = accountManager.getAccount(userId);
        if (latestAccount) {
          const isolated = await refreshSessionIsolated(latestAccount).catch(() => null);
          if (isolated) freshSession = isolated;
        }
      }

      // Rule 5: Protect against overlapping switch
      if (currentSwitchId !== switchIdRef.current) return;

      if (!freshSession) {
        toast.dismiss(toastId);
        toast.error(`Session for ${target.email} has expired. Please re-authenticate.`);
        setIsSwitching(false);
        switchInProgress.current = false;
        window.location.href = `/login?add_account=true&hint=${encodeURIComponent(target.email)}`;
        return;
      }

      // Rule 3: Update active account ID FIRST
      accountManager.setActiveAccountId(userId);

      // NOTE: We do NOT call supabase.auth.setSession() again here.
      // The session was already established in the try block above.
      // Calling setSession again would burn the newly rotated refresh token (Supabase single-use policy).

      // Note: Logic continues in onAuthStateChange listener.
      // We don't need syncUserData here as listener will trigger it.
      
      toast.success(`Switched to ${target.email}`, { id: toastId });

    } catch (err) {
      console.error('[Auth] Switch failed:', err);
      
      // Rollback active account ID if we were switching
      const accounts = accountManager.getAllAccounts();
      const currentActive = accountManager.getActiveAccountId();
      const userIsStillInList = accounts.some(a => a.id === user?.id);
      
      if (user?.id && userIsStillInList && currentActive !== user.id) {
        accountManager.setActiveAccountId(user.id);
      }

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
        // First check native Supabase storage which handles cross-tab syncing and auto-refresh natively
        let { data: { session: initialSession } } = await supabase.auth.getSession();

        // If native storage lost the session (e.g. cleared somehow), try to rehydrate from our multi-account manager
        if (!initialSession) {
          const activeId = accountManager.getActiveAccountId();
          if (activeId) {
            const acc = accountManager.getAccount(activeId);
            if (acc) {
              console.log(`[Auth] Native session missing. Rehydrating active account from multi-account manager: ${acc.email}`);
              const { data } = await supabase.auth.setSession({
                access_token: acc.tokens.access_token,
                refresh_token: acc.tokens.refresh_token
              });
              initialSession = data.session;
            }
          }
        }
        
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
    let activeSubscriptionUserId: string | null = null;

    const setupSubscriptions = (userId: string) => {
      // Guard against duplicate initialization for the same user
      if (activeSubscriptionUserId === userId && profileChannel && subscriptionChannel) {
        return;
      }
      activeSubscriptionUserId = userId;

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
      console.log(`[Auth Forensic] Event: ${event} (#${currentId}) at ${Date.now()}`, { 
        email: newSession?.user?.email,
        hasSession: !!newSession,
        hasUser: !!newSession?.user
      });

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

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        const currentUser = newSession?.user ?? null;
        
        console.log(`[Auth Forensic] State update triggering for ${event} at ${Date.now()}`);
        setSession(newSession);
        setUser(prev => (prev?.id === currentUser?.id ? prev : currentUser));

        // Rule 4: Switch complete - Disable lock immediately to allow syncUserData to fetch
        // Capture wasSwitching BEFORE clearing it so session-registration logic can use it.
        const wasSwitching = switchInProgress.current;
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

          // Register device+session with backend (background, non-blocking).
          // BUG FIX: Previously only ran on SIGNED_IN. Account switches fire TOKEN_REFRESHED
          // or USER_UPDATED instead, so the switched-to account never got a session_id,
          // causing the socket to connect with a stale/missing session.
          // Now we also register on any switch (wasSwitching) or initial sign-in.
          // JOURNEY 3 FIX: INITIAL_SESSION covers existing/inactive users who never logged out.
          const shouldRegisterSession = event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || wasSwitching;
          if (shouldRegisterSession) {
            getDeviceId().then(deviceId => {
            const apiBase = import.meta.env.VITE_API_URL || '';
            fetch(`${apiBase}/api/auth/register-session`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: currentUser.email,
                device_id: deviceId,
                platform: 'web',
                _supabase_access_token: newSession.access_token,
              })
            }).then(r => r.json()).then(data => {
              if (data.session_id) {
                updateSessionMeta(currentUser.id, data.session_id, deviceId!);
              }
            }).catch(err => {
              console.warn('[Auth] Background device registration failed:', err.message);
            });

            // V2 Boot-Sync: Register/update this browser's push installation in the
            // new multi-account tables. Runs on every SIGNED_IN and account switch.
            // This is the critical path that seeds the V2 schema for existing subscribers
            // without requiring any user action.
            // V2 Boot-Sync: Register/update this browser's push installation in the
            // new multi-account tables. Runs on every SIGNED_IN and account switch.
            // ROOT FIX: Extracted registration into runPushRegistration() so it can be
            // called both immediately (permission 'granted') and after auto-requesting
            // permission for 'default' devices (never prompted). Previously, 'default'
            // devices silently skipped the entire chain and never got a subscription.
            const runPushRegistration = async () => {
              if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
              if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
              try {
                const reg = await navigator.serviceWorker.ready;
                let sub = await reg.pushManager.getSubscription();

                const currentVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
                if (currentVapidKey) {
                  const padding = '='.repeat((4 - (currentVapidKey.length % 4)) % 4);
                  const base64 = (currentVapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
                  const rawData = window.atob(base64);
                  const currentVapidBuffer = new Uint8Array(rawData.length);
                  for (let i = 0; i < rawData.length; ++i) {
                    currentVapidBuffer[i] = rawData.charCodeAt(i);
                  }

                  if (sub && sub.options.applicationServerKey) {
                    const existingVapidBuffer = new Uint8Array(sub.options.applicationServerKey);
                    let isMismatch = currentVapidBuffer.length !== existingVapidBuffer.length;
                    if (!isMismatch) {
                      for (let i = 0; i < currentVapidBuffer.length; i++) {
                        if (currentVapidBuffer[i] !== existingVapidBuffer[i]) { isMismatch = true; break; }
                      }
                    }
                    if (isMismatch) {
                      console.warn('[Auth] [V2 Boot-Sync] VAPID key mismatch — resubscribing...');
                      await sub.unsubscribe();
                      sub = null;
                    } else {
                      try {
                        const statusRes = await fetch(`${apiBase}/api/notifications/installation-status/${deviceId}`, {
                          headers: { 'Authorization': `Bearer ${newSession.access_token}` }
                        });
                        if (statusRes.ok) {
                          const statusData = await statusRes.json();
                          if (statusData.status === 'INVALID') {
                            console.warn(`[Auth] [V2 Boot-Sync] INVALID endpoint detected — forcing fresh subscription...`);
                            await sub.unsubscribe();
                            sub = null;
                          }
                        }
                      } catch (err: unknown) {
                        console.warn('[Auth] [V2 Boot-Sync] Failed to check status:', err instanceof Error ? err.message : String(err));
                      }
                    }
                  }

                  if (!sub) {
                    console.log('[Auth] [V2 Boot-Sync] Generating fresh push subscription...');
                    sub = await reg.pushManager.subscribe({
                      userVisibleOnly: true,
                      applicationServerKey: currentVapidBuffer
                    });
                  }
                }

                if (!sub) {
                  console.log('[Auth] [V2 Boot-Sync] No push subscription available.');
                  return;
                }

                console.log(`[Auth] [V2 Boot-Sync] Syncing installation for ${currentUser.email}...`);
                const subJson = sub.toJSON();
                const resp = await fetch(`${apiBase}/api/notifications/register-installation`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${newSession.access_token}` },
                  body: JSON.stringify({
                    deviceId,
                    pushEndpoint: sub.endpoint,
                    pushP256dh: subJson.keys?.["p256dh"] || null,
                    pushAuth: subJson.keys?.["auth"] || null,
                    platform: 'web',
                    type: 'vapid',
                    reason: wasSwitching ? 'ACCOUNT_SWITCH' : (event === 'INITIAL_SESSION' ? 'INITIAL_SESSION' : 'SIGNED_IN'),
                    capabilities: { supports_web_push: true, supports_fcm: false, supports_apns: false, supports_background_sync: true }
                  })
                });
                const data = await resp.json();
                if (resp.ok) {
                  console.log(`[Auth] [V2 Boot-Sync] ✅ installation_id: ${data.installation_id}`);
                } else {
                  console.error(`[Auth] [V2 Boot-Sync] ❌ status:${resp.status} error:${data?.error}`);
                }
              } catch (e: unknown) {
                console.warn('[Auth] [V2 Boot-Sync] non-fatal:', e instanceof Error ? e.message : String(e));
              }
            };

            if (typeof Notification !== 'undefined') {
              if (Notification.permission === 'granted') {
                // Already granted — run immediately
                runPushRegistration();
              } else if (Notification.permission === 'default') {
                // Never asked — prompt automatically on login, then register if approved
                console.log('[Auth] [V2 Boot-Sync] Permission default — auto-requesting...');
                Notification.requestPermission().then(result => {
                  console.log(`[Auth] [V2 Boot-Sync] Permission result: ${result}`);
                  if (result === 'granted') runPushRegistration();
                }).catch(() => {});
              }
            }
            });
          }

          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || wasSwitching) {
             setupSubscriptions(currentUser.id);
             syncUserData(currentUser.id, currentUser, currentId);
          }
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
