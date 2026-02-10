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
    status: 'pending' | 'approved' | 'rejected' | 'paused' | 'pending_payment';
    tags?: string[];
    target_category?: string;
    views: number;
    clicks: number;
    start_date?: string;
    end_date?: string;
    created_at: string;
}

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

    // Get Public Ads (for display) with Context Filtering
    async getPublicAds(tags?: string[]) {
        const url = new URL(`${API_URL}/api/ads`);

        // Pass tags if available for contextual filtering
        if (tags && tags.length > 0) {
            url.searchParams.append('tags', tags.join(','));
        }

        const response = await fetch(url.toString());


        if (!response.ok) {
            throw new Error('Failed to fetch ads');
        }

        return await response.json();
    },

    // Get Test Ad (for development/testing)
    // async getTestAd() {
    //     const response = await fetch(`${API_URL}/api/ads/test-ad`);
    //
    //     if (!response.ok) {
    //         throw new Error('Failed to fetch test ad');
    //     }
    //
    //     return await response.json();
    // },

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

    // Create Payment Session
    async createAdCheckoutSession(adId: string) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await fetch(`${API_URL}/api/ads/pay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ adId })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create payment session');
        }

        return await response.json();
    },

    // Sync Payment
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
    }
};
