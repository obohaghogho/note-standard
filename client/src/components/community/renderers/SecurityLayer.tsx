import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface SecurityLayerProps {
  content: unknown;
  children: (sanitizedContent: unknown) => React.ReactNode;
}

export const SecurityLayer: React.FC<SecurityLayerProps> = ({ content, children }) => {
  const sanitizedContent = useMemo(() => {
    // We must return a deep clone of the content to avoid mutating the original store
    const sanitize = (obj: unknown): unknown => {
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
        const cleaned: Record<string, unknown> = {};
        const record = obj as Record<string, unknown>;
        for (const key in record) {
          // Additional safety: don't sanitize URLs that are supposed to be arrays of image links,
          // but DO validate them to ensure they are https
          if (key === 'urls' && Array.isArray(record[key])) {
             cleaned[key] = (record[key] as string[]).filter((url: string) => url.startsWith('https://'));
          } else {
             cleaned[key] = sanitize(record[key]);
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
