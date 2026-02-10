import { useState, useEffect } from 'react';
import { adService, type Ad } from '../../services/ads';
import { supabase } from '../../lib/supabase';
import { AdCard } from './AdCard';

export const CommunityAds = () => {
    const [ads, setAds] = useState<Ad[]>([]);
    const [currentAdIndex, setCurrentAdIndex] = useState(0);

    useEffect(() => {
        const fetchAds = async () => {
            try {
                const data = await adService.getPublicAds();
                if (data && data.length > 0) {
                    setAds(data);
                } else {
                    setAds([]);
                }
            } catch (error) {
                console.error('Failed to fetch ads', error);
            }
        };

        fetchAds();

        // Realtime subscription for community ads
        const channel = supabase
            .channel('community:ads')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'ads',
                    filter: 'status=eq.approved'
                },
                () => {
                    fetchAds();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        if (ads.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentAdIndex((prev: number) => (prev + 1) % ads.length);
        }, 10000); // Rotate every 10 seconds

        return () => clearInterval(interval);
    }, [ads.length]);

    if (ads.length === 0) {
        return (
            <AdCard
                ad={{
                    title: 'Your Ad Here',
                    content: 'Pro users can promote their content to the entire community.',
                    link_url: '/dashboard/settings'
                }}
                compact
            />
        );
    }

    return (
        <div className="animate-in fade-in duration-500">
            <AdCard ad={ads[currentAdIndex]} compact />
        </div>
    );
};
