import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adService, type Ad } from '../../services/ads';
import { supabase } from '../../lib/supabaseSafe';
import { Card } from '../common/Card';
import { SecureImage } from '../common/SecureImage';
import { ExternalLink, X } from 'lucide-react';

interface AdDisplayProps {
    className?: string;
    currentTags?: string[]; // Tags from the currently viewed note
}

export const AdDisplay = ({ className = '', currentTags = [] }: AdDisplayProps) => {
    const { isPro, user, profile } = useAuth();
    const [ad, setAd] = useState<Ad | null>(null);
    const [visible, setVisible] = useState(true);

    const [loading, setLoading] = useState(true);
    const lastFetchRef = useRef<{ tags: string[], time: number }>({ tags: [], time: 0 });
    const fetchingRef = useRef(false);

    const checkPrivacySettings = async () => {
        // Generic ads always show for non-logged users
        if (!user) return true; 

        // If profile exists and offers is explicitly false, respect it.
        if (profile?.preferences && profile.preferences.offers === false) {
            return false;
        }
        
        return true;
    };

    const fetchRelevantAd = async (force = false) => {
        if (isPro || (!force && fetchingRef.current)) return;
        
        const allowed = await checkPrivacySettings();
        if (!allowed) {
            setAd(null);
            setLoading(false);
            return;
        }

        const now = Date.now();
        const tagString = JSON.stringify(currentTags);
        const lastTagString = JSON.stringify(lastFetchRef.current.tags);
        
        // Prevent spam: only fetch if tags changed, or if forced (realtime), or if > 30s passed
        if (!force && tagString === lastTagString && (now - lastFetchRef.current.time < 30000)) {
            setLoading(false);
            return;
        }

        if (!force) setLoading(true);
        fetchingRef.current = true;
        try {
            const ads = await adService.getPublicAds(currentTags);
            if (ads && ads.length > 0) {
                // Pick a random ad from the relevant ones
                const randomIndex = Math.floor(Math.random() * ads.length);
                setAd(ads[randomIndex]);
            } else {
                setAd(null);
            }
            lastFetchRef.current = { tags: [...currentTags], time: now };
        } catch (err) {
            console.error('Failed to fetch ads:', err);
        } finally {
            fetchingRef.current = false;
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isPro) {
            setAd(null);
            setLoading(false);
            return;
        }

        fetchRelevantAd();
        
        // Set up realtime subscription for new approved ads
        const channel = supabase
            .channel('public:ads')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen for inserts and status updates
                    schema: 'public',
                    table: 'ads',
                    filter: 'status=eq.approved'
                },
                (payload: any) => {
                    console.log('Realtime ad update received:', payload);
                    fetchRelevantAd(true);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isPro, JSON.stringify(currentTags)]);

    if (isPro || !visible) return null;

    if (loading) {
        return (
            <Card variant="glass" className={`p-4 animate-pulse ${className}`}>
                <div className="flex gap-4">
                    <div className="w-16 h-16 bg-white/10 rounded" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 bg-white/10 rounded w-1/2" />
                        <div className="h-3 bg-white/10 rounded w-full" />
                        <div className="h-3 bg-white/10 rounded w-3/4" />
                    </div>
                </div>
            </Card>
        );
    }

    if (!ad) {
        return (
            <div className={`text-center py-4 border border-dashed border-white/10 rounded-lg ${className}`}>
                <p className="text-[10px] text-gray-500 italic">No community ads available</p>
                <a href="/dashboard/settings" className="text-[10px] text-primary hover:underline mt-1 block">Promote yours?</a>
            </div>
        );
    }

    const targetUrl = ad.destination_url || ad.link_url || '#';
    const imageUrl = ad.media_url || ad.image_url;

    return (
        <div className={`relative group ${className}`}>
            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={() => setVisible(false)}
                    className="p-1 bg-black/50 rounded-full text-white/50 hover:text-white"
                >
                    <X size={12} />
                </button>
            </div>

            <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
            >
                <Card variant="glass" className="p-4 border-l-4 border-l-primary hover:bg-white/5 transition-colors">
                    <div className="flex gap-4">
                        {imageUrl && (
                            <SecureImage
                                src={imageUrl}
                                alt={ad.title}
                                className="w-16 h-16 object-cover rounded bg-gray-800 flex-shrink-0"
                            />
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] uppercase font-bold text-primary tracking-wider border border-primary/30 px-1.5 rounded">
                                    Ad
                                </span>
                                <h4 className="font-semibold text-sm truncate text-white">
                                    {ad.title}
                                </h4>
                            </div>
                            <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                                {ad.content}
                            </p>
                            <div className="flex items-center gap-1 text-[10px] text-primary/80 font-medium">
                                Visit Partner <ExternalLink size={10} />
                            </div>
                        </div>
                    </div>
                </Card>
            </a>
            <div className="text-[10px] text-center text-gray-600 mt-1">
                Privacy-safe ad • {currentTags.length > 0 ? `Matches: ${currentTags.join(', ')}` : 'General'}
            </div>
        </div>
    );
};
