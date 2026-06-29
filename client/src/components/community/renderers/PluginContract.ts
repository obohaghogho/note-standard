import React from 'react';

export interface PluginAnalytics {
  impressions: number;
  readTimeMs: number;
  interactions: Record<string, number>;
}

export interface PluginContext {
  postId: string;
  isOffline: boolean;
  theme: 'light' | 'dark';
  permissions: {
    canEdit: boolean;
    canDelete: boolean;
    canComment: boolean;
  };
  flags: Record<string, boolean>; // e.g., { LEARNING_MODE: true }
}

export interface PostPlugin<T = any> {
  id: string; // e.g., 'text', 'image', 'poll'
  version: number;
  
  // Renders the main content inside the feed
  Renderer: React.FC<{ content: T; context: PluginContext }>;
  
  // Optional: Renders a compact preview (e.g., for search results or lists)
  Preview?: React.FC<{ content: T; context: PluginContext }>;
  
  // Validates the content payload before rendering (prevent crashes)
  validator: (content: any) => boolean;
  
  // Actions this plugin inherently supports
  supportedActions: Array<'like' | 'comment' | 'share' | 'save' | 'vote' | 'buy'>;
  
  // Hooks for custom offline support (e.g., caching images)
  preload?: (content: T) => Promise<void>;
}
