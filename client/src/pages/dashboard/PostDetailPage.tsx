import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { getPostById, type CommunityPost } from '../../services/communityService';
import { UniversalPostCard } from '../../components/community/UniversalPostCard';

export const PostDetailPage: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchPost = async () => {
      if (!postId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getPostById(postId);
        if (isMounted) setPost(data);
      } catch (err: any) {
        console.error('Failed to fetch post details:', err);
        if (isMounted) setError(err.message || 'Post not found or has been deleted.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPost();
    return () => { isMounted = false; };
  }, [postId]);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back Navigation Bar */}
        <div className="flex items-center justify-between bg-gray-900/60 border border-white/10 rounded-2xl p-4 backdrop-blur-xl">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-semibold transition-all border border-white/10"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <span className="text-sm font-bold text-gray-400">Post Details</span>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-gray-900/40 rounded-3xl border border-white/5">
            <Loader2 size={36} className="animate-spin text-emerald-400" />
            <span className="text-sm text-gray-400 font-medium">Loading post...</span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="py-16 px-6 text-center bg-gray-900/60 border border-red-500/20 rounded-3xl space-y-4">
            <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto text-red-400">
              <ShieldAlert size={28} />
            </div>
            <h3 className="text-lg font-bold text-white">Could not load post</h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto">{error}</p>
            <button
              onClick={() => navigate('/dashboard/feed')}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-500/20"
            >
              Return to Feed
            </button>
          </div>
        )}

        {/* Post content */}
        {!loading && post && (
          <div className="animate-in fade-in duration-300">
            <UniversalPostCard
              post={post}
              onDelete={() => navigate('/dashboard/feed')}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default PostDetailPage;
