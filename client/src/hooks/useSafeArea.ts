import { useState, useEffect } from 'react';
import { getKLMState } from '../lib/KeyboardLayoutManager';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const useSafeArea = (): SafeAreaInsets => {
  const [insets, setInsets] = useState<SafeAreaInsets>(() => {
    const klmState = getKLMState();
    return {
      top: 0,
      bottom: klmState.safeBottom,
      left: 0,
      right: 0,
    };
  });

  useEffect(() => {
    const updateInsets = () => {
      const klmState = getKLMState();
      setInsets(prev => {
        if (prev.bottom === klmState.safeBottom) return prev;
        return { ...prev, bottom: klmState.safeBottom };
      });
    };

    updateInsets();
    document.addEventListener('klm:change', updateInsets);
    return () => document.removeEventListener('klm:change', updateInsets);
  }, []);

  return insets;
};
