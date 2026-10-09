import React, { useEffect, useState } from 'react';
import { X, Heart, CheckCircle, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getPostLikers, PostLiker } from '../../services/communityService';

interface LikersModalProps {
  postId: string;
  onClose: () => void;
}

export const LikersModal: React.FC<LikersModalProps> = ({ postId, onClose }) => {
  const navigate = useNavigate();
  const [likers, setLikers] = useState<PostLiker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchLikers = async () => {
      try {
        setLoading(true);
        const data = await getPostLikers(postId);
        if (isMounted) {
          setLikers(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load likers');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    fetchLikers();
    return () => { isMounted = false; };
  }, [postId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 w-full max-w-md overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Heart size={18} className="text-red-500 fill-current" />
            <h3 className="font-bold text-gray-900 dark:text-white text-base">Liked by</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 text-center py-6">{error}</p>
          ) : likers.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <User size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No likes on this post yet.</p>
            </div>
          ) : (
            likers.map((liker) => (
              <div
                key={liker.id}
                onClick={() => {
                  onClose();
                  navigate(`/dashboard/profile/${liker.id}`);
                }}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={liker.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(liker.username)}&background=6366f1&color=fff`}
                    alt={liker.username}
                    className="w-10 h-10 rounded-full object-cover bg-gray-100"
                  />
                  <div>
                    <div className="flex items-center space-x-1">
                      <span className="font-semibold text-sm text-gray-900 dark:text-white hover:underline">
                        {liker.full_name || liker.username}
                      </span>
                      {liker.is_verified && (
                        <CheckCircle size={13} className="text-blue-500 shrink-0" />
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      @{liker.username}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
