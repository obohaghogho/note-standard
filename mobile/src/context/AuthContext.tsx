import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/apiClient';
import { AuthService, User } from '../services/AuthService';
import { StoredAccount } from '../utils/AccountManager';
import EventEmitter from '../services/EventEmitter';
import SignalingService from '../services/SignalingService';
import { PushHandler } from '../services/PushHandler';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  accounts: StoredAccount[];
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (fullName: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchAccount: (userId: string) => Promise<boolean>;
  removeAccount: (userId: string) => Promise<void>;
  addAccount: () => void;
  accountReady: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [accountReady, setAccountReady] = useState(false);
  // Ref to hold the userId that needs to be signaled once React commits the new user.
  // This ensures signalAccountReady() fires AFTER the setUser() render cycle completes.
  const pendingSignalUserIdRef = React.useRef<string | null>(null);

  const loadUser = useCallback(async () => {
    try {
      const u = await AuthService.getUser();
      const token = await AuthService.getToken();
      if (u && token) setUser(u);
      
      const accs = await AuthService.getStoredAccounts();
      setAccounts(accs);

      if (token && u) {
        const acc = accs.find(a => a.id === u.id);
        SignalingService.init(token, u.id, acc?.sessionId, acc?.deviceId);
        setAccountReady(true);
      }

      // Layer 2: Hydrate Active Session
      AuthService.hydrateActiveSession();
      
      // Layer 3: Background Validation
      AuthService.validateInactiveSessionsInBackground();
    } catch (err) {
      console.error('[AuthContext] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { 
    loadUser(); 
    
    // Listen for global logout events (e.g. from 401 interceptor)
    const handleLogout = () => {
      setUser(null);
      SignalingService.disconnect();
      AuthService.getStoredAccounts().then(setAccounts);
    };

    const handleSwitch = (newUser: User) => {
      setUser(newUser);
      AuthService.getStoredAccounts().then(setAccounts);
    };

    const handleNotificationSwitch = async ({ userId }: { userId: string }) => {
      console.log(`[AuthContext] handleNotificationSwitch: switching to ${userId}`);
      setAccountReady(false);
      
      const success = await AuthService.switchAccount(userId);
      if (success) {
        const newUser = await AuthService.getUser();
        const token = await AuthService.getToken();
        if (newUser && token) {
          const accs = await AuthService.getStoredAccounts();
          const acc = accs.find(a => a.id === newUser.id);
          // Disconnect old socket BEFORE reconnecting
          SignalingService.disconnect();
          SignalingService.init(token, newUser.id, acc?.sessionId, acc?.deviceId);
          // Register the signal BEFORE calling setUser so the
          // post-render useEffect([user]) can fire it at the right time.
          pendingSignalUserIdRef.current = userId;
          setUser(newUser);
          const updatedAccs = await AuthService.getStoredAccounts();
          setAccounts(updatedAccs);
          // Switch partially failed — still signal to unblock NotificationRouter
          console.warn('[AuthContext] Account switch succeeded but user/token missing');
          setAccountReady(true);
          const { NotificationRouter } = require('../services/NotificationRouter');
          NotificationRouter.signalAccountReady(userId, false);
        }
      } else {
        // Switch completely failed (e.g., token expired and refresh failed)
        console.error(`[AuthContext] AuthService.switchAccount failed for userId: ${userId}`);
        setAccountReady(true);
        const { NotificationRouter } = require('../services/NotificationRouter');
        NotificationRouter.signalAccountReady(userId, false); // Pass false to indicate failure
        
        const { Alert } = require('react-native');
        Alert.alert('Account Switch Failed', 'The target account session has expired. Please log in again from the profile menu.');
      }
    };

    EventEmitter.on('auth:logout', handleLogout);
    EventEmitter.on('auth:switch', handleSwitch);
    EventEmitter.on('notification:switch_account', handleNotificationSwitch);
    
    return () => {
      EventEmitter.off('auth:logout', handleLogout);
      EventEmitter.off('auth:switch', handleSwitch);
      EventEmitter.off('notification:switch_account', handleNotificationSwitch);
    };
  }, [loadUser]);

  // ── Post-render signal: fires AFTER React commits the new user to the tree ──
  // This is the ONLY correct place to call signalAccountReady — it guarantees
  // that when NotificationRouter navigates, ChatScreen will already see the
  // correct user in its context.
  useEffect(() => {
    const pendingUserId = pendingSignalUserIdRef.current;
    if (pendingUserId && user?.id === pendingUserId) {
      console.log(`[AuthContext] Post-render: signaling account ready for ${pendingUserId}`);
      pendingSignalUserIdRef.current = null;
      setAccountReady(true);
      const { NotificationRouter } = require('../services/NotificationRouter');
      NotificationRouter.signalAccountReady(pendingUserId, true);
    }
  }, [user]);


  useEffect(() => {
    if (user) {
      console.log(`[AuthContext] Ensuring device push tokens are registered for user: ${user.id}`);
      PushHandler.registerDeviceToken().catch(err => {
        console.warn('[AuthContext] Device token registration failed:', err);
      });
    }
  }, [user]);

  const login = async (email: string, password: string) => {
    try {
      const { DeviceManager } = require('../utils/DeviceManager');
      const device_id = await DeviceManager.getDeviceId();
      const platform = require('react-native').Platform.OS;
      
      const res = await apiClient.post(`/auth/login`, { email, password, device_id, platform });
      const { token, refresh_token, user: userData, session_id } = res.data;
      await AuthService.setToken(token);
      if (refresh_token) await AuthService.setRefreshToken(refresh_token);
      await AuthService.setUser(userData, session_id, device_id);
      setUser(userData);
      
      // Initialize signaling immediately after login
      SignalingService.init(token, userData.id, session_id, device_id);
      setAccountReady(true);
      
      // Update accounts list
      const accs = await AuthService.getStoredAccounts();
      setAccounts(accs);
      
      return { success: true };
    } catch (err: any) {
      console.error('[AuthContext] Login error:', err.response?.data || err.message);
      const msg = err?.response?.data?.message || err?.response?.data?.error || err.message || 'Login failed. Please try again.';
      return { success: false, error: msg };
    }
  };

  const register = async (fullName: string, email: string, password: string) => {
    try {
      const { DeviceManager } = require('../utils/DeviceManager');
      const device_id = await DeviceManager.getDeviceId();
      const platform = require('react-native').Platform.OS;

      const res = await apiClient.post(`/auth/register`, { full_name: fullName, email, password, device_id, platform });
      const { token, user: userData, session_id } = res.data;
      await AuthService.setToken(token);
      await AuthService.setUser(userData, session_id, device_id);
      setUser(userData);
      
      // Initialize signaling immediately after registration
      SignalingService.init(token, userData.id, session_id, device_id);
      setAccountReady(true);
      
      // Update accounts list
      const accs = await AuthService.getStoredAccounts();
      setAccounts(accs);
      
      return { success: true };
    } catch (err: any) {
      console.error('[AuthContext] Register error:', err.response?.data || err.message);
      const msg = err?.response?.data?.message || err?.response?.data?.error || err.message || 'Registration failed. Please try again.';
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    await AuthService.logout();
    setUser(null);
    setAccounts([]);
  };

  const switchAccount = async (userId: string) => {
    const success = await AuthService.switchAccount(userId);
    return success;
  };

  const removeAccount = async (userId: string) => {
    const { AccountManager } = require('../utils/AccountManager');
    await AccountManager.removeAccount(userId);
    const accs = await AuthService.getStoredAccounts();
    setAccounts(accs);
    if (user?.id === userId) {
      setUser(null);
    }
  };

  const addAccount = () => {
    setUser(null); 
  };

  return (
    <AuthContext.Provider value={{ 
      user, isLoading, isAuthenticated: !!user, accounts,
      login, register, logout, switchAccount, removeAccount, addAccount, accountReady 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
