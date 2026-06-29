import React, { useState } from 'react';
import type { PostPlugin } from '../PluginContract';

export const ImagePlugin: PostPlugin = {
  id: 'image',
  version: 1,
  supportedActions: ['like', 'comment', 'share', 'save'],
  
  validator: (content) => {
    return Array.isArray(content.urls) && content.urls.length > 0;
  },

  Renderer: ({ content, context }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    
    // Simplistic rendering for V1. Future iteration handles galleries/progressive loading.
    const url = content.urls[0]; 

    return (
      <div className="image-plugin-content space-y-3">
        {content.text && (
          <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{content.text}</p>
        )}
        <div className={`relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-50'}`}>
          <img 
            src={url} 
            alt="Post content" 
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
            className="w-full h-auto max-h-96 object-cover"
          />
        </div>
      </div>
    );
  }
};
