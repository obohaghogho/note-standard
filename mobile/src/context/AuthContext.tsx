import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/apiClient';
import { AuthService, User } from '../services/AuthService';
import EventEmitter from '../services/EventEmitter';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (fullName: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const u = await AuthService.getUser();
    const token = await AuthService.getToken();
    if (u && token) setUser(u);
    setIsLoading(false);
  }, []);

  useEffect(() => { 
    loadUser(); 
    
    // Listen for global logout events (e.g. from 401 interceptor)
    const handleLogout = () => setUser(null);
    EventEmitter.on('auth:logout', handleLogout);
    
    return () => {
      EventEmitter.off('auth:logout', handleLogout);
    };
  }, [loadUser]);

  const login = async (email: string, password: string) => {
    try {
      const res = await apiClient.post(`/auth/login`, { email, password });
      const { token, user: userData } = res.data;
      await AuthService.setToken(token);
      await AuthService.setUser(userData);
      setUser(userData);
      return { success: true };
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Login failed. Please try again.';
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
      return { success: true };
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Registration failed. Please try again.';
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    await AuthService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
