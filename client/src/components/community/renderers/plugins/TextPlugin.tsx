import React from 'react';
import type { PostPlugin } from '../PluginContract';

// Using a basic div here, but would integrate DOMPurify in reality
export const TextPlugin: PostPlugin = {
  id: 'text',
  version: 1,
  supportedActions: ['like', 'comment', 'share', 'save'],
  
  validator: (content) => {
    return typeof content.text === 'string' && content.text.length > 0;
  },

  Renderer: ({ content, context: _context }) => {
    return (
      <div className="text-plugin-content">
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
          {content.text}
        </p>
      </div>
    );
  }
};
