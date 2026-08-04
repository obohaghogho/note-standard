import React, { useState, useEffect } from 'react';
import { X, Loader2, ArrowLeft, UserPlus, UserCheck, MessageCircle, Share2, Sparkles, TrendingUp, Users, MoreVertical, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import api from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseSafe';

import { ProfileHeader } from './ProfileHeader';
import { ProfileStats } from './ProfileStats';
import { ProfileTabs, type ProfileTab } from './ProfileTabs';
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

  const SkeletonLoader = () => (
    <div className="w-full bg-gray-950 min-h-screen animate-pulse">
      <div className="h-48 sm:h-64 bg-gray-900 w-full"></div>
      <div className="px-4 sm:px-8 -mt-16">
        <div className="w-32 h-32 rounded-full bg-gray-800 border-4 border-gray-950 mb-4"></div>
        <div className="h-8 bg-gray-800 w-48 rounded mb-2"></div>
        <div className="h-4 bg-gray-800 w-32 rounded mb-6"></div>
        <div className="flex gap-4 mb-6">
          <div className="h-12 bg-gray-800 w-16 rounded"></div>
          <div className="h-12 bg-gray-800 w-16 rounded"></div>
          <div className="h-12 bg-gray-800 w-16 rounded"></div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return isPage ? (
      <div className="min-h-screen bg-black pt-4 pb-20 sm:p-4 md:p-6 lg:p-8"><SkeletonLoader /></div>
    ) : (
      <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-2xl bg-gray-950 sm:rounded-3xl overflow-hidden"><SkeletonLoader /></div>
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
    <div className="flex flex-col w-full bg-gray-950 border-x sm:border border-white/10 sm:rounded-3xl overflow-hidden shadow-2xl relative">
      
      {/* Top Navigation Overlay */}
      <div className="absolute top-4 left-4 right-4 z-20 flex justify-between">
        {isPage && (
          <button onClick={() => navigate(-1)} className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all shadow-lg">
            <ArrowLeft size={18} />
          </button>
        )}
        {!isPage && onClose && (
          <button onClick={onClose} className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all ml-auto shadow-lg">
            <X size={18} />
          </button>
        )}
      </div>

      <ProfileHeader profile={profile} isOwner={isSelf} completionPercentage={completionPercentage} />

      <div className="px-4 sm:px-8 pb-4">
        <ProfileStats 
          postsCount={profile.posts_count} 
          followersCount={profile.followers_count} 
          followingCount={profile.following_count} 
          notesCount={notes.length} 
          onStatClick={(stat) => toast.success(`Viewing ${stat}`)}
        />
        
        {/* Action Buttons Row */}
        <div className="flex items-center w-full gap-2 mt-6 pb-2 sticky top-0 z-30 bg-gray-950/80 backdrop-blur-md py-2">
          {!isSelf ? (
            <>
              <button
                onClick={handleToggleFollow}
                disabled={followLoading}
                className={`flex-1 px-6 py-2.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${
                  isFollowing ? "bg-white/10 text-white border border-white/10" : "bg-white text-black hover:bg-gray-200"
                }`}
              >
                {followLoading ? <Loader2 size={18} className="animate-spin" /> : isFollowing ? <><UserCheck size={18} /> Following</> : <><Plus size={18} /> Follow</>}
              </button>
              <button onClick={() => navigate(`/dashboard/chat?user=${profile.id}`)} className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl text-white font-bold transition-all flex items-center gap-2 border border-white/5">
                <MessageCircle size={18} /> Message
              </button>
            </>
          ) : (
            <button onClick={() => navigate('/dashboard/settings')} className="flex-1 px-6 py-2.5 bg-white text-black hover:bg-gray-200 rounded-2xl font-bold transition-all shadow-lg">
              Edit Profile
            </button>
          )}
          <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied!'); }} className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all border border-white/5" title="Share Profile">
            <Share2 size={18} />
          </button>
          <button className="px-3 py-2.5 bg-white/5 hover:bg-white/15 rounded-2xl text-gray-400 hover:text-white transition-all border border-transparent hover:border-white/5">
            <MoreVertical size={18} />
          </button>
        </div>

        {/* Profile Completion for New Users */}
        {isSelf && completionPercentage < 100 && (
          <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-gray-900 to-gray-900/50 border border-white/10">
            <div className="flex justify-between items-center text-sm mb-2">
              <span className="font-bold text-white">Complete your profile</span>
              <span className="text-primary font-bold">{completionPercentage}%</span>
            </div>
            <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden mb-4">
              <motion.div initial={{ width: 0 }} animate={{ width: `${completionPercentage}%` }} className="h-full bg-primary" />
            </div>
            <div className="flex flex-wrap gap-4 text-xs font-medium">
              <span className="text-emerald-400 flex items-center gap-1">✓ Username</span>
              <span className={profile.bio ? "text-emerald-400 flex items-center gap-1" : "text-gray-500 flex items-center gap-1"}>{profile.bio ? '✓' : '✗'} Bio</span>
              <span className={profile.avatar_url ? "text-emerald-400 flex items-center gap-1" : "text-gray-500 flex items-center gap-1"}>{profile.avatar_url ? '✓' : '✗'} Profile Photo</span>
              <span className={profile.cover_url ? "text-emerald-400 flex items-center gap-1" : "text-gray-500 flex items-center gap-1"}>{profile.cover_url ? '✓' : '✗'} Banner</span>
            </div>
          </div>
        )}
      </div>

      <ProfileTabs activeTab={activeTab} setActiveTab={setActiveTab} isOwner={isSelf} profileId={profile.id} />

      <div className="min-h-[500px] bg-gray-950 pb-20 sm:pb-0">
        {isFetchingTab ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-600" size={32} /></div>
        ) : (
          <>
            {activeTab === 'posts' && (
              <div className="flex flex-col">
                <FeaturedNote note={featuredNote} onClick={() => {}} />
                {posts.length === 0 ? (
                  <ProfileEmptyStates type="posts" isOwner={isSelf} onAction={() => navigate('/dashboard/community')} />
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
              <div className="flex flex-col">
                {notes.length === 0 ? (
                  <ProfileEmptyStates type="notes" isOwner={isSelf} onAction={() => navigate('/dashboard')} />
                ) : (
                  <div className="p-4 grid gap-4">
                    {notes.map(note => (
                      <div key={note.id} className="p-5 bg-gray-900/50 hover:bg-gray-900 border border-white/5 hover:border-white/10 rounded-2xl text-white transition-all cursor-pointer">
                        <h4 className="font-bold text-lg mb-1">{note.title || 'Untitled Note'}</h4>
                        <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed">{note.content ? note.content.replace(/<[^>]*>?/gm, '') : ''}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'media' && <ProfileEmptyStates type="media" isOwner={isSelf} />}
            {activeTab === 'likes' && <ProfileEmptyStates type="likes" isOwner={isSelf} />}
            {activeTab === 'bookmarks' && <ProfileEmptyStates type="bookmarks" isOwner={isSelf} />}
            {activeTab === 'about' && (
              <div className="p-6">
                <h3 className="text-xl font-bold text-white mb-6">About</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                  <div className="bg-gray-900/40 p-4 rounded-2xl border border-white/5">
                    <span className="block text-gray-500 font-bold uppercase tracking-wider text-[10px] mb-1">Bio</span>
                    <span className="text-gray-200">{profile.bio || '-'}</span>
                  </div>
                  <div className="bg-gray-900/40 p-4 rounded-2xl border border-white/5">
                    <span className="block text-gray-500 font-bold uppercase tracking-wider text-[10px] mb-1">Location</span>
                    <span className="text-gray-200">{profile.country_code ? profile.country_code.toUpperCase() : '-'}</span>
                  </div>
                  <div className="bg-gray-900/40 p-4 rounded-2xl border border-white/5">
                    <span className="block text-gray-500 font-bold uppercase tracking-wider text-[10px] mb-1">Website</span>
                    <span className="text-blue-400">{profile.website || '-'}</span>
                  </div>
                  <div className="bg-gray-900/40 p-4 rounded-2xl border border-white/5">
                    <span className="block text-gray-500 font-bold uppercase tracking-wider text-[10px] mb-1">Profession</span>
                    <span className="text-gray-200">Developer</span>
                  </div>
                  <div className="bg-gray-900/40 p-4 rounded-2xl border border-white/5">
                    <span className="block text-gray-500 font-bold uppercase tracking-wider text-[10px] mb-1">Joined Date</span>
                    <span className="text-gray-200">{profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '-'}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (isPage) {
    return (
      <div className="min-h-screen bg-black pt-0 sm:pt-4 pb-20 sm:pb-8 sm:p-4 md:p-6 lg:p-8 overflow-x-hidden">
        <div className="max-w-[1050px] mx-auto flex flex-col lg:flex-row gap-6 relative items-start">
          
          {/* Main Content Column */}
          <div className="flex-1 w-full max-w-2xl mx-auto">
            {MainContent}
          </div>

          {/* Right Sidebar */}
          <div className="hidden lg:flex flex-col w-[320px] sticky top-8 gap-5 shrink-0">
            {/* Suggested Users */}
            <div className="bg-gray-950 border border-white/10 rounded-3xl p-5 shadow-2xl">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Users size={18} className="text-emerald-400" /> Suggested Users
              </h3>
              <div className="flex flex-col gap-4">
                {[
                  { name: 'Sarah Johnson', user: 'sarahj', role: 'UI Designer', followers: 128 },
                  { name: 'Michael Chen', user: 'mchen', role: 'Product Manager', followers: 842 },
                  { name: 'Alex Rivera', user: 'arivera', role: 'Frontend Dev', followers: 32 }
                ].map((u, i) => (
                  <div key={i} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-800 to-gray-700 flex items-center justify-center text-white font-bold text-sm shadow-inner">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white group-hover:underline cursor-pointer">{u.name}</div>
                        <div className="text-[11px] text-gray-500">{u.role} • {u.followers} followers</div>
                      </div>
                    </div>
                    <button className="text-xs text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full font-bold transition-colors border border-white/5">
                      Follow
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Trending Notes */}
            <div className="bg-gray-950 border border-white/10 rounded-3xl p-5 shadow-2xl">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-indigo-400" /> Trending Notes
              </h3>
              <div className="flex flex-col gap-4">
                {[
                  { title: 'Building My Startup', likes: 421, comments: 89, views: '4.2k' },
                  { title: 'React Performance Tips', likes: 215, comments: 34, views: '1.8k' },
                  { title: 'The Future of NoteStandard', likes: 892, comments: 156, views: '12k' }
                ].map((note, i) => (
                  <div key={i} className="flex flex-col gap-1 cursor-pointer group">
                    <div className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">{note.title}</div>
                    <div className="flex items-center gap-3 text-[11px] font-semibold text-gray-500">
                      <span className="flex items-center gap-1">❤️ {note.likes}</span>
                      <span className="flex items-center gap-1">💬 {note.comments}</span>
                      <span className="flex items-center gap-1">👁 {note.views}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Footer Links Mock */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600 px-2 mt-2">
              <a href="#" className="hover:underline">Terms</a>
              <a href="#" className="hover:underline">Privacy</a>
              <a href="#" className="hover:underline">Cookies</a>
              <span>© 2026 NoteStandard</span>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl min-h-screen sm:min-h-0 sm:max-h-[90vh] overflow-y-auto overflow-x-hidden scrollbar-hide">
        {MainContent}
      </div>
    </div>
  );
};
