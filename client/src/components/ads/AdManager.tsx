import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adService, type Ad } from '../../services/ads';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Input } from '../common/Input';
import SecureImage from '../common/SecureImage';
import { Loader2, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Status Badge Component
const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
        case 'approved':
            return <div className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded"><CheckCircle size={12} /> Live</div>;
        case 'pending':
            return <div className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded"><Clock size={12} /> In Review</div>;
        case 'pending_payment':
            return <div className="flex items-center gap-1 text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded"><Clock size={12} /> Unpaid</div>;
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
        tags: '' // Added plain text tags input
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isPro) fetchMyAds();
        else setLoading(false);
    }, [isPro]);

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

    const handlePayment = async (adId: string) => {
        try {
            toast.loading('Redirecting to payment...');
            const { url } = await adService.createAdCheckoutSession(adId);
            window.location.href = url;
        } catch (error: any) {
            toast.dismiss();
            toast.error(error.message || 'Payment initiation failed');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            // 1. Create Ad
            const tagsArray = formData.tags.split(',').map(t => t.trim()).filter(Boolean);
            const result = await adService.createAd({
                ...formData,
                tags: tagsArray
            });

            // 2. Redirect to Payment
            await handlePayment(result.id);

        } catch (error: any) {
            toast.error(error.message || 'Failed to create ad');
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

                        <div className="flex gap-3 pt-2 flex-wrap">
                            <Button type="submit" loading={submitting}>Submit & Pay $5.00</Button>
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

                            <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
                                <span className="text-xs text-gray-500">
                                    {new Date(ad.created_at).toLocaleDateString()}
                                </span>

                                {ad.status === 'pending_payment' && (
                                    <Button
                                        size="sm"
                                        className="h-7 text-xs bg-orange-500 hover:bg-orange-600 border-orange-400"
                                        onClick={() => handlePayment(ad.id)}
                                    >
                                        Pay Now to Activate
                                    </Button>
                                )}
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
