import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, TrendingUp, Loader2, BadgeCheck } from 'lucide-react';
import { API_URL, getAuthHeader } from '../../lib/api';
import { toggleFollow } from '../../services/communityService';
import { useAuth } from '../../context/AuthContext';

interface Space {
  id: string;
  name: string;
  avatar_url?: string;
  member_count: number;
  description?: string;
}

interface Creator {
  id: string;
  username: string;
  avatar_url?: string;
  is_verified?: boolean;
  followers_count?: number;
  is_following?: boolean;
}

export const FeedSidebar: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [followingState, setFollowingState] = useState<Record<string, boolean>>({});

  // Load trending spaces
  useEffect(() => {
    const load = async () => {
      try {
        const headers = await getAuthHeader();
        const res = await fetch(`${API_URL}/api/community/spaces?limit=5`, { headers });
        if (res.ok) {
          const data = await res.json();
          setSpaces(Array.isArray(data) ? data.slice(0, 5) : []);
        }
      } catch {
        // Fail silently – sidebar is non-critical
      } finally {
        setLoadingSpaces(false);
      }
    };
    load();
  }, []);

  // Load suggested creators (people the current user doesn't follow yet)
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const headers = await getAuthHeader();
        const res = await fetch(`${API_URL}/api/community/suggested-creators?limit=5`, { headers });
        if (res.ok) {
          const data: Creator[] = await res.json();
          setCreators(data.slice(0, 5));
          const init: Record<string, boolean> = {};
          data.forEach(c => { init[c.id] = c.is_following ?? false; });
          setFollowingState(init);
        }
      } catch {
        // Fail silently
      } finally {
        setLoadingCreators(false);
      }
    };
    load();
  }, [user]);

  const handleFollow = async (creatorId: string) => {
    const was = followingState[creatorId];
    setFollowingState(prev => ({ ...prev, [creatorId]: !was }));
    try {
      await toggleFollow(creatorId);
    } catch {
      setFollowingState(prev => ({ ...prev, [creatorId]: was }));
    }
  };

  return (
    <div className="p-4 space-y-6">
      {/* Trending Spaces */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <TrendingUp size={14} className="text-blue-500" /> Trending Spaces
        </h3>

        {loadingSpaces ? (
          <div className="flex justify-center py-4">
            <Loader2 size={16} className="animate-spin text-gray-400" />
          </div>
        ) : spaces.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">No spaces yet</p>
        ) : (
          <div className="space-y-3">
            {spaces.map(space => (
              <button
                key={space.id}
                onClick={() => navigate(`/dashboard/community/space/${space.id}`)}
                className="flex items-center space-x-3 w-full text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg p-1.5 -mx-1.5 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden">
                  {space.avatar_url
                    ? <img src={space.avatar_url} alt={space.name} className="w-full h-full object-cover" />
                    : space.name[0]?.toUpperCase()
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{space.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Users size={10} /> {space.member_count?.toLocaleString()} members
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Suggested Creators */}
      {user && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Users size={14} className="text-purple-500" /> Suggested Creators
          </h3>

          {loadingCreators ? (
            <div className="flex justify-center py-4">
              <Loader2 size={16} className="animate-spin text-gray-400" />
            </div>
          ) : creators.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">No suggestions yet</p>
          ) : (
            <div className="space-y-3">
              {creators.map(creator => (
                <div key={creator.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <img
                      src={creator.avatar_url || `https://ui-avatars.com/api/?name=${creator.username}&background=6366f1&color=fff`}
                      alt={creator.username}
                      className="w-8 h-8 rounded-full object-cover shrink-0 cursor-pointer"
                      onClick={() => navigate(`/dashboard/community/profile/${creator.id}`)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <p
                          className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:underline cursor-pointer"
                          onClick={() => navigate(`/dashboard/community/profile/${creator.id}`)}
                        >
                          {creator.username}
                        </p>
                        {creator.is_verified && <BadgeCheck size={12} className="text-blue-500 shrink-0" />}
                      </div>
                      {creator.followers_count !== undefined && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {creator.followers_count.toLocaleString()} followers
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    id={`follow-sidebar-${creator.id}`}
                    onClick={() => handleFollow(creator.id)}
                    className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                      followingState[creator.id]
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 hover:border-red-200'
                        : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {followingState[creator.id] ? 'Following' : 'Follow'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400 dark:text-gray-500 px-1">
        <a href="/about" className="hover:underline hover:text-gray-600 dark:hover:text-gray-300">About</a>
        <a href="/help" className="hover:underline hover:text-gray-600 dark:hover:text-gray-300">Help</a>
        <a href="/terms" className="hover:underline hover:text-gray-600 dark:hover:text-gray-300">Terms</a>
        <a href="/privacy" className="hover:underline hover:text-gray-600 dark:hover:text-gray-300">Privacy</a>
        <span className="w-full mt-1">© 2026 NoteStandard</span>
      </div>
    </div>
  );
};
