import { API_URL } from '../lib/api';
import { supabase } from '../lib/supabase';

export interface Ad {
    id: string;
    user_id: string;
    title: string;
    content: string;
    image_url?: string;
    link_url?: string;
    destination_url?: string; // New: Target link
    media_url?: string; // New: Image/Video link
    status: 'pending' | 'approved' | 'rejected' | 'paused' | 'pending_activation' | 'paused_funds';
    tags?: string[];
    target_category?: string;
    views: number;
    clicks: number;
    max_views?: number; // Fix 2: was accidentally removed during V5 migration
    max_clicks?: number;
    start_date?: string;
    end_date?: string;
    cpc_bid?: number;
    advertiser_value?: number;
    created_at: string;
}

// Patch C: typed response for enriched auction-intel endpoint
export interface AuctionIntel {
    medianCpc: number;
    topCpc: number;
    totalBidders: number;
    recommendedBid: number;   // 30% above median — new
    marketTrend: 'competitive' | 'open'; // new
    pricingTiers: {
        basic:   { minBid: number; maxBid: number; boostMultiplier: number };
        boost:   { minBid: number; maxBid: number; boostMultiplier: number };
        premium: { minBid: number; maxBid: number; boostMultiplier: number };
    };
}

// Generate or retrieve persistent Device Fingerprint UUID
const getDeviceId = () => {
    let devId = localStorage.getItem('ns_ad_device_id');
    if (!devId) {
        // Fallback to random ID generation if crypto isn't available
        devId = typeof crypto !== 'undefined' && crypto.randomUUID 
            ? crypto.randomUUID() 
            : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('ns_ad_device_id', devId);
    }
    return devId;
};

export const adService = {
    // Create Ad
    async createAd(adData: { 
        title: string; 
        content: string; 
        image_url?: string; 
        link_url?: string; 
        destination_url?: string;
        media_url?: string;
        tags?: string[];
        start_date?: string;
        end_date?: string;
        max_views?: number;
        max_clicks?: number;
        cpc_bid?: number;
        tier?: 'basic' | 'boost' | 'premium'; // Patch B: optional tier for advertiser_value resolution
    }) {

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await fetch(`${API_URL}/api/ads`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(adData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create ad');
        }

        return await response.json();
    },

    // Get Public Ads (for display) with Context Filtering and Frequency Exclusions
    async getPublicAds(tags?: string[], excludeIds?: string[]) {
        const url = new URL(`${API_URL}/api/ads`);

        // Pass tags if available for contextual filtering
        if (tags && tags.length > 0) {
            url.searchParams.append('tags', tags.join(','));
        }

        // Pass seen ads to prevent repeat impressions in session
        if (excludeIds && excludeIds.length > 0) {
            url.searchParams.append('exclude', excludeIds.join(','));
        }

        const deviceId = getDeviceId();
        const response = await fetch(url.toString(), {
            headers: {
                'X-Device-Id': deviceId
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch ads');
        }

        return await response.json();
    },

    // Get Market Intel for competitive bidding dashboard
    async getAuctionIntel(): Promise<AuctionIntel> {
        const response = await fetch(`${API_URL}/api/ads/auction-intel`);

        if (!response.ok) {
            throw new Error('Failed to fetch auction intel');
        }

        return await response.json() as AuctionIntel;
    },

    // Get My Ads
    async getMyAds() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await fetch(`${API_URL}/api/ads/my-ads`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch my ads');
        }

        return await response.json();
    },

    // Admin: Get All Ads
    async getAdminAds(status?: string) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const url = new URL(`${API_URL}/api/ads/admin`);
        if (status) url.searchParams.append('status', status);

        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch admin ads');
        }

        return await response.json();
    },

    // Create Wallet Top Up Session
    async createWalletTopupSession(amount: number) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await fetch(`${API_URL}/api/ads/pay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ amount })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to initialize deposit');
        }

        return await response.json();
    },

    // Sync Activation
    async syncAdPayment(sessionId: string) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await fetch(`${API_URL}/api/ads/sync-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ session_id: sessionId })
        });

        if (!response.ok) {
            // Don't throw here, just return success: false
            return { success: false };
        }

        return await response.json();
    },

    // Admin: Update Status
    async updateAdStatus(id: string, status: string) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await fetch(`${API_URL}/api/ads/${id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ status })
        });

        if (!response.ok) {
            throw new Error('Failed to update ad status');
        }

        return await response.json();
    },

    // Track Ad Event (Impression or Click - Fraud Protected)
    async trackEvent(id: string, type: 'impression' | 'click') {
        try {
            const deviceId = getDeviceId();
            // Does not require authentication, but we send it normally
            const response = await fetch(`${API_URL}/api/ads/${id}/track`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-Id': deviceId
                },
                body: JSON.stringify({ type })
            });
            
            if (!response.ok) {
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }
};
