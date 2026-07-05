import React, { useEffect, useState, useMemo } from 'react';
import { PluginRegistry } from './PluginRegistry';
import { AnalyticsLayer } from './AnalyticsLayer';
import { InteractionLayer } from './InteractionLayer';
import { SecurityLayer } from './SecurityLayer';
import { PluginErrorBoundary } from './PluginErrorBoundary';
import { DiagnosticOverlay } from './DiagnosticOverlay';
import { MoreHorizontal } from 'lucide-react';
import type { PluginContext, PostPlugin } from './PluginContract';

// Import and register core plugins (synchronous)
import { TextPlugin } from './plugins/TextPlugin';
import { ImagePlugin } from './plugins/ImagePlugin';

PluginRegistry.register(TextPlugin);
PluginRegistry.register(ImagePlugin);

// Async plugins (example registration, these files would exist in the real app)
// PluginRegistry.registerAsync('poll', () => import('./plugins/PollPlugin'));

interface ContentResolverProps {
  post: {
    id: string;
    post_type: string;
    content?: unknown;
    media_urls?: string[];
    profiles?: { avatar_url?: string; username?: string; is_verified?: boolean };
    category?: string;
    title?: string;
    tags?: string[];
    user_has_liked?: boolean;
    likes_count?: number;
    comments_count?: number;
    shares_count?: number;
    user_has_saved?: boolean;
  };
  flags?: Record<string, boolean>;
}

export const ContentResolver: React.FC<ContentResolverProps> = ({ post, flags = {} }) => {
  const [plugin, setPlugin] = useState<PostPlugin | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initTime, setInitTime] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const start = performance.now();

    PluginRegistry.load(post.post_type)
      .then(loadedPlugin => {
        if (!isMounted) return;
        const duration = performance.now() - start;
        setInitTime(duration);
        
        if (duration > 20 && process.env.NODE_ENV !== 'production') {
           console.warn(`[Performance] Plugin ${post.post_type} took ${duration.toFixed(2)}ms to initialize.`);
        }
        
        setPlugin(loadedPlugin || null);
        setIsLoading(false);
      })
      .catch(err => {
        if (!isMounted) return;
        console.error(`Failed to load plugin ${post.post_type}`, err);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [post.post_type]);

  const context: PluginContext = useMemo(() => ({
    postId: post.id,
    isOffline: !navigator.onLine,
    theme: 'light',
    permissions: {
      canEdit: false,
      canDelete: false,
      canComment: true
    },
    flags
  }), [post.id, flags]);

  if (isLoading) {
    return <FallbackRenderer message="Loading content..." />;
  }

  // 2. Fallback / Validator Handling
  if (!plugin) {
    return <FallbackRenderer message={`Unsupported content type: ${post.post_type}`} />;
  }

  // Parse content safely depending on db schema (assuming post.content is JSON)
  const contentPayload = typeof post.content === 'string' ? { text: post.content } : post.content || {};
  if (post.media_urls) contentPayload.urls = post.media_urls;

  if (!plugin.validator(contentPayload)) {
    return <FallbackRenderer message="Content validation failed for this post." />;
  }

  // 3. Assemble Pipeline
  return (
    <article className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-shadow hover:shadow-md mb-6">
      <AnalyticsLayer postId={post.id} postType={post.post_type}>
        <div className="p-4 sm:p-5">
          {/* Universal Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <img src={post.profiles?.avatar_url || 'https://via.placeholder.com/40'} alt="Avatar" className="w-10 h-10 rounded-full object-cover bg-gray-100" />
              <div>
                <div className="flex items-center space-x-1">
                  <h4 className="font-bold text-sm text-gray-900 dark:text-white hover:underline cursor-pointer">{post.profiles?.username || 'Unknown User'}</h4>
                  {post.profiles?.is_verified && <span className="text-blue-500 text-xs">✓</span>}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">2h ago • {post.category || 'General'}</p>
              </div>
            </div>
            <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <MoreHorizontal size={20} />
            </button>
          </div>

          {post.title && <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight mb-3">{post.title}</h2>}

          {/* Plugin Execution Environment */}
          <PluginErrorBoundary pluginId={plugin.id}>
            <SecurityLayer content={contentPayload}>
              {(sanitizedContent) => (
                <div className="relative group">
                  <plugin.Renderer content={sanitizedContent} context={context} />
                  <DiagnosticOverlay pluginId={plugin.id} version={plugin.version} renderTimeMs={initTime} />
                </div>
              )}
            </SecurityLayer>
          </PluginErrorBoundary>

          {/* Universal Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {post.tags.map((tag: string, index: number) => (
                <span key={index} className="text-xs font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">#{tag}</span>
              ))}
            </div>
          )}

          {/* Universal Interaction Layer */}
          <InteractionLayer post={post} supportedActions={plugin.supportedActions} />
        </div>
      </AnalyticsLayer>
    </article>
  );
};

const FallbackRenderer = ({ message }: { message: string }) => (
  <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
    <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
  </div>
);
