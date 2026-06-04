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

  const loadUser = useCallback(async () => {
    try {
      const u = await AuthService.getUser();
      const token = await AuthService.getToken();
      if (u && token) setUser(u);
      
      const accs = await AuthService.getStoredAccounts();
      setAccounts(accs);

      if (token && u) {
        SignalingService.init(token, u.id);
        setAccountReady(true);
      }
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
      setAccounts([]);
      SignalingService.disconnect();
    };

    const handleSwitch = (newUser: User) => {
      setUser(newUser);
      AuthService.getStoredAccounts().then(setAccounts);
    };

    const handleNotificationSwitch = async ({ userId }: { userId: string }) => {
      setAccountReady(false);
      const success = await AuthService.switchAccount(userId);
      if (success) {
        const newUser = await AuthService.getUser();
        const token = await AuthService.getToken();
        if (newUser && token) {
          SignalingService.disconnect();
          SignalingService.init(token, newUser.id);
          setUser(newUser);
          const accs = await AuthService.getStoredAccounts();
          setAccounts(accs);
        }
      }
      setAccountReady(true);
      // Let the NotificationRouter know the state is fully recovered
      const { NotificationRouter } = require('../services/NotificationRouter');
      NotificationRouter.signalAccountReady(userId);
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
      const res = await apiClient.post(`/auth/login`, { email, password });
      const { token, refresh_token, user: userData } = res.data;
      await AuthService.setToken(token);
      if (refresh_token) await AuthService.setRefreshToken(refresh_token);
      await AuthService.setUser(userData);
      setUser(userData);
      
      // Initialize signaling immediately after login
      SignalingService.init(token, userData.id);
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
      const res = await apiClient.post(`/auth/register`, { full_name: fullName, email, password });
      const { token, user: userData } = res.data;
      await AuthService.setToken(token);
      await AuthService.setUser(userData);
      setUser(userData);
      
      // Initialize signaling immediately after registration
      SignalingService.init(token, userData.id);
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
