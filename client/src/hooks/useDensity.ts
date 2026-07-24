import { useState, useEffect, useCallback } from 'react';

export type LayoutDensity = 'comfortable' | 'compact' | 'dense';

export const useDensity = (): [LayoutDensity, (mode: LayoutDensity) => void] => {
  const [density, setDensityState] = useState<LayoutDensity>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('ns_layout_density') as LayoutDensity;
      if (saved && ['comfortable', 'compact', 'dense'].includes(saved)) {
        return saved;
      }
    }
    return 'comfortable';
  });

  const setDensity = useCallback((mode: LayoutDensity) => {
    setDensityState(mode);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ns_layout_density', mode);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-density', mode);
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-density', density);
    }
  }, [density]);

  return [density, setDensity];
};
