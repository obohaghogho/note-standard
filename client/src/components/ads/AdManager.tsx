import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adService, type Ad, type AuctionIntel } from '../../services/ads';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Input } from '../common/Input';
import SecureImage from '../common/SecureImage';
import { Loader2, Plus, CheckCircle, XCircle, Clock, Wallet, TrendingUp, AlertCircle, DollarSign } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabaseSafe';

// Status Badge Component
const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
        case 'approved':
            return <div className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded"><CheckCircle size={12} /> Live</div>;
        case 'pending':
            return <div className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded"><Clock size={12} /> In Review</div>;
        case 'pending_activation':
            return <div className="flex items-center gap-1 text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded"><Clock size={12} /> Pending Activation</div>;
        case 'rejected':
            return <div className="flex items-center gap-1 text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded"><XCircle size={12} /> Rejected</div>;
        default:
            return <span className="text-xs text-gray-400 capitalize">{status}</span>;
    }
};

export const AdManager = () => {
    const { isPro } = useAuth();
    const [ads, setAds] = useState<Ad[]>([]);
    const [loading, setLoading] = useState(true);
    const [createMode, setCreateMode] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        image_url: '',
        link_url: '',
        tags: '',
        max_views: '',
        max_clicks: '',
        end_date: '',
        cpc_bid: '0.05',
        tier: 'basic' as 'basic' | 'boost' | 'premium'
    });
    const [submitting, setSubmitting] = useState(false);
    
    // V5: Market & Wallet Intel
    const [intel, setIntel] = useState<AuctionIntel>({
        medianCpc: 0.05,
        topCpc: 0.10,
        totalBidders: 0,
        recommendedBid: 0.07,
        marketTrend: 'open',
        pricingTiers: {
            basic:   { minBid: 0.01, maxBid: 0.10, boostMultiplier: 3 },
            boost:   { minBid: 0.05, maxBid: 0.50, boostMultiplier: 4 },
            premium: { minBid: 0.10, maxBid: 5.00, boostMultiplier: 5 },
        },
    });
    const [walletBalance, setWalletBalance] = useState(0);
    const [topUpAmount, setTopUpAmount] = useState('10');
    const [showTopUp, setShowTopUp] = useState(false);

    useEffect(() => {
        if (isPro) {
            fetchMyAds();
            fetchAuctionData();
            fetchWallet();
        } else {
            setLoading(false);
        }
    }, [isPro]);

    const fetchAuctionData = async () => {
        try {
            const data = await adService.getAuctionIntel();
            setIntel(data);
        } catch {
            // Fail silently - auction data is non-critical for core functionality
        }
    };

    const fetchWallet = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', session.user.id).single();
        if (data) setWalletBalance(Number(data.ad_wallet_balance || 0));
    };

    const handleTopUp = async () => {
        try {
            const amount = parseFloat(topUpAmount);
            if (isNaN(amount) || amount < 5) return toast.error('Minimum deposit is $5.00');
            toast.loading('Redirecting to secure gateway...');
            const { url } = await adService.createWalletTopupSession(amount);
            window.location.href = url;
        } catch (error: unknown) {
            toast.dismiss();
            toast.error((error as Error).message || 'Payment initiation failed');
        }
    };

    const fetchMyAds = async () => {
        try {
            const data = await adService.getMyAds();
            setAds(data);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load your ads');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const tagsArray = formData.tags.split(',').map(t => t.trim()).filter(Boolean);
            const cpc = parseFloat(formData.cpc_bid);
            if (isNaN(cpc) || cpc < 0.01) {
                setSubmitting(false);
                return toast.error("CPC Bid must be at least $0.01");
            }

            const adPayload = {
                ...formData,
                max_views: formData.max_views ? parseInt(formData.max_views) : undefined,
                max_clicks: formData.max_clicks ? parseInt(formData.max_clicks) : undefined,
                cpc_bid: cpc,
                tier: formData.tier,  // Pass tier for advertiser_value resolution
                end_date: formData.end_date || undefined,
                tags: tagsArray
            };
            await adService.createAd(adPayload);

            toast.success("Ad created successfully!");
            setCreateMode(false);
            fetchMyAds();
        } catch (error: unknown) {
            toast.error((error as Error).message || 'Failed to create ad');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isPro) {
        return (
            <EmptyState
                title="Promote Your Content"
                description="Upgrade to Pro to create advertisements visible to the entire community. Showcase your projects, social profiles, or services."
                action={{
                    label: "Upgrade to Pro",
                    onClick: () => window.location.href = '/dashboard/billing'
                }}
            />
        );
    }

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h3 className="text-lg font-semibold">Your Advertisements</h3>
                    <p className="text-xs text-gray-400">Manage your promoted content</p>
                </div>
                {!createMode && (
                    <Button size="sm" onClick={() => setCreateMode(true)} className="gap-2">
                        <Plus size={16} />
                        New Ad
                    </Button>
                )}
            </div>

            {/* V5 Auction Dashboard & Wallet */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card variant="glass" className="p-5 flex flex-col justify-between border-primary/20">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2 text-primary font-semibold">
                            <Wallet size={18} /> Advertiser Wallet
                        </div>
                        <span className="text-2xl font-bold font-mono">${walletBalance.toFixed(2)}</span>
                    </div>
                    {walletBalance <= 0 && <p className="text-xs text-red-400 mb-3 flex items-center gap-1"><AlertCircle size={12}/> Balance exhausted. Ads paused.</p>}
                    
                    {showTopUp ? (
                        <div className="flex items-center gap-2">
                            <Input 
                                type="number" 
                                min="5" 
                                value={topUpAmount} 
                                onChange={e => setTopUpAmount(e.target.value)} 
                                className="h-9 w-24"
                            />
                            <Button size="sm" onClick={handleTopUp}>Deposit</Button>
                            <Button size="sm" variant="ghost" onClick={() => setShowTopUp(false)}>Cancel</Button>
                        </div>
                    ) : (
                        <Button size="sm" variant="secondary" onClick={() => setShowTopUp(true)}>Add Funds</Button>
                    )}
                </Card>

                <Card variant="glass" className="p-5 border-blue-500/20">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-blue-400 font-semibold">
                            <TrendingUp size={18} /> Auction Intelligence
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                            intel.marketTrend === 'competitive'
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'bg-green-500/20 text-green-400'
                        }`}>
                            {intel.marketTrend === 'competitive' ? '🔥 Competitive' : '✅ Open'}
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white/5 rounded p-2 text-center">
                            <p className="text-[10px] text-gray-400 uppercase">Median CPC</p>
                            <p className="font-mono text-white text-lg">${intel.medianCpc.toFixed(2)}</p>
                        </div>
                        <div className="bg-blue-500/10 rounded p-2 text-center border border-blue-500/20">
                            <p className="text-[10px] text-blue-400 uppercase">Recommended</p>
                            <p className="font-mono text-blue-300 text-lg">${intel.recommendedBid.toFixed(2)}</p>
                        </div>
                        <div className="bg-white/5 rounded p-2 text-center">
                            <p className="text-[10px] text-gray-400 uppercase">Total Bidders</p>
                            <p className="font-mono text-white text-lg">{intel.totalBidders}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {createMode && (
                <Card variant="glass" className="p-6 border border-primary/20">
                    <h4 className="font-semibold mb-4">Create New Advertisement</h4>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            label="Title"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Ad Headline"
                            required
                        />
                        <div>
                            <label htmlFor="ad-content" className="block text-sm font-medium text-gray-300 mb-1">Content</label>
                            <textarea
                                id="ad-content"
                                name="content"
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[80px]"
                                value={formData.content}
                                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                placeholder="Describe your ad..."
                                required
                            />
                        </div>
                        <Input
                            label="Image URL (Optional)"
                            value={formData.image_url}
                            onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                            placeholder="https://..."
                        />
                        <Input
                            label="Link URL (Optional)"
                            value={formData.link_url}
                            onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                            placeholder="https://..."
                        />
                        <Input
                            label="Target Tags (Comma separated)"
                            value={formData.tags}
                            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                            placeholder="e.g. coding, productivity, design"
                        />
                        
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <Input
                                label="Max Views (Optional Limit)"
                                type="number"
                                min="1"
                                value={formData.max_views}
                                onChange={(e) => setFormData({ ...formData, max_views: e.target.value })}
                                placeholder="e.g. 5000"
                            />
                            <Input
                                label="Max Clicks (Optional Limit)"
                                type="number"
                                min="1"
                                value={formData.max_clicks}
                                onChange={(e) => setFormData({ ...formData, max_clicks: e.target.value })}
                                placeholder="e.g. 100"
                            />
                        </div>
                        <Input
                            label="Campaign Expiry Date (Optional)"
                            type="date"
                            value={formData.end_date}
                            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        />

                        {/* Tier Selector — Patch B UI */}
                        <div className="space-y-2">
                            <p className="block text-sm font-medium text-gray-300">Advertiser Tier</p>
                            <div className="grid grid-cols-3 gap-2">
                                {(['basic', 'boost', 'premium'] as const).map(t => {
                                    const tierData = intel.pricingTiers?.[t];
                                    const isSelected = formData.tier === t;
                                    const tierColors = {
                                        basic:   'border-gray-500/40 hover:border-gray-400',
                                        boost:   'border-blue-500/40 hover:border-blue-400',
                                        premium: 'border-yellow-500/40 hover:border-yellow-400',
                                    };
                                    const selectedColors = {
                                        basic:   'border-gray-400 bg-gray-500/20',
                                        boost:   'border-blue-400 bg-blue-500/20',
                                        premium: 'border-yellow-400 bg-yellow-500/20',
                                    };
                                    return (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, tier: t })}
                                            className={`rounded-lg border p-2.5 text-left transition-all ${
                                                isSelected ? selectedColors[t] : `bg-white/5 ${tierColors[t]}`
                                            }`}
                                        >
                                            <p className="text-xs font-semibold capitalize text-white">{t}</p>
                                            {tierData && (
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    ${tierData.minBid}–${tierData.maxBid} CPC
                                                </p>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-sm font-semibold text-primary flex items-center gap-2"><DollarSign size={16}/> Set CPC Bid (USD)</p>
                                <span className="text-xs text-gray-400">
                                    Recommended: <span className="text-blue-400 font-mono">${intel.recommendedBid.toFixed(2)}</span>
                                </span>
                            </div>
                            <Input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={formData.cpc_bid}
                                onChange={(e) => setFormData({ ...formData, cpc_bid: e.target.value })}
                                placeholder="e.g. 0.15"
                            />
                            <p className="text-[10px] text-gray-400 mt-2">Deducted from your wallet per valid click. Higher bids rank your ad higher in the auction.</p>
                        </div>


                        <div className="flex gap-3 pt-4 flex-wrap">
                            <Button type="submit" loading={submitting}>Deploy Campaign</Button>
                            <Button type="button" variant="secondary" onClick={() => setCreateMode(false)}>Cancel</Button>
                        </div>
                    </form>
                </Card>
            )}

            <div className="grid gap-4">
                {ads?.map((ad) => (
                    <Card key={ad.id} variant="glass" className="p-4 flex gap-4 items-start relative">
                        {ad.image_url && (
							<SecureImage
								src={ad.image_url}
								alt={ad.title}
								className="w-20 h-20 object-cover rounded bg-gray-800"
							/>
						)}
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <h4 className="font-medium truncate pr-20">{ad.title}</h4>
                                <StatusBadge status={ad.status} />
                            </div>
                            <p className="text-sm text-gray-400 mt-1 line-clamp-2">{ad.content}</p>

                            <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
                                <div className="flex items-center gap-3 text-xs font-medium">
                                    <div className="flex flex-col bg-white/5 border border-white/10 px-2.5 py-1 rounded">
                                        <span className="text-gray-400 text-[9px] uppercase tracking-wider">Views</span>
                                        <span className="text-white">{ad.views || 0}</span>
                                    </div>
                                    <div className="flex flex-col bg-white/5 border border-white/10 px-2.5 py-1 rounded">
                                        <span className="text-gray-400 text-[9px] uppercase tracking-wider">Clicks</span>
                                        <span className="text-white">{ad.clicks || 0}</span>
                                    </div>
                                    <div className="flex flex-col bg-primary/10 border border-primary/20 px-2.5 py-1 rounded">
                                        <span className="text-primary/80 text-[9px] uppercase tracking-wider">CTR</span>
                                        <span className="text-primary font-bold">
                                            {ad.views && ad.views > 0 
                                                ? (((ad.clicks || 0) / ad.views) * 100).toFixed(2) + '%' 
                                                : '0.00%'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-500">
                                        {new Date(ad.created_at).toLocaleDateString()}
                                    </span>

                                    {ad.status === 'paused_funds' && (
                                        <span className="text-xs text-red-400 border border-red-400/20 px-2 py-1 rounded bg-red-400/10">
                                            Awaiting Deposit
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}

                {ads.length === 0 && !createMode && (
                    <div className="text-center py-8 text-gray-500">
                        <p>You haven't created any ads yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
