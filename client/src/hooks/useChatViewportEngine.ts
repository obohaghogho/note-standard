import { useRef, useEffect, useState, useCallback } from 'react';
import { ChatViewportEngine, ViewportState } from '../services/ChatViewportEngine';
import type { ChatViewportOptions } from '../services/ChatViewportEngine';

export function useChatViewportEngine() {
  const engineRef = useRef<ChatViewportEngine>(new ChatViewportEngine());
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [unreadCountWhileScrolled, setUnreadCountWhileScrolled] = useState(0);
  const [viewportState, setViewportState] = useState<ViewportState>(ViewportState.IDLE);

  const mountEngine = useCallback((options: ChatViewportOptions) => {
    engineRef.current.mount({
      ...options,
      onNearBottomChange: (isNearBottom) => {
        setShowScrollDown(!isNearBottom);
        if (isNearBottom) {
          setUnreadCountWhileScrolled(0);
        }
      },
      onUnreadIncrement: () => {
        setUnreadCountWhileScrolled((prev) => prev + 1);
      },
      onStateChange: (state) => {
        setViewportState(state);
      },
    });
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current.unmount();
    };
  }, []);

  const scrollToBottom = useCallback((behavior: 'instant' | 'smooth' = 'smooth') => {
    engineRef.current.scrollToBottom(behavior);
    setShowScrollDown(false);
    setUnreadCountWhileScrolled(0);
  }, []);

  const handleConversationSwitch = useCallback(() => {
    engineRef.current.handleConversationSwitch();
  }, []);

  const handleSendMessage = useCallback(() => {
    engineRef.current.handleSendMessage();
  }, []);

  const handleNewIncomingMessage = useCallback(() => {
    engineRef.current.handleNewIncomingMessage();
  }, []);

  const handleMediaLoad = useCallback(() => {
    engineRef.current.handleMediaLoad();
  }, []);

  const updateScrollState = useCallback(() => {
    return engineRef.current.updateScrollState();
  }, []);

  const captureScrollHeightBeforeHistoryLoad = useCallback(() => {
    return engineRef.current.captureScrollHeightBeforeHistoryLoad();
  }, []);

  const restoreScrollAfterHistoryLoad = useCallback((prevHeight?: number) => {
    engineRef.current.restoreScrollAfterHistoryLoad(prevHeight);
  }, []);

  const cacheMessageHeight = useCallback((messageId: string, height: number) => {
    engineRef.current.cacheMessageHeight(messageId, height);
  }, []);

  const getCachedMessageHeight = useCallback((messageId: string) => {
    return engineRef.current.getCachedMessageHeight(messageId);
  }, []);

  return {
    mountEngine,
    scrollToBottom,
    handleConversationSwitch,
    handleSendMessage,
    handleNewIncomingMessage,
    handleMediaLoad,
    updateScrollState,
    captureScrollHeightBeforeHistoryLoad,
    restoreScrollAfterHistoryLoad,
    cacheMessageHeight,
    getCachedMessageHeight,
    showScrollDown,
    unreadCountWhileScrolled,
    viewportState,
    setShowScrollDown,
    setUnreadCountWhileScrolled,
    engine: engineRef.current,
  };
}
export { ViewportState };
