import React, { useState, useEffect } from 'react';
import { 
  X, CheckCircle, ShieldCheck, MapPin, Globe, Calendar, 
  UserPlus, UserCheck, MessageCircle, Share2, Sparkles, 
  Grid, FileText, Heart, MessageSquare, Loader2, ArrowLeft 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axiosInstance';
import SecureImage from '../common/SecureImage';
import { useAuth } from '../../context/AuthContext';

export interface PublicProfile {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  cover_url?: string;
  bio?: string;
  website?: string;
  country_code?: string;
  is_verified?: boolean;
  kyc_level?: string;
  created_at?: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
}

export interface PublicPost {
  id: string;
  author_id: string;
  content: string;
  media_url?: string;
  created_at: string;
  likes_count: number;
  comments_count: number;
  is_liked?: boolean;
  profiles?: {
    id: string;
    username: string;
    full_name?: string;
    avatar_url?: string;
    is_verified?: boolean;
  };
}

interface PublicProfileModalProps {
  userId?: string;
  username?: string;
  onClose?: () => void;
  isPage?: boolean;
}

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({
  userId,
  username,
  onClose,
  isPage = false,
}) => {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'about'>('posts');

  const isSelf = currentUser?.id === profile?.id;

  useEffect(() => {
    let isMounted = true;
    const fetchProfileData = async () => {
      setLoading(true);
      try {
        const endpoint = username 
          ? `/community/profile/username/${username}` 
          : `/community/profile/${userId}`;
        
        const res = await api.get(endpoint);
        if (isMounted && res.data) {
          setProfile(res.data.profile);
          setPosts(res.data.posts || []);
          setIsFollowing(res.data.isFollowing || false);
        }
      } catch (err: any) {
        console.error('Failed to load profile:', err);
        if (isMounted) toast.error('Could not load user profile');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (userId || username) {
      fetchProfileData();
    }
    return () => { isMounted = false; };
  }, [userId, username]);

  const handleToggleFollow = async () => {
    if (!profile || isSelf || followLoading) return;
    setFollowLoading(true);
    const prevFollowing = isFollowing;
    const prevCount = profile.followers_count;

    // Optimistic UI update
    setIsFollowing(!prevFollowing);
    setProfile({
      ...profile,
      followers_count: !prevFollowing ? prevCount + 1 : Math.max(0, prevCount - 1)
    });

    try {
      const res = await api.post(`/community/profile/${profile.id}/follow`);
      if (res.data) {
        setIsFollowing(res.data.following);
        toast.success(res.data.following ? `Following @${profile.username}` : `Unfollowed @${profile.username}`);
      }
    } catch (err: any) {
      // Rollback
      setIsFollowing(prevFollowing);
      setProfile({ ...profile, followers_count: prevCount });
      toast.error('Action failed');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleDirectMessage = () => {
    if (!profile) return;
    onClose?.();
    navigate(`/dashboard/chat?user=${profile.id}`);
  };

  const handleShareProfile = () => {
    const url = `${window.location.origin}/dashboard/profile/${profile?.id || userId}`;
    navigator.clipboard.writeText(url);
    toast.success('Profile link copied to clipboard!');
  };

  if (loading) {
    return (
      <div className={isPage ? "min-h-screen bg-gray-950 flex items-center justify-center p-6" : "fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"}>
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="animate-spin text-primary" size={36} />
          <p className="text-xs font-semibold text-gray-400">Loading user profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={isPage ? "min-h-screen bg-gray-950 flex items-center justify-center p-6" : "fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"}>
        <div className="bg-gray-900 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center space-y-4 text-white">
          <Sparkles className="mx-auto text-gray-500" size={40} />
          <h3 className="text-lg font-bold">Profile Not Found</h3>
          <p className="text-xs text-gray-400">This user account does not exist or may have been deactivated.</p>
          <button
            onClick={() => isPage ? navigate(-1) : onClose?.()}
            className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold transition-all"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const content = (
    <div className="bg-gray-950 border border-white/10 rounded-3xl overflow-hidden shadow-2xl max-w-2xl w-full text-white animate-in fade-in zoom-in-95 duration-200">
      
      {/* ─── Facebook Style Cover Photo Banner ─── */}
      <div className="relative h-44 sm:h-52 w-full bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-950 overflow-hidden">
        {profile.cover_url ? (
          <SecureImage src={profile.cover_url} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-600/30 via-purple-600/20 to-transparent" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/20 to-transparent" />

        {/* Top Controls */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          {isPage ? (
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all"
            >
              <ArrowLeft size={18} />
            </button>
          ) : <div />}
          
          {onClose && !isPage && (
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all ml-auto"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ─── Avatar & Primary Header Row ─── */}
      <div className="px-5 sm:px-8 relative -mt-16 sm:-mt-20 pb-4">
        <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4">
          
          {/* Avatar with Badges */}
          <div className="relative group">
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full ring-4 ring-gray-950 overflow-hidden bg-gray-900 shadow-2xl flex-shrink-0">
              {profile.avatar_url ? (
                <SecureImage src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" fallbackType="profile" />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-3xl font-black text-white">
                  {(profile.full_name || profile.username).charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {/* Online Status Dot */}
            <span className="absolute bottom-2 right-2 w-5 h-5 rounded-full bg-emerald-500 ring-4 ring-gray-950 shadow-md" title="Online" />
          </div>

          {/* Action Buttons (Facebook & Instagram Style) */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-center">
            {!isSelf ? (
              <>
                <button
                  onClick={handleToggleFollow}
                  disabled={followLoading}
                  className={`flex-1 sm:flex-none px-6 py-2.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 cursor-pointer ${
                    isFollowing
                      ? "bg-white/10 hover:bg-white/15 text-white border border-white/15"
                      : "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-blue-500/25"
                  }`}
                >
                  {followLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : isFollowing ? (
                    <>
                      <UserCheck size={16} className="text-emerald-400" />
                      <span>Following</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={16} />
                      <span>Follow</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDirectMessage}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer"
                >
                  <MessageCircle size={16} />
                  <span>Message</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  onClose?.();
                  navigate('/dashboard/settings');
                }}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-2xl font-bold text-xs sm:text-sm transition-all border border-white/10"
              >
                Edit Profile
              </button>
            )}

            <button
              onClick={handleShareProfile}
              className="p-2.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-2xl border border-white/10 transition-all active:scale-95"
              title="Share Profile"
            >
              <Share2 size={18} />
            </button>
          </div>
        </div>

        {/* User Info Header */}
        <div className="mt-4 text-center sm:text-left space-y-1">
          <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {profile.full_name || profile.username}
            </h1>
            {profile.is_verified && (
              <span className="text-blue-400" title="Verified Account">
                <CheckCircle size={18} className="fill-blue-500/20" />
              </span>
            )}
            {profile.kyc_level === 'tier1' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-400" title="Tier 1 Verified">
                <ShieldCheck size={12} />
                Tier 1
              </span>
            )}
          </div>
          <p className="text-xs font-semibold text-gray-400">@{profile.username}</p>

          {profile.bio && (
            <p className="text-xs text-gray-300 pt-1 leading-relaxed max-w-lg mx-auto sm:mx-0">
              {profile.bio}
            </p>
          )}

          {/* Social Metadata Badges */}
          <div className="flex items-center justify-center sm:justify-start gap-4 text-[11px] text-gray-400 pt-2 flex-wrap">
            {profile.country_code && (
              <span className="flex items-center gap-1">
                <MapPin size={13} className="text-gray-500" />
                {profile.country_code}
              </span>
            )}
            {profile.website && (
              <a
                href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-blue-400 hover:underline"
              >
                <Globe size={13} />
                {profile.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {profile.created_at && (
              <span className="flex items-center gap-1 text-gray-500">
                <Calendar size={13} />
                Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        {/* ─── Instagram Style Counter Bar ─── */}
        <div className="grid grid-cols-3 gap-2 mt-6 py-3 px-4 rounded-2xl bg-gray-900/60 border border-white/5 text-center">
          <div>
            <div className="text-base sm:text-lg font-black text-white">{profile.posts_count || posts.length}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Posts</div>
          </div>
          <div>
            <div className="text-base sm:text-lg font-black text-white">{profile.followers_count}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Followers</div>
          </div>
          <div>
            <div className="text-base sm:text-lg font-black text-white">{profile.following_count}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Following</div>
          </div>
        </div>

        {/* ─── Profile Navigation Tabs ─── */}
        <div className="flex border-b border-white/10 mt-6">
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'posts'
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <Grid size={15} />
            <span>Posts & Notes</span>
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'about'
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <FileText size={15} />
            <span>About</span>
          </button>
        </div>

        {/* ─── Tab Content ─── */}
        <div className="pt-4 pb-2">
          {activeTab === 'posts' && (
            <div className="space-y-3">
              {posts.length === 0 ? (
                <div className="text-center py-10 space-y-2 text-gray-500">
                  <Grid className="mx-auto opacity-30" size={32} />
                  <p className="text-xs font-medium">No public posts or shared notes yet.</p>
                </div>
              ) : (
                posts.map((post) => (
                  <div key={post.id} className="p-4 rounded-2xl bg-gray-900/50 border border-white/5 hover:border-white/10 transition-all space-y-2">
                    <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                    {post.media_url && (
                      <div className="rounded-xl overflow-hidden max-h-60 mt-2">
                        <SecureImage src={post.media_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-white/5">
                      <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
                        <Heart size={14} className={post.is_liked ? "fill-rose-500" : ""} />
                        {post.likes_count || 0}
                      </span>
                      <span className="flex items-center gap-1.5 text-blue-400 font-semibold">
                        <MessageSquare size={14} />
                        {post.comments_count || 0}
                      </span>
                      <span className="ml-auto text-[10px] text-gray-600">
                        {new Date(post.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'about' && (
            <div className="p-4 rounded-2xl bg-gray-900/50 border border-white/5 space-y-4 text-xs">
              <div>
                <h4 className="font-bold text-gray-400 uppercase tracking-wider text-[10px] mb-1">Account Info</h4>
                <div className="space-y-1.5 text-gray-300">
                  <p><strong className="text-white">Username:</strong> @{profile.username}</p>
                  <p><strong className="text-white">Status:</strong> {profile.kyc_level === 'tier1' ? 'Tier 1 Verified User' : 'Standard Member'}</p>
                  <p><strong className="text-white">Account ID:</strong> <code className="text-[10px] font-mono bg-black/40 px-1.5 py-0.5 rounded text-gray-400">{profile.id}</code></p>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );

  if (isPage) {
    return (
      <div className="min-h-screen bg-gray-950 p-4 sm:p-6 flex justify-center">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {content}
    </div>
  );
};
