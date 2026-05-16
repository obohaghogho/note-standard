/**
 * useLongPressGesture – React Native / Expo
 *
 * Produces TouchableOpacity-compatible props that:
 * 1. Let FlatList scrolling win over long-press (via delayLongPress)
 * 2. Cancel long-press if the finger moves more than `moveThreshold` pixels
 * 3. Never accidentally fire during a scroll gesture
 *
 * Usage:
 *   const gestureProps = useLongPressGesture({ onLongPress: () => handleMenu(item) });
 *   <TouchableOpacity {...gestureProps} ...>
 */

import { useRef, useCallback } from 'react';
import { GestureResponderEvent } from 'react-native';

interface LongPressGestureOptions {
  onLongPress: () => void;
  /** Pixels of movement that cancel the long-press. Default: 10 */
  moveThreshold?: number;
  /** Ms to hold before firing. Must be ≥ FlatList scroll threshold. Default: 500 */
  delay?: number;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
}

interface LongPressGestureProps {
  onLongPress: () => void;
  /** Pass to TouchableOpacity to delay the long-press so scroll wins */
  delayLongPress: number;
  onPressIn: (e: GestureResponderEvent) => void;
  onPressOut: () => void;
  /** Cancel long press if finger moves too far */
  onMoveShouldSetResponder?: (e: GestureResponderEvent) => boolean;
}

export function useLongPressGesture({
  onLongPress,
  moveThreshold = 10,
  delay = 500,
  onSwipeRight,
  onSwipeLeft,
}: LongPressGestureOptions): LongPressGestureProps {
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const cancelledRef = useRef(false);
  const swipeFiredRef = useRef(false);

  const handlePressIn = useCallback((e: GestureResponderEvent) => {
    cancelledRef.current = false;
    swipeFiredRef.current = false;
    const { pageX, pageY } = e.nativeEvent;
    startPosRef.current = { x: pageX, y: pageY };
  }, []);

  const handlePressOut = useCallback(() => {
    startPosRef.current = null;
  }, []);

  /**
   * This is called when movement detected. Return true to claim the responder
   * (effectively cancelling the long-press) if movement exceeds threshold.
   */
  const onMoveShouldSetResponder = useCallback((e: GestureResponderEvent): boolean => {
    if (!startPosRef.current) return false;
    const { pageX, pageY } = e.nativeEvent;
    const dx = pageX - startPosRef.current.x;
    const dy = pageY - startPosRef.current.y;
    
    // Check for swipe gesture
    if (!swipeFiredRef.current && Math.abs(dx) > 50 && Math.abs(dy) < 30) {
      if (dx > 0 && onSwipeRight) {
        onSwipeRight();
        swipeFiredRef.current = true;
      } else if (dx < 0 && onSwipeLeft) {
        onSwipeLeft();
        swipeFiredRef.current = true;
      }
    }

    if (Math.abs(dy) > moveThreshold || Math.abs(dx) > moveThreshold) {
      // Movement detected — cancel long press silently
      cancelledRef.current = true;
      return false; // Don't steal the responder; let FlatList scroll
    }
    return false;
  }, [moveThreshold, onSwipeRight, onSwipeLeft]);

  const handleLongPress = useCallback(() => {
    if (cancelledRef.current) return;
    onLongPress();
  }, [onLongPress]);

  return {
    onLongPress: handleLongPress,
    delayLongPress: delay,
    onPressIn: handlePressIn,
    onPressOut: handlePressOut,
    onMoveShouldSetResponder,
  };
}
