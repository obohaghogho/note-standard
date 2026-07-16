import React, { useEffect, useRef } from 'react';

interface AnalyticsLayerProps {
  postId: string;
  postType: string;
  children: React.ReactNode;
}

export const AnalyticsLayer: React.FC<AnalyticsLayerProps> = ({ postId, postType, children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const startTime = useRef<number>(Date.now());
  const hasRecordedImpression = useRef(false);

  useEffect(() => {
    const start = startTime.current;
    // 1. Setup Intersection Observer for Impressions
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !hasRecordedImpression.current) {
          hasRecordedImpression.current = true;
          // In real app, emit to activity service via EventBus
          console.log(`[Analytics] Impression: ${postId} (${postType})`);
        }
      },
      { threshold: 0.5 } // 50% visible triggers impression
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
      // 2. Record Read Duration on unmount
      const duration = Date.now() - start;
      if (duration > 1000) { // Only log if they looked at it for > 1s
        console.log(`[Analytics] Read Duration: ${postId} - ${duration}ms`);
      }
    };
  }, [postId, postType]);

  return (
    <div ref={containerRef} className="analytics-wrapper w-full">
      {children}
    </div>
  );
};
