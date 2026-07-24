import { useState, useEffect } from 'react';

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
export type Orientation = 'portrait' | 'landscape';

export interface BreakpointState {
  breakpoint: Breakpoint;
  orientation: Orientation;
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isUltraWide: boolean;
  isFoldable: boolean;
}

const getBreakpoint = (width: number): Breakpoint => {
  if (width < 480) return 'xs';
  if (width < 640) return 'sm';
  if (width < 768) return 'md';
  if (width < 1024) return 'lg';
  if (width < 1280) return 'xl';
  if (width < 1536) return '2xl';
  return '3xl';
};

export const useBreakpoint = (): BreakpointState => {
  const [state, setState] = useState<BreakpointState>(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const height = typeof window !== 'undefined' ? window.innerHeight : 800;
    const bp = getBreakpoint(width);
    return {
      breakpoint: bp,
      orientation: width >= height ? 'landscape' : 'portrait',
      width,
      height,
      isMobile: width < 768,
      isTablet: width >= 768 && width < 1024,
      isDesktop: width >= 1024,
      isUltraWide: width >= 1536,
      isFoldable: width >= 640 && width <= 820 && height <= 900,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const bp = getBreakpoint(width);
        setState({
          breakpoint: bp,
          orientation: width >= height ? 'landscape' : 'portrait',
          width,
          height,
          isMobile: width < 768,
          isTablet: width >= 768 && width < 1024,
          isDesktop: width >= 1024,
          isUltraWide: width >= 1536,
          isFoldable: width >= 640 && width <= 820 && height <= 900,
        });
      }, 16); // 60 FPS debounce threshold
    };

    window.addEventListener('resize', handleResize);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return state;
};
