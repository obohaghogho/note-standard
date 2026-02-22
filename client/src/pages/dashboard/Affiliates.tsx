import { useState, useEffect } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { 
  Users, 
  Copy, 
  Share2, 
  TrendingUp, 
  DollarSign, 
  Award,
  ArrowRight,
  ExternalLink,
  Info
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../lib/api';

interface Referral {
  id: string;
  created_at: string;
  total_commission_earned: number;
  referred: {
    username: string;
    email: string;
  };
}

export const Affiliates = () => {
  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState({
    totalEarned: 0,
    totalReferrals: 0,
    commissionRate: 5
  });
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time updates for affiliate referrals
    const channel = supabase
      .channel('affiliate_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'affiliate_referrals',
          filter: `referrer_user_id=eq.${user?.id}`
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const fetchData = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      setUser(authUser);

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      
      const response = await fetch(`${API_URL}/api/wallet/affiliates/my-stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setReferrals(data.referrals || []);
        
        const total = (data.referrals || []).reduce((sum: number, r: Referral) => sum + (r.total_commission_earned || 0), 0);
        setStats({
          totalEarned: total,
          totalReferrals: data.referrals?.length || 0,
          commissionRate: data.commissionRate || 5
        });
      }
    } catch (err) {
      console.error('Error fetching affiliate data:', err);
    } finally {
      setLoading(false);
    }
  };

  const referralLink = `${import.meta.env.VITE_CLIENT_URL || window.origin}/signup?ref=${user?.id}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success('Referral link copied to clipboard!');
  };

  return (
    <div className="space-y-8 pb-12 w-full min-w-0">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-purple-700 to-pink-600 p-6 sm:p-10 md:p-16 shadow-2xl">
        {/* Floating Background Graphics for Mobile */}
        <div className="absolute inset-0 opacity-10 md:hidden pointer-events-none overflow-hidden">
          <Award className="absolute -top-10 -right-10 w-48 h-48 rotate-12" />
          <TrendingUp className="absolute -bottom-10 -left-10 w-48 h-48 -rotate-12" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="max-w-2xl text-center md:text-left">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight leading-tight break-words">
              Grow with <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500">Note Standard</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-indigo-50 mb-10 leading-relaxed max-w-lg mx-auto md:mx-0 break-words">
              Join our partner program and earn <span className="font-bold text-white border-b-2 border-yellow-400/50">{stats.commissionRate}% commission</span> on every transaction from users you refer.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto md:mx-0">
              <div className="flex-1 flex items-center bg-white/10 backdrop-blur-lg border border-white/20 rounded-[20px] p-2 pl-5 min-w-0 shadow-inner group">
                <span className="text-sm font-medium text-white break-all flex-1 py-2">{referralLink}</span>
                <button 
                  onClick={copyToClipboard}
                  className="bg-white text-indigo-600 p-3.5 rounded-2xl hover:bg-indigo-50 transition-all shadow-xl flex-shrink-0 active:scale-95 group-hover:shadow-indigo-500/20"
                >
                  <Copy size={18} />
                </button>
              </div>
              <Button 
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: 'Join Note Standard',
                      text: 'Join the most advanced note-taking & crypto dashboard.',
                      url: referralLink
                    });
                  } else {
                    copyToClipboard();
                  }
                }}
                className="bg-white/20 hover:bg-white/30 border-none backdrop-blur-md text-white px-8 py-6 rounded-[20px] h-auto w-full sm:w-auto font-bold text-lg"
              >
                <Share2 size={20} className="mr-2" /> Share Link
              </Button>
            </div>
          </div>
          
          <div className="hidden md:block">
            <div className="relative h-64 w-64 xl:h-72 xl:w-72">
              <div className="absolute inset-0 bg-white/10 rounded-full animate-ping"></div>
              <div className="absolute inset-4 bg-white/20 rounded-full animate-pulse"></div>
              <div className="absolute inset-8 bg-white/30 rounded-full flex items-center justify-center shadow-2xl">
                <Award className="text-white w-20 h-20 xl:w-24 xl:h-24" />
              </div>
            </div>
          </div>
        </div>

        {/* Decorative elements - restrained for mobile */}
        <div className="absolute top-0 right-0 -mr-12 -mt-12 sm:-mr-20 sm:-mt-20 h-48 w-48 sm:h-64 sm:w-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-12 -mb-12 sm:-ml-20 sm:-mb-20 h-48 w-48 sm:h-64 sm:w-64 rounded-full bg-indigo-500/20 blur-3xl"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-4 sm:p-6 border-white/5 bg-white/5 backdrop-blur-sm relative group overflow-hidden min-w-0">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <DollarSign size={48} className="text-green-400" />
          </div>
          <p className="text-sm text-gray-400 mb-1">Total Earned</p>
          <h3 className="text-3xl font-bold text-white mb-2">
            ${stats.totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <div className="flex items-center text-xs text-green-400 font-medium">
            <TrendingUp size={14} className="mr-1" /> Passive Income
          </div>
        </Card>

        <Card className="p-4 sm:p-6 border-white/5 bg-white/5 backdrop-blur-sm relative group overflow-hidden min-w-0">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Users size={48} className="text-blue-400" />
          </div>
          <p className="text-sm text-gray-400 mb-1">Total Referrals</p>
          <h3 className="text-3xl font-bold text-white mb-2">{stats.totalReferrals}</h3>
          <div className="flex items-center text-xs text-blue-400 font-medium">
            <Users size={14} className="mr-1" /> Active Network
          </div>
        </Card>

        <Card className="p-4 sm:p-6 border-white/5 bg-white/5 backdrop-blur-sm relative group overflow-hidden min-w-0">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={48} className="text-purple-400" />
          </div>
          <p className="text-sm text-gray-400 mb-1">Commission Rate</p>
          <h3 className="text-3xl font-bold text-white mb-2">{stats.commissionRate}%</h3>
          <div className="flex items-center text-xs text-purple-400 font-medium">
            <Award size={14} className="mr-1" /> Lifetime Earnings
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <h2 className="text-2xl font-bold text-white">Your Referrals</h2>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-indigo-400 hover:text-indigo-300"
              onClick={fetchData}
            >
              Refresh <TrendingUp size={16} className="ml-1" />
            </Button>
          </div>

          <Card className="border-white/5 bg-white/5 backdrop-blur-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-400">Loading your network...</div>
            ) : referrals.length === 0 ? (
              <div className="p-12 text-center">
                <div className="bg-white/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users size={32} className="text-gray-500" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No referrals yet</h3>
                <p className="text-gray-400 max-w-sm mx-auto mb-6">
                  Share your link to start building your network and earning commissions.
                </p>
                <Button onClick={copyToClipboard} variant="secondary">Copy Referral Link</Button>
              </div>
            ) : (
            <>
              <div className="block sm:hidden divide-y divide-white/5">
                  {referrals?.map((referral) => (
                      <div key={referral.id} className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                  <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white mr-3 text-xs">
                                      {referral.referred?.username?.charAt(0).toUpperCase() || 'U'}
                                  </div>
                                  <div className="text-sm font-medium text-white">{referral.referred?.username}</div>
                              </div>
                              <div className="text-sm font-semibold text-white">
                                  ${referral.total_commission_earned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                          </div>
                          <div className="flex justify-between text-xs text-gray-500">
                              <span>{referral.referred?.email}</span>
                              <span>{new Date(referral.created_at).toLocaleDateString()}</span>
                          </div>
                      </div>
                  ))}
              </div>
              
              <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/5">
                        <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-widest">User</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-widest">Joined Date</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-widest text-right">Earnings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {referrals?.map((referral) => (
                        <tr key={referral.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white mr-3">
                                {referral.referred?.username?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div>
                                  <div className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors">
                                      {referral.referred?.username}
                                  </div>
                                  <div className="text-xs text-gray-500">{referral.referred?.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-400">
                            {new Date(referral.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-white text-right">
                            ${referral.total_commission_earned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-white">How it works</h2>
          <Card className="p-4 sm:p-6 border-white/5 bg-white/5 backdrop-blur-sm space-y-6 min-w-0">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/20">
                1
              </div>
              <div>
                <h4 className="font-semibold text-white mb-1">Invite Friends</h4>
                <p className="text-sm text-gray-400">Share your unique referral link via social media, email or text.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold border border-purple-500/20">
                2
              </div>
              <div>
                <h4 className="font-semibold text-white mb-1">They Trade</h4>
                <p className="text-sm text-gray-400">Whenever they buy, sell or swap crypto, the platform collects a small spread.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-400 font-bold border border-pink-500/20">
                3
              </div>
              <div>
                <h4 className="font-semibold text-white mb-1">You Earn</h4>
                <p className="text-sm text-gray-400">You instantly receive {stats.commissionRate}% of that spread fee directly into your wallet.</p>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex gap-3">
                <Info size={18} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-400 leading-relaxed">
                  Commissions are paid in real-time. There is no limit to how many people you can refer or how much you can earn.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-6 bg-gradient-to-br from-indigo-900/40 to-black border-indigo-500/20 min-w-0">
            <h4 className="font-bold text-white mb-3 flex items-center gap-2">
              <ExternalLink size={18} className="text-indigo-400" />
              Affiliate Assets
            </h4>
            <p className="text-sm text-gray-400 mb-4">
                Download high-quality banners, logos, and promotional videos to help you share Note Standard.
            </p>
            <Button variant="secondary" fullWidth className="gap-2">
                Download Toolkit <ArrowRight size={16} />
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};
