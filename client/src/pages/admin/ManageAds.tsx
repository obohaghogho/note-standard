import { useState, useEffect } from 'react';
import { adService, type Ad } from '../../services/ads';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Check, X, ExternalLink, Loader2, Megaphone } from 'lucide-react';
import { toast } from 'react-hot-toast';
import SecureImage from '../../components/common/SecureImage';

export const ManageAds = () => {
    const [ads, setAds] = useState<Ad[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending');

    useEffect(() => {
        fetchAds();
    }, [activeTab]);

    const fetchAds = async () => {
        setLoading(true);
        try {
            const status = activeTab === 'all' ? undefined : activeTab;
            const data = await adService.getAdminAds(status);
            setAds(data);
        } catch (error) {
            console.error('Failed to fetch ads:', error);
            toast.error('Failed to load ads');
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (id: string, action: 'approved' | 'rejected') => {
        try {
            await adService.updateAdStatus(id, action);
            toast.success(`Ad ${action} successfully`);

            // Optimistic update
            setAds(ads.filter(ad => ad.id !== id));
        } catch (error) {
            console.error(error);
            toast.error('Failed to update status');
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'approved': return 'text-green-400 border-green-400/20 bg-green-400/10';
            case 'rejected': return 'text-red-400 border-red-400/20 bg-red-400/10';
            case 'pending': return 'text-yellow-400 border-yellow-400/20 bg-yellow-400/10';
            default: return 'text-gray-400 border-gray-400/20 bg-gray-400/10';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Megaphone className="text-primary" />
                        Ad Moderation
                    </h1>
                    <p className="text-gray-400">Review and manage user-created advertisements</p>
                </div>

                <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'pending' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Pending Review
                    </button>
                    <button
                        onClick={() => setActiveTab('approved')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'approved' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Live Ads
                    </button>
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'all' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        All History
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-primary" size={32} />
                </div>
            ) : (
                <div className="grid gap-6">
                    {ads.length === 0 ? (
                        <div className="text-center py-20 text-gray-500">
                            <Megaphone size={48} className="mx-auto mb-4 opacity-20" />
                            <p>No advertisements found in this category.</p>
                        </div>
                    ) : (
                        ads.map((ad: any) => (
                            <Card key={ad.id} variant="glass" className="p-6">
                                <div className="flex flex-col md:flex-row gap-6">
                                    {/* Image Preview */}
                                    <div className="w-full md:w-48 h-32 bg-black/40 rounded-lg flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                                        {ad.image_url ? (
                                            <SecureImage src={ad.image_url} alt="Ad Preview" className="w-full h-full object-cover" fallbackType="card" />
                                        ) : (
                                            <span className="text-xs text-gray-500">No Image</span>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 space-y-3">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h3 className="text-lg font-bold">{ad.title}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-xs px-2 py-0.5 rounded border ${getStatusColor(ad.status)} capitalize`}>
                                                        {ad.status}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        by {ad.profiles?.full_name || ad.profiles?.email || 'Unknown User'}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        • {new Date(ad.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            {ad.status === 'pending' && (
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        className="bg-green-500/20 text-green-400 hover:bg-green-500/30 border-green-500/50"
                                                        onClick={() => handleAction(ad.id, 'approved')}
                                                    >
                                                        <Check size={16} className="mr-1" /> Approve
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/50"
                                                        onClick={() => handleAction(ad.id, 'rejected')}
                                                    >
                                                        <X size={16} className="mr-1" /> Reject
                                                    </Button>
                                                </div>
                                            )}
                                            {ad.status === 'approved' && (
                                                <Button
                                                    size="sm"
                                                    className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/50"
                                                    onClick={() => handleAction(ad.id, 'rejected')}
                                                >
                                                    Revoke
                                                </Button>
                                            )}
                                        </div>

                                        <p className="text-gray-300">{ad.content}</p>

                                        {ad.link_url && (
                                            <a
                                                href={ad.link_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-primary hover:text-primary/80 text-sm"
                                            >
                                                <ExternalLink size={14} /> {ad.link_url}
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
