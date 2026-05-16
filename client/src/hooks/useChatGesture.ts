/**
 * useChatGesture – Web
 *
 * WhatsApp/Messenger-style gesture detection:
 * - Vertical movement > threshold → cancel long press (it's a scroll)
 * - Stationary hold for LONG_PRESS_DELAY ms → fire long press menu
 * - No text selection during press gestures
 * - Desktop: right-click opens context menu, hold is simulated with mousedown timer
 */

import { useRef, useCallback } from 'react';

interface ChatGestureOptions {
  onLongPress: (id: string) => void;
  onSwipeRight?: (id: string) => void;
  onSwipeLeft?: (id: string) => void;
  /** Pixels of movement that cancels the long-press. Default: 8 */
  moveThreshold?: number;
  /** Ms to hold before triggering. Default: 480 */
  delay?: number;
  /** Whether the whole gesture system is active. Default: true */
  enabled?: boolean;
}

interface GestureHandlers {
  onTouchStart: (e: React.TouchEvent, id: string) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent, id: string, selectionMode: boolean, toggleFn: (id: string) => void) => void;
  /** Attach to every pressable element to block selection */
  dragStartStyle: React.CSSProperties;
}

export function useChatGesture(options: ChatGestureOptions): GestureHandlers {
  const {
    onLongPress,
    moveThreshold = 8,
    delay = 480,
    enabled = true,
  } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const currentPosRef = useRef<{ x: number; y: number } | null>(null);
  const didFireRef = useRef(false);
  const targetIdRef = useRef<string>('');
  const isScrollingRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    isScrollingRef.current = false;
  }, []);

  const fire = useCallback((id: string) => {
    if (!enabled) return;
    didFireRef.current = true;
    // Haptic feedback via vibration API where available
    if (navigator.vibrate) navigator.vibrate(30);
    onLongPress(id);
  }, [enabled, onLongPress]);

  /* ── Touch handlers ──────────────────────────────── */

  const onTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    if (!enabled) return;
    didFireRef.current = false;
    isScrollingRef.current = false;
    targetIdRef.current = id;
    const touch = e.touches[0];
    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    currentPosRef.current = { x: touch.clientX, y: touch.clientY };

    timerRef.current = setTimeout(() => {
      // Only fire if we haven't been scrolling
      if (!isScrollingRef.current) {
        fire(id);
      }
    }, delay);
  }, [delay, enabled, fire]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startPosRef.current || !timerRef.current) return;
    const touch = e.touches[0];
    currentPosRef.current = { x: touch.clientX, y: touch.clientY };
    const dx = touch.clientX - startPosRef.current.x;
    const dy = touch.clientY - startPosRef.current.y;

    // Any vertical movement beyond threshold → it's a scroll, cancel long press
    if (Math.abs(dy) > moveThreshold || Math.abs(dx) > moveThreshold * 2) {
      isScrollingRef.current = true;
      cancel();
    }
  }, [cancel, moveThreshold]);

  const onTouchEnd = useCallback(() => {
    cancel();
    
    if (startPosRef.current && currentPosRef.current && !didFireRef.current) {
        const dx = currentPosRef.current.x - startPosRef.current.x;
        const dy = currentPosRef.current.y - startPosRef.current.y;
        
        // Horizontal swipe detection (allow some vertical drift)
        if (Math.abs(dx) > 50 && Math.abs(dy) < 50) {
            if (dx > 0 && options.onSwipeRight) {
                options.onSwipeRight(targetIdRef.current);
            } else if (dx < 0 && options.onSwipeLeft) {
                options.onSwipeLeft(targetIdRef.current);
            }
        }
    }

    startPosRef.current = null;
    currentPosRef.current = null;
  }, [cancel, options]);

  const onTouchCancel = useCallback(() => {
    cancel();
    startPosRef.current = null;
    currentPosRef.current = null;
  }, [cancel]);

  /* ── Mouse handlers (desktop) ────────────────────── */

  const onMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    if (!enabled || e.button !== 0) return; // left-click only
    didFireRef.current = false;
    targetIdRef.current = id;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    timerRef.current = setTimeout(() => fire(id), delay);
  }, [delay, enabled, fire]);

  const onMouseUp = useCallback(() => {
    cancel();
    startPosRef.current = null;
  }, [cancel]);

  const onMouseLeave = useCallback(() => {
    cancel();
    startPosRef.current = null;
  }, [cancel]);

  /* ── Click: only acts if in selection mode ───────── */

  const onClick = useCallback((
    e: React.MouseEvent,
    id: string,
    selectionMode: boolean,
    toggleFn: (id: string) => void,
  ) => {
    if (didFireRef.current) {
      didFireRef.current = false;
      return; // long-press already handled — skip click
    }
    if (selectionMode) {
      e.preventDefault();
      toggleFn(id);
    }
  }, []);

  /* ── CSS: disable browser text-selection during press ── */

  const dragStartStyle: React.CSSProperties = {
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'pan-y', // Let browser handle vertical scroll natively
    WebkitTapHighlightColor: 'transparent',
    cursor: 'default',
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    onClick,
    dragStartStyle,
  };
}
