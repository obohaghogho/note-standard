import React, { useState, useEffect } from 'react';
import { X, Loader2, ArrowLeft, UserPlus, UserCheck, MessageCircle, Share2, Sparkles, TrendingUp, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseSafe';

// New Subcomponents
import { ProfileHeader } from './ProfileHeader';
import { ProfileStats } from './ProfileStats';
import { ProfileTabs, ProfileTab } from './ProfileTabs';
import { ProfileEmptyStates } from './ProfileEmptyStates';
import { ProfilePostCard } from './ProfilePostCard';
import { FeaturedNote } from './FeaturedNote';

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
  
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [featuredNote, setFeaturedNote] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [isFetchingTab, setIsFetchingTab] = useState(false);

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

  // Fetch Featured Note
  useEffect(() => {
    const fetchFeatured = async () => {
      if (!profile) return;
      const { data } = await supabase
        .from('notes')
        .select('*')
        .eq('owner_id', profile.id)
        .eq('is_pinned', true)
        .limit(1)
        .maybeSingle();
      
      if (data) setFeaturedNote(data);
    };
    fetchFeatured();
  }, [profile?.id]);

  // Handle Tab fetching
  useEffect(() => {
    if (!profile || activeTab === 'posts' || activeTab === 'about') return;
    
    const fetchTabData = async () => {
      setIsFetchingTab(true);
      try {
        if (activeTab === 'notes' && isSelf) {
          const { data } = await supabase
            .from('notes')
            .select('*')
            .eq('owner_id', profile.id)
            .order('created_at', { ascending: false });
          setNotes(data || []);
        }
        // Additional tab fetching can go here (media, likes, bookmarks)
      } catch (e) {
        console.error(e);
      } finally {
        setIsFetchingTab(false);
      }
    };
    
    fetchTabData();
  }, [activeTab, profile?.id, isSelf]);

  const handleToggleFollow = async () => {
    if (!profile || isSelf || followLoading) return;
    setFollowLoading(true);
    const prevFollowing = isFollowing;
    const prevCount = profile.followers_count;

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

  if (loading) {
    return (
      <div className={isPage ? "min-h-screen bg-gray-950 flex items-center justify-center p-6" : "fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"}>
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="animate-spin text-primary" size={36} />
          <p className="text-xs font-semibold text-gray-400">Loading profile...</p>
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
          <button onClick={() => isPage ? navigate(-1) : onClose?.()} className="w-full py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl text-xs font-bold transition-all">Go Back</button>
        </div>
      </div>
    );
  }

  const completionPercentage = isSelf ? (
    [profile.avatar_url, profile.cover_url, profile.bio, profile.website, profile.country_code].filter(Boolean).length / 5 * 100
  ) : 100;

  const MainContent = (
    <div className="flex flex-col w-full bg-gray-950 border border-white/10 sm:rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
      
      {/* Top Navigation for Mobile / Page */}
      <div className="flex items-center justify-between absolute top-4 left-4 right-4 z-20">
        {isPage && (
          <button onClick={() => navigate(-1)} className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all">
            <ArrowLeft size={18} />
          </button>
        )}
        {!isPage && onClose && (
          <button onClick={onClose} className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all ml-auto">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Embedded Header (visible on mobile/modal, hidden on desktop if isPage) */}
      <div className={isPage ? "block lg:hidden" : "block"}>
        <ProfileHeader profile={profile} isOwner={isSelf} completionPercentage={completionPercentage} />
      </div>

      <div className="px-4 py-4 sm:px-8 sm:py-6 border-b border-white/10 bg-gray-950 flex flex-col sm:flex-row items-center justify-between gap-4">
        <ProfileStats 
          postsCount={profile.posts_count} 
          followersCount={profile.followers_count} 
          followingCount={profile.following_count} 
          notesCount={notes.length} 
        />
        
        {/* Action Buttons */}
        <div className="flex w-full sm:w-auto gap-2">
          {!isSelf ? (
            <>
              <button
                onClick={handleToggleFollow}
                disabled={followLoading}
                className={`flex-1 sm:flex-none px-6 py-2.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${
                  isFollowing ? "bg-white/10 text-white" : "bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                }`}
              >
                {followLoading ? <Loader2 size={16} className="animate-spin" /> : isFollowing ? <><UserCheck size={16} /> Following</> : <><UserPlus size={16} /> Follow</>}
              </button>
              <button onClick={handleDirectMessage} className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all"><MessageCircle size={18} /></button>
            </>
          ) : (
            <button onClick={() => navigate('/dashboard/settings')} className="flex-1 sm:flex-none px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl text-white font-bold transition-all border border-white/10">Edit Profile</button>
          )}
          <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied!'); }} className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all"><Share2 size={18} /></button>
        </div>
      </div>

      <ProfileTabs activeTab={activeTab} setActiveTab={setActiveTab} isOwner={isSelf} profileId={profile.id} />

      <div className="min-h-[400px] bg-gray-950 pb-20 sm:pb-0">
        {isFetchingTab ? (
          <div className="flex justify-center p-10"><Loader2 className="animate-spin text-gray-500" size={30} /></div>
        ) : (
          <>
            {activeTab === 'posts' && (
              <div className="flex flex-col">
                <FeaturedNote note={featuredNote} onClick={() => {}} />
                {posts.length === 0 ? (
                  <ProfileEmptyStates type="posts" isOwner={isSelf} />
                ) : (
                  posts.map(post => (
                    <ProfilePostCard 
                      key={post.id} 
                      post={post} 
                      onClick={() => navigate(`/dashboard/post/${post.id}`)}
                      onLike={() => {}} 
                      onComment={() => navigate(`/dashboard/post/${post.id}`)} 
                    />
                  ))
                )}
              </div>
            )}
            
            {activeTab === 'notes' && (
              <div className="p-4 flex flex-col gap-4">
                {notes.length === 0 ? (
                  <ProfileEmptyStates type="notes" isOwner={isSelf} />
                ) : (
                  notes.map(note => (
                    <div key={note.id} className="p-4 bg-gray-900 rounded-xl border border-white/5 text-white">
                      <h4 className="font-bold">{note.title || 'Untitled Note'}</h4>
                      <p className="text-sm text-gray-400 mt-1 line-clamp-2">{note.content ? note.content.replace(/<[^>]*>?/gm, '') : ''}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'media' && <ProfileEmptyStates type="media" isOwner={isSelf} />}
            {activeTab === 'likes' && <ProfileEmptyStates type="likes" isOwner={isSelf} />}
            {activeTab === 'bookmarks' && <ProfileEmptyStates type="bookmarks" isOwner={isSelf} />}
            {activeTab === 'about' && (
              <div className="p-6 text-gray-300">
                <h3 className="text-lg font-bold text-white mb-4">About {profile.full_name || profile.username}</h3>
                <p className="mb-6 leading-relaxed bg-gray-900 p-4 rounded-xl border border-white/5">{profile.bio || "This user hasn't added a bio yet."}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (isPage) {
    return (
      <div className="min-h-screen bg-black pt-4 pb-20 sm:p-4 md:p-6 lg:p-8 overflow-x-hidden">
        <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-6 relative">
          
          {/* Left Column (Desktop Profile Header) */}
          <div className="hidden lg:flex flex-col w-[350px] sticky top-8 h-fit shadow-2xl rounded-3xl overflow-hidden">
            <ProfileHeader profile={profile} isOwner={isSelf} completionPercentage={completionPercentage} />
          </div>

          {/* Middle Column (Feed) */}
          <div className="flex-1 w-full max-w-3xl mx-auto">
            {MainContent}
          </div>

          {/* Right Column (Suggestions / Trending) */}
          <div className="hidden xl:flex flex-col w-[320px] sticky top-8 h-fit gap-4">
            <div className="bg-gray-950 border border-white/10 rounded-3xl p-5 shadow-2xl">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-indigo-400" /> Trending Notes</h3>
              <p className="text-xs text-gray-500">Discover what's popular in the community right now.</p>
              <div className="mt-4 flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3 items-center group cursor-pointer">
                    <div className="w-10 h-10 rounded-xl bg-gray-900 border border-white/5 flex items-center justify-center text-gray-400 group-hover:bg-indigo-900/20 group-hover:text-indigo-400 transition-colors">#{i}</div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">Amazing Setup</h4>
                      <p className="text-xs text-gray-500">1.2k views</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-gray-950 border border-white/10 rounded-3xl p-5 shadow-2xl">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Users size={18} className="text-emerald-400" /> Suggested Users</h3>
              <div className="flex flex-col gap-4 mt-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-800"></div>
                      <div className="text-sm text-gray-300">Creator {i}</div>
                    </div>
                    <button className="text-xs text-indigo-400 font-bold hover:text-indigo-300">Follow</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Modal Render
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl min-h-screen sm:min-h-0 sm:max-h-[90vh] overflow-y-auto overflow-x-hidden scrollbar-hide">
        {MainContent}
      </div>
    </div>
  );
};
