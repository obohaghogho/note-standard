import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, ArrowLeft, UserPlus, UserCheck, MessageCircle, Share2, Sparkles, TrendingUp, Users, MoreVertical, Plus, Edit3, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseSafe';

import { ProfileHeader } from './ProfileHeader';
import { ProfileStats } from './ProfileStats';
import { ProfileTabs, type ProfileTab } from './ProfileTabs';
import { ProfileEmptyStates } from './ProfileEmptyStates';
import { ProfilePostCard } from './ProfilePostCard';
import { FeaturedNote } from './FeaturedNote';
import { Dropdown } from '../common/Dropdown';

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
  plan_tier?: string;
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
  const [scrolled, setScrolled] = useState(false);
  
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [trendingNotes, setTrendingNotes] = useState<any[]>([]);
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

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
          setIsBlocked(res.data.isBlocked || false);
          setIsMuted(res.data.isMuted || false);
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

  useEffect(() => {
    if (isPage) {
      const fetchSidebarData = async () => {
        try {
          const [suggestedRes, notesRes] = await Promise.all([
            api.get('/community/suggested-creators?limit=3'),
            supabase.from('notes').select('*').order('created_at', { ascending: false }).limit(3)
          ]);
          if (suggestedRes.data?.creators) setSuggestedUsers(suggestedRes.data.creators);
          if (notesRes.data) setTrendingNotes(notesRes.data);
        } catch (e) {
          console.error('Failed to fetch sidebar data', e);
        }
      };
      fetchSidebarData();
    }
  }, [isPage]);

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

  const handleShare = async () => {
    if (!profile) return;
    const url = `${window.location.origin}/profile/${profile.username}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile.full_name || profile.username} on NoteStandard`,
          text: profile.bio || `Check out ${profile.username}'s profile on NoteStandard`,
          url: url,
        });
        toast.success('Shared successfully!');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          navigator.clipboard.writeText(url);
          toast.success('Link copied to clipboard!');
        }
      }
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard!');
    }
  };

  const handleBlockUser = async () => {
    if (!profile) return;
    if (window.confirm(`Are you sure you want to block ${profile.username}?\nYou won't see each other's content or be able to message each other.`)) {
      setIsActionLoading(true);
      try {
        await api.post('/chat/block', { blockedId: profile.id });
        toast.success('User blocked successfully');
        setIsBlocked(true);
      } catch (err) {
        toast.error('Failed to block user');
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  const handleReportUser = async () => {
    if (!profile) return;
    const reason = window.prompt(`Please provide a reason for reporting ${profile.username}:`);
    if (reason && reason.trim()) {
      setIsActionLoading(true);
      try {
        await api.post('/community/report-user', { reportedId: profile.id, reason: reason.trim() });
        toast.success('User reported successfully. Our team will review this.');
      } catch (err) {
        toast.error('Failed to submit report');
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  const [isMuted, setIsMuted] = useState(false);

  const handleMuteUser = async () => {
    if (!profile) return;
    setIsActionLoading(true);
    try {
      if (isMuted) {
        await api.delete(`/status/mute/${profile.id}`);
        toast.success('User unmuted.');
      } else {
        await api.post(`/status/mute/${profile.id}`);
        toast.success('User muted. Their posts will no longer appear in your feed.');
      }
      setIsMuted(!isMuted);
    } catch (err) {
      toast.error(`Failed to ${isMuted ? 'unmute' : 'mute'} user`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUnblockUser = async () => {
    if (!profile) return;
    setIsActionLoading(true);
    try {
      await api.post('/chat/unblock', { blockedId: profile.id });
      toast.success('User unblocked');
      setIsBlocked(false);
    } catch (err) {
      toast.error('Failed to unblock user');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const y = e.currentTarget.scrollTop;
    if (y > 200 && !scrolled) setScrolled(true);
    if (y <= 200 && scrolled) setScrolled(false);
  };

  useEffect(() => {
    if (isPage) {
      const handleWindowScroll = () => {
        const y = window.scrollY;
        if (y > 200 && !scrolled) setScrolled(true);
        if (y <= 200 && scrolled) setScrolled(false);
      };
      window.addEventListener('scroll', handleWindowScroll);
      return () => window.removeEventListener('scroll', handleWindowScroll);
    }
  }, [isPage, scrolled]);

  const SkeletonLoader = () => (
    <div className="w-full bg-gray-950 min-h-screen animate-pulse">
      <div className="h-56 sm:h-64 bg-gray-900 w-full"></div>
      <div className="px-4 sm:px-8 -mt-20">
        <div className="w-36 h-36 rounded-full bg-gray-800 border-[6px] border-gray-950 mb-4"></div>
        <div className="h-8 bg-gray-800 w-48 rounded mb-2"></div>
        <div className="h-4 bg-gray-800 w-32 rounded mb-6"></div>
        <div className="flex gap-4 mb-6">
          <div className="h-16 bg-gray-800 w-20 rounded-2xl"></div>
          <div className="h-16 bg-gray-800 w-20 rounded-2xl"></div>
          <div className="h-16 bg-gray-800 w-20 rounded-2xl"></div>
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

  if (isBlocked) {
    return (
      <div className={isPage ? "min-h-screen bg-gray-950 flex items-center justify-center p-6" : "fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"}>
        <div className="bg-gray-900 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center space-y-4 text-white">
          <Sparkles className="mx-auto text-gray-500" size={40} />
          <h3 className="text-lg font-bold">User Blocked</h3>
          <p className="text-xs text-gray-400">You have blocked this user. You will no longer see their profile or content.</p>
          <div className="flex flex-col gap-2 w-full mt-4">
            <button onClick={handleUnblockUser} disabled={isActionLoading} className="w-full py-2.5 bg-white text-black hover:bg-gray-200 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2">
              {isActionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Unblock User'}
            </button>
            <button onClick={() => isPage ? navigate(-1) : onClose?.()} className="w-full py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl text-xs font-bold transition-all">Go Back</button>
          </div>
        </div>
      </div>
    );
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsActionLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await fetch(`${import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : 'https://api.notestandard.com')}/api/upload/image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const data = await uploadRes.json();
      
      const updateData = type === 'avatar' 
        ? { avatar_url: data.url } 
        : { cover_url: data.url };
      
      setProfile(prev => prev ? { ...prev, ...updateData } : null);
      toast.success(`${type === 'avatar' ? 'Avatar' : 'Banner'} updated successfully!`);
    } catch (err) {
      toast.error(`Failed to update ${type}`);
    } finally {
      setIsActionLoading(false);
      if (e.target) e.target.value = ''; // Reset input
    }
  };

  const MainContent = (
    <div className="flex flex-col w-full bg-gray-950 border-x sm:border border-white/10 sm:rounded-3xl shadow-2xl relative min-h-screen sm:min-h-0">
      
      {/* Top Navigation Overlay & Sticky Header */}
      <div className={`absolute sm:fixed sm:absolute top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? 'bg-gray-950/90 backdrop-blur-xl border-b border-white/10 py-3' : 'bg-transparent py-4'}`}>
        <div className="px-4 flex items-center gap-4">
          {isPage ? (
            <button onClick={() => navigate(-1)} className={`p-2.5 rounded-full transition-all shadow-lg shrink-0 ${scrolled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/40 hover:bg-black/60 text-white backdrop-blur-md'}`}>
              <ArrowLeft size={18} />
            </button>
          ) : onClose ? (
            <button onClick={onClose} className={`p-2.5 rounded-full transition-all shadow-lg shrink-0 ${scrolled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/40 hover:bg-black/60 text-white backdrop-blur-md'}`}>
              <X size={18} />
            </button>
          ) : null}
          
          <AnimatePresence>
            {scrolled && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex flex-col min-w-0"
              >
                <span className="font-bold text-white truncate text-[15px]">{profile.full_name || profile.username}</span>
                <span className="text-xs text-gray-400 truncate">{posts.length} Posts</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <ProfileHeader profile={profile} isOwner={isSelf} completionPercentage={completionPercentage} />

      <div className="px-4 sm:px-8 pb-4">
        <ProfileStats 
          postsCount={profile.posts_count} 
          followersCount={profile.followers_count} 
          followingCount={profile.following_count} 
          notesCount={notes.length} 
          likesCount={posts.filter(p => p.is_liked).length}
          onStatClick={(stat) => toast.success(`Viewing ${stat}`)}
        />
        
        {/* Action Buttons Row */}
        <div className="flex items-center w-full gap-2 mt-4 pb-4 sticky top-[60px] sm:top-0 z-30 bg-gray-950/90 backdrop-blur-xl pt-2">
          {!isSelf ? (
            <>
              <button
                onClick={handleToggleFollow}
                disabled={followLoading}
                className={`flex-1 h-11 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${
                  isFollowing ? "bg-white/10 text-white border border-white/10" : "bg-white text-black hover:bg-gray-200"
                }`}
              >
                {followLoading ? <Loader2 size={18} className="animate-spin" /> : isFollowing ? <><UserCheck size={18} /> Following</> : <><Plus size={18} /> Follow</>}
              </button>
              <button onClick={() => navigate(`/dashboard/chat?user=${profile.id}`)} className="flex-1 h-11 bg-white/10 hover:bg-white/20 rounded-2xl text-white font-bold transition-all flex items-center justify-center gap-2 border border-white/5">
                <MessageCircle size={18} /> Message
              </button>
            </>
          ) : (
            <button onClick={() => navigate('/dashboard/settings')} className="flex-1 h-11 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
              <Edit3 size={16} /> Edit Profile
            </button>
          )}
          <button onClick={handleShare} className="w-11 h-11 shrink-0 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all border border-white/5" title="Share Profile">
            <Share2 size={18} />
          </button>
          
          <div className="shrink-0 flex items-center justify-center bg-white/5 hover:bg-white/15 rounded-2xl text-gray-400 hover:text-white transition-all border border-transparent hover:border-white/5">
            <Dropdown 
              trigger={<div className="w-11 h-11 flex items-center justify-center"><MoreVertical size={18} /></div>}
              items={isSelf ? [
                { label: 'Edit Profile', onClick: () => navigate('/dashboard/settings?tab=profile') },
                { label: 'Edit Avatar', onClick: () => avatarInputRef.current?.click() },
                { label: 'Edit Banner', onClick: () => bannerInputRef.current?.click() },
                { label: 'Account Settings', onClick: () => navigate('/dashboard/settings') },
                { label: 'Privacy Settings', onClick: () => navigate('/dashboard/settings') },
                { label: 'Download My Data', onClick: () => navigate('/dashboard/settings') },
                { label: 'Delete Account', variant: 'danger', onClick: () => navigate('/dashboard/settings') },
              ] : [
                { label: 'Copy Profile Link', onClick: () => { navigator.clipboard.writeText(`${window.location.origin}/profile/${profile.username}`); toast.success('Link copied'); } },
                { label: isMuted ? 'Unmute User' : 'Mute User', onClick: handleMuteUser },
                { label: 'Report User', variant: 'danger', onClick: handleReportUser },
                { label: 'Block User', variant: 'danger', onClick: handleBlockUser },
              ]}
            />
          </div>
        </div>

        {/* Hidden inputs for file uploads */}
        <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'avatar')} />
        <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'banner')} />

        {/* Profile Completion for New Users */}
        {isSelf && completionPercentage < 100 && (
          <div className="mt-2 p-4 rounded-2xl bg-gradient-to-r from-gray-900 to-gray-900/50 border border-white/10">
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
      <div className="min-h-screen bg-black pt-0 pb-20 sm:pb-8 sm:p-4 md:p-6 lg:p-8 overflow-x-hidden">
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
                {suggestedUsers.length > 0 ? suggestedUsers.map((u, i) => (
                  <div key={u.id || i} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-800 to-gray-700 flex items-center justify-center text-white font-bold text-sm shadow-inner overflow-hidden">
                        {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.full_name || u.username || '?').charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white group-hover:underline cursor-pointer" onClick={() => navigate(`/profile/${u.username}`)}>{u.full_name || u.username}</div>
                        <div className="text-[11px] text-gray-500">@{u.username} • {u.followers_count || 0} followers</div>
                      </div>
                    </div>
                    <button onClick={() => navigate(`/profile/${u.username}`)} className="text-xs text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full font-bold transition-colors border border-white/5">
                      View
                    </button>
                  </div>
                )) : (
                  <div className="text-sm text-gray-500">No suggestions right now.</div>
                )}
              </div>
            </div>

            {/* Trending Notes */}
            <div className="bg-gray-950 border border-white/10 rounded-3xl p-5 shadow-2xl">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-indigo-400" /> Trending Notes
              </h3>
              <div className="flex flex-col gap-4">
                {trendingNotes.length > 0 ? trendingNotes.map((note, i) => (
                  <div key={note.id || i} className="flex flex-col gap-1 cursor-pointer group" onClick={() => navigate('/dashboard/notes')}>
                    <div className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">{note.title || 'Untitled Note'}</div>
                    <div className="flex items-center gap-3 text-[11px] font-semibold text-gray-500">
                      <span className="flex items-center gap-1">❤️ {note.likes_count || 0}</span>
                      <span className="flex items-center gap-1">👁 {note.views_count || 0}</span>
                    </div>
                  </div>
                )) : (
                  <div className="text-sm text-gray-500">No trending notes right now.</div>
                )}
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
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 overflow-y-auto pt-[env(safe-area-inset-top,0px)]">
      <div 
        className="w-full max-w-2xl min-h-screen sm:min-h-0 sm:max-h-[90vh] overflow-y-auto overflow-x-hidden scrollbar-hide relative bg-gray-950 sm:rounded-3xl"
        onScroll={handleScroll}
      >
        {MainContent}
      </div>
    </div>
  );
};
