import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adService, type Ad } from '../../services/ads';
import { supabase } from '../../lib/supabaseSafe';
import { Card } from '../common/Card';
import SecureImage from '../common/SecureImage';
import { ExternalLink, X, Info } from 'lucide-react';

interface AdDisplayProps {
    className?: string;
    currentTags?: string[]; // Tags from the currently viewed note
}

const EMPTY_TAGS: string[] = [];

export const AdDisplay = ({ className = '', currentTags = EMPTY_TAGS }: AdDisplayProps) => {

    const { isPro, user, profile } = useAuth();
    const [ad, setAd] = useState<Ad | null>(null);
    const [visible, setVisible] = useState(true);
    const [showInfo, setShowInfo] = useState(false);

    const [loading, setLoading] = useState(true);
    const lastFetchRef = useRef<{ tags: string[], time: number }>({ tags: [], time: 0 });
    const fetchingRef = useRef(false);
    
    // Tracking state
    const containerRef = useRef<HTMLDivElement>(null);
    const trackedRef = useRef({ impression: false, currentAdId: '' });
    
    // Stabilize tags to prevent infinite re-renders
    const stringifiedTags = useMemo(() => JSON.stringify(currentTags), [currentTags]);

    const checkPrivacySettings = useCallback(async () => {
        // Generic ads always show for non-logged users
        if (!user) return true; 

        // If profile exists and offers is explicitly false, respect it.
        if (profile?.preferences && profile.preferences.offers === false) {
            return false;
        }
        
        return true;
    }, [user, profile]);

    const fetchRelevantAd = useCallback(async (force = false) => {
        if (isPro || (!force && fetchingRef.current)) return;
        
        const allowed = await checkPrivacySettings();
        if (!allowed) {
            setAd(null);
            setLoading(false);
            return;
        }

        const now = Date.now();
        const tagString = stringifiedTags;
        const lastTagString = JSON.stringify(lastFetchRef.current.tags);
        const tagsArray = JSON.parse(stringifiedTags);
        
        // Prevent spam: only fetch if tags changed, or if forced (realtime), or if > 30s passed
        if (!force && tagString === lastTagString && (now - lastFetchRef.current.time < 30000)) {
            setLoading(false);
            return;
        }

        const getSeenAds = () => {
            try { return JSON.parse(sessionStorage.getItem('ns_seen_ads') || '[]'); }
            catch { return []; }
        };

        if (!force) setLoading(true);
        fetchingRef.current = true;
        try {
            const seenAds = getSeenAds();
            const ads = await adService.getPublicAds(tagsArray, seenAds);
            if (ads && ads.length > 0) {
                // Pick a random ad from the relevant ones
                const randomIndex = Math.floor(Math.random() * ads.length);
                setAd(ads[randomIndex]);
            } else {
                setAd(null);
            }
            lastFetchRef.current = { tags: tagsArray, time: now };
        } catch (err) {
            console.error('Failed to fetch ads:', err);
            setAd(null); // Fix 7: clear stale ad on fetch failure (e.g. bot-shielded 403, network error)
        } finally {
            fetchingRef.current = false;
            setLoading(false);
        }
    }, [isPro, stringifiedTags, checkPrivacySettings]);

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
                (payload: Record<string, unknown>) => {
                    console.log('Realtime ad update received:', payload);
                    fetchRelevantAd(true);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isPro, stringifiedTags, fetchRelevantAd]);

    // Viewability Tracker
    useEffect(() => {
        if (!ad || isPro || !visible || !containerRef.current) return;

        // Reset tracking if ad changes
        if (trackedRef.current.currentAdId !== ad.id) {
            trackedRef.current = { impression: false, currentAdId: ad.id };
        }

        if (trackedRef.current.impression) return;

        let timeoutId: ReturnType<typeof setTimeout>;

        const observer = new IntersectionObserver(
            (entries) => {
                const [entry] = entries;
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    // Ad is at least 50% visible, start 1.5s timer
                    timeoutId = setTimeout(() => {
                        if (!trackedRef.current.impression) {
                            trackedRef.current.impression = true;
                            // Track organically
                            adService.trackEvent(ad.id, 'impression').catch(console.error);

                            // Store in sessionStorage to frequency cap
                            try {
                                const seen = JSON.parse(sessionStorage.getItem('ns_seen_ads') || '[]');
                                if (!seen.includes(ad.id)) {
                                    seen.push(ad.id);
                                    sessionStorage.setItem('ns_seen_ads', JSON.stringify(seen));
                                }
                            } catch (e) {
                                console.error('Failed to log seen ad', e);
                            }
                        }
                    }, 1500);
                } else {
                    // Ad left view before 1.5s
                    clearTimeout(timeoutId);
                }
            },
            {
                threshold: [0.5] // Require 50% visibility
            }
        );

        observer.observe(containerRef.current);

        return () => {
            clearTimeout(timeoutId);
            observer.disconnect();
        };
    }, [ad, isPro, visible]);

    const handleAdClick = () => {
        if (!ad) return;
        adService.trackEvent(ad.id, 'click').catch(console.error);
    };

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
        <div ref={containerRef} className={`relative group ${className}`}>
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
                onClick={handleAdClick}
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
            <div className="flex items-center justify-center gap-1 mt-1 relative">
                <span className="text-[10px] text-gray-600">Privacy-safe ad</span>
                <button 
                    onClick={(e) => { e.preventDefault(); setShowInfo(!showInfo); }} 
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                    aria-label="Why am I seeing this ad?"
                >
                    <Info size={10} />
                </button>

                {showInfo && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-gray-900 border border-white/10 rounded-lg shadow-2xl z-20 text-[10px] text-gray-300 text-left cursor-default">
                        <p className="font-semibold text-white mb-1.5 text-xs">Why am I seeing this?</p>
                        <p className="leading-relaxed">This asset is served natively by NoteStandard. It was organically retrieved based on community context {currentTags.length > 0 ? <span className="font-mono text-primary/80">({currentTags.join(', ')})</span> : '(General)'}.</p>
                        <p className="mt-1.5">No personal cookies were used and your data was strictly **not** shared with third parties.</p>
                        <button onClick={(e) => { e.preventDefault(); setShowInfo(false); }} className="mt-2 text-primary hover:text-primary/80 font-medium">Understood</button>
                    </div>
                )}
            </div>
        </div>
    );
};
