import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface SecurityLayerProps {
  content: any;
  pluginId: string;
  children: (sanitizedContent: any) => React.ReactNode;
}

export const SecurityLayer: React.FC<SecurityLayerProps> = ({ content, pluginId, children }) => {
  const sanitizedContent = useMemo(() => {
    // We must return a deep clone of the content to avoid mutating the original store
    const sanitize = (obj: any): any => {
      if (typeof obj === 'string') {
        // Strict DOMPurify configuration
        return DOMPurify.sanitize(obj, {
          ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'h1', 'h2', 'h3', 'blockquote'],
          ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
          ALLOW_DATA_ATTR: false,
        });
      }
      
      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }
      
      if (typeof obj === 'object' && obj !== null) {
        const cleaned: Record<string, any> = {};
        for (const key in obj) {
          // Additional safety: don't sanitize URLs that are supposed to be arrays of image links,
          // but DO validate them to ensure they are https
          if (key === 'urls' && Array.isArray(obj[key])) {
             cleaned[key] = obj[key].filter((url: string) => url.startsWith('https://'));
          } else {
             cleaned[key] = sanitize(obj[key]);
          }
        }
        return cleaned;
      }
      
      return obj; // Numbers, booleans pass through
    };

    return sanitize(content);
  }, [content]);

  return <>{children(sanitizedContent)}</>;
};
