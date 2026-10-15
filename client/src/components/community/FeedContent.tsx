import React, { useState, useEffect } from 'react';
import { Loader2, Users, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { UniversalPostCard } from './UniversalPostCard';
import VerifiedBadge from '../common/VerifiedBadge';
import type { CommunityPost } from '../../services/communityService';
import { toggleFollow } from '../../services/communityService';
import { useAuth } from '../../context/AuthContext';

interface Props {
  posts: CommunityPost[];
  isLoading: boolean;
  isFetchingMore: boolean;
  error: string | null;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  onOpenComposer: () => void;
  onDelete: (id: string) => void;
  onOptimisticLike: (id: string, isLiked: boolean) => void;
  onOptimisticBookmark: (id: string, isBookmarked: boolean) => void;
  currentUserAvatar?: string;
  searchQuery?: string;
}

interface MatchedUser {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
  followers_count?: number;
  is_following?: boolean;
}

const SkeletonCard = () => (
  <div data-testid="skeleton" className="bg-white dark:bg-gray-900 border-y sm:border border-gray-100 dark:border-gray-800 rounded-none sm:rounded-2xl p-3.5 sm:p-4 shadow-sm animate-pulse">
    <div className="flex items-center space-x-3 mb-3">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 dark:bg-gray-800" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-28 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-2 w-20 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>
    </div>
    <div className="space-y-2 mb-3">
      <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
      <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded" />
      <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded" />
    </div>
    <div className="flex items-center gap-4 pt-3 border-t border-gray-100 dark:border-gray-800">
      <div className="h-6 w-12 bg-gray-200 dark:bg-gray-800 rounded-full" />
      <div className="h-6 w-12 bg-gray-200 dark:bg-gray-800 rounded-full" />
      <div className="h-6 w-12 bg-gray-200 dark:bg-gray-800 rounded-full" />
    </div>
  </div>
);

export const FeedContent: React.FC<Props> = ({
  posts,
  isLoading,
  isFetchingMore,
  error,
  sentinelRef,
  onOpenComposer,
  onDelete,
  onOptimisticLike,
  onOptimisticBookmark,
  currentUserAvatar,
  searchQuery,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [matchedUsers, setMatchedUsers] = useState<MatchedUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setMatchedUsers([]);
      setSearchingUsers(false);
      return;
    }

    let isMounted = true;
    const fetchUsers = async () => {
      setSearchingUsers(true);
      try {
        const res = await api.get(`/community/suggested-creators?search=${encodeURIComponent(searchQuery.trim())}&limit=10`);
        if (isMounted && Array.isArray(res.data)) {
          setMatchedUsers(res.data);
          const map: Record<string, boolean> = {};
          res.data.forEach((u: MatchedUser) => { map[u.id] = !!u.is_following; });
          setFollowingMap(map);
        }
      } catch (err) {
        // fail silently
      } finally {
        if (isMounted) setSearchingUsers(false);
      }
    };

    fetchUsers();
    return () => { isMounted = false; };
  }, [searchQuery]);

  const handleToggleFollow = async (userId: string) => {
    const was = followingMap[userId];
    setFollowingMap(prev => ({ ...prev, [userId]: !was }));
    try {
      await toggleFollow(userId);
    } catch {
      setFollowingMap(prev => ({ ...prev, [userId]: was }));
    }
  };
  return (
    <div id="community-feed" data-testid="community-feed" className="flex-1 w-full max-w-2xl mx-auto px-0 sm:px-4 py-2 sm:py-4 space-y-3 sm:space-y-4">
      {/* Create Post Bar */}
      <div className="px-3 sm:px-0">
        <div
          className="w-full bg-white dark:bg-gray-900 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 shadow-sm border border-gray-200/90 dark:border-gray-800 flex items-center space-x-3 group"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const profileId = user?.id || (user as any)?.user_id;
              if (profileId) {
                navigate(`/dashboard/profile/${profileId}`);
              }
            }}
            className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0 hover:opacity-85 transition-all cursor-pointer transform hover:scale-105 active:scale-95"
            title="View your profile"
            aria-label="View your profile"
          >
            <img
              src={currentUserAvatar || `https://ui-avatars.com/api/?name=U&background=6366f1&color=fff`}
              alt="You"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover bg-gray-100 shrink-0 ring-1 ring-gray-200/80 dark:ring-gray-700"
            />
          </button>
          <button
            type="button"
            id="open-post-composer"
            onClick={onOpenComposer}
            className="flex-1 h-8 sm:h-9 rounded-full bg-gray-100/80 dark:bg-gray-800/80 border border-gray-200/50 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-700 flex items-center px-3.5 transition-colors text-left cursor-text"
          >
            <span className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">Share your knowledge…</span>
          </button>
        </div>
      </div>

      {/* People & Creators Search Results */}
      {searchQuery && searchQuery.trim().length >= 2 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-blue-500/20 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <Users size={14} className="text-blue-500" />
            People & Creators ({matchedUsers.length})
          </h3>

          {searchingUsers ? (
            <div className="flex justify-center py-4">
              <Loader2 size={18} className="animate-spin text-blue-500" />
            </div>
          ) : matchedUsers.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No matching users found for "{searchQuery}"</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {matchedUsers.map(u => (
                <div key={u.id} className="py-3 flex items-center justify-between gap-3">
                  <div 
                    onClick={() => navigate(`/dashboard/profile/${u.id}`)}
                    className="flex items-center space-x-3 min-w-0 cursor-pointer group"
                  >
                    <img
                      src={u.avatar_url || `https://ui-avatars.com/api/?name=${u.username}&background=6366f1&color=fff`}
                      alt={u.username}
                      className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-transparent group-hover:ring-blue-500 transition-all"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-sm text-gray-900 dark:text-white truncate group-hover:text-blue-500 transition-colors">
                          {u.full_name || u.username}
                        </span>
                        {u.is_verified && <VerifiedBadge size={14} className="shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">@{u.username}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => navigate(`/dashboard/profile/${u.id}`)}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-xs font-semibold rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Eye size={13} />
                      <span>View Profile</span>
                    </button>

                    <button
                      onClick={() => handleToggleFollow(u.id)}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        followingMap[u.id]
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 border border-gray-200 dark:border-gray-700'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20'
                      }`}
                    >
                      {followingMap[u.id] ? 'Following' : 'Follow'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>
          <p className="text-xs text-gray-400">Pull down to refresh</p>
        </div>
      )}

      {/* Posts */}
      <div className="space-y-3 sm:space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : posts.length === 0 && !error ? (
          <div data-testid="empty-state" className="text-center py-16 px-4">
            <div className="w-16 h-16 mx-auto bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
              <span className="text-3xl">🌌</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Welcome to the Community!</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Discover ideas, share your knowledge, follow creators, and join spaces that match your interests. Your next great conversation starts here.
            </p>
            <button
              onClick={onOpenComposer}
              className="mt-4 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Create the first post
            </button>
          </div>
        ) : (
          posts.map(post => (
            <UniversalPostCard
              key={post.id}
              post={post}
              onDelete={onDelete}
              onOptimisticLike={onOptimisticLike}
              onOptimisticBookmark={onOptimisticBookmark}
            />
          ))
        )}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading more spinner */}
      {isFetchingMore && (
        <div className="flex justify-center py-4">
          <Loader2 size={22} className="animate-spin text-blue-500" />
        </div>
      )}
    </div>
  );
};
