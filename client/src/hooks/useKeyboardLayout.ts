/**
 * useKeyboardLayout — React hook for KLM state
 *
 * Subscribes to 'klm:change' CustomEvent (emitted by KeyboardLayoutManager).
 * Components that need keyboard state import THIS hook — never read
 * window.visualViewport or window.innerHeight directly.
 *
 * Only re-renders when the boolean `isKeyboardOpen` changes.
 * Numeric values (kbHeight, vvHeight) are available for inspection but do
 * NOT trigger re-renders — layouts are handled by CSS custom properties.
 */
import { useState, useEffect, useCallback } from 'react';
import { type KLMState, getKLMState } from '../lib/KeyboardLayoutManager';

export interface KeyboardLayoutState {
  /** Is a virtual keyboard currently open? (debounced boolean) */
  isKeyboardOpen: boolean;
  /** Keyboard height in px — live value from CSS var (not reactive) */
  kbHeight: number;
  /** Visual viewport height in px */
  vvHeight: number;
  /** Safe-area-inset-bottom in px */
  safeBottom: number;
}

export function useKeyboardLayout(): KeyboardLayoutState {
  const [state, setState] = useState<KeyboardLayoutState>(() => {
    const s = getKLMState();
    return {
      isKeyboardOpen: s.isKeyboardOpen,
      kbHeight:       s.kbHeight,
      vvHeight:       s.vvHeight,
      safeBottom:     s.safeBottom,
    };
  });

  const handleChange = useCallback((e: Event) => {
    const detail = (e as CustomEvent<KLMState>).detail;
    setState(prev => {
      // Only trigger re-render when the boolean flips — not on every frame
      if (
        prev.isKeyboardOpen === detail.isKeyboardOpen &&
        prev.safeBottom     === detail.safeBottom
      ) {
        return prev;
      }
      return {
        isKeyboardOpen: detail.isKeyboardOpen,
        kbHeight:       detail.kbHeight,
        vvHeight:       detail.vvHeight,
        safeBottom:     detail.safeBottom,
      };
    });
  }, []);

  useEffect(() => {
    document.addEventListener('klm:change', handleChange, { passive: true });
    return () => document.removeEventListener('klm:change', handleChange);
  }, [handleChange]);

  return state;
}
