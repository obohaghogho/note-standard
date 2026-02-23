export interface Profile {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  role?: string;
  preferred_language?: string;
  user_consent?: boolean;
  consent_at?: string;
  preferences?: {
    analytics?: boolean;
    offers?: boolean;
    partners?: boolean;
    [key: string]: any;
  };
  updated_at?: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  plan: string;
  plan_tier: 'free' | 'pro' | 'team' | 'enterprise';
  current_period_end: string;
  stripe_customer_id?: string;
  created_at?: string;
}
