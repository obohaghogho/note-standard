import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types/auth';

const STORAGE_KEY = 'notestandard_accounts';

export interface StoredAccount {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  session: Session;
  profile: Profile;
  lastActive: number;
}

/**
 * Get all stored accounts from localStorage
 */
export const getStoredAccounts = (): StoredAccount[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('[AccountManager] Failed to parse accounts:', err);
    return [];
  }
};

/**
 * Save or update an account in the list
 */
export const saveAccount = (session: Session, profile: Profile) => {
  if (!session?.user?.id || !profile) return;

  const accounts = getStoredAccounts();
  const index = accounts.findIndex(a => a.id === session.user.id);

  const accountData: StoredAccount = {
    id: session.user.id,
    email: session.user.email || '',
    full_name: profile.full_name || profile.username || 'User',
    avatar_url: profile.avatar_url || null,
    session,
    profile,
    lastActive: Date.now()
  };

  if (index !== -1) {
    accounts[index] = accountData;
  } else {
    accounts.push(accountData);
  }

  // Limit to 5 accounts for performance/sanity
  if (accounts.length > 5) {
    accounts.sort((a, b) => b.lastActive - a.lastActive);
    accounts.splice(5);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
};

/**
 * Remove an account from the list
 */
export const removeAccount = (userId: string) => {
  const accounts = getStoredAccounts().filter(a => a.id !== userId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
};

/**
 * Prepare the app for a new login (without losing existing sessions)
 */
export const prepareForNewAccount = () => {
  // We don't clear localStorage, we just want the next login to not use the current session
  // Supabase will handle the overwrite, but we might want to manually clear the 'sb-...' key 
  // if we want to force the login page.
};

/**
 * Get a specific account by ID
 */
export const getAccount = (userId: string): StoredAccount | undefined => {
  return getStoredAccounts().find(a => a.id === userId);
};
