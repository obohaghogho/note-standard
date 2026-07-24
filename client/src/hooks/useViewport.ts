import { useState, useEffect } from 'react';
import { useKeyboardLayout } from './useKeyboardLayout';

export interface ViewportState {
  width: number;
  height: number;
  vvHeight: number;
  vvTop: number;
  kbHeight: number;
  isKeyboardOpen: boolean;
}

export const useViewport = (): ViewportState => {
  const { vvHeight, vvTop, kbHeight, isKeyboardOpen } = useKeyboardLayout();
  const [dimensions, setDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    width: dimensions.width,
    height: dimensions.height,
    vvHeight,
    vvTop,
    kbHeight,
    isKeyboardOpen,
  };
};
