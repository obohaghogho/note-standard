export type ScrollState =
  | 'PinnedBottom'
  | 'ReadingHistory'
  | 'LoadingHistory'
  | 'JumpToLatest'
  | 'Animating'
  | 'Idle';

export interface ScrollEngineConfig {
  bottomThresholdPx?: number;
  onStateChange?: (state: ScrollState) => void;
  onUnreadBannerToggle?: (show: boolean, count: number) => void;
}

/**
 * Smart Scroll Engine State Machine
 * Eliminates viewport jumping, flickering, and auto-scroll bugs.
 * Rules:
 * - If user is at bottom -> PinnedBottom (auto-scroll new incoming messages)
 * - If user is reading past history -> ReadingHistory (NEVER force scroll up; increment unread banner counter)
 * - If history is prepending -> LoadingHistory (preserve exact offset)
 */
export class SmartScrollEngine {
  private currentState: ScrollState = 'PinnedBottom';
  private bottomThreshold: number;
  private unreadCount = 0;
  private onStateChange?: (state: ScrollState) => void;
  private onUnreadBannerToggle?: (show: boolean, count: number) => void;

  constructor(config?: ScrollEngineConfig) {
    this.bottomThreshold = config?.bottomThresholdPx || 120;
    this.onStateChange = config?.onStateChange;
    this.onUnreadBannerToggle = config?.onUnreadBannerToggle;
  }

  public getCurrentState(): ScrollState {
    return this.currentState;
  }

  public handleScroll(scrollTop: number, scrollHeight: number, clientHeight: number) {
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    if (distanceFromBottom <= this.bottomThreshold) {
      this.setState('PinnedBottom');
      if (this.unreadCount > 0) {
        this.unreadCount = 0;
        this.onUnreadBannerToggle?.(false, 0);
      }
    } else if (this.currentState !== 'LoadingHistory' && this.currentState !== 'Animating') {
      this.setState('ReadingHistory');
    }
  }

  public handleIncomingMessage(isOwnMessage: boolean): boolean {
    if (isOwnMessage || this.currentState === 'PinnedBottom' || this.currentState === 'JumpToLatest') {
      this.setState('PinnedBottom');
      return true; // Command container to scroll to bottom
    }

    // User is reading history — do NOT scroll. Show floating unread banner
    this.unreadCount += 1;
    this.onUnreadBannerToggle?.(true, this.unreadCount);
    return false;
  }

  public jumpToBottom() {
    this.unreadCount = 0;
    this.onUnreadBannerToggle?.(false, 0);
    this.setState('JumpToLatest');
  }

  public setState(nextState: ScrollState) {
    if (this.currentState === nextState) return;
    this.currentState = nextState;
    this.onStateChange?.(nextState);
  }

  public getUnreadCount(): number {
    return this.unreadCount;
  }
}
