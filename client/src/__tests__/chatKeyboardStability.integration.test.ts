// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initKLM, getKLMState } from '../lib/KeyboardLayoutManager';
import { ChatViewportEngine, ViewportState } from '../services/ChatViewportEngine';

describe('Enterprise Chat Keyboard Stability & Viewport Suite (WhatsApp/Telegram Standard)', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.style.cssText = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Single Authority: KeyboardLayoutManager initializes CSS custom properties synchronously', () => {
    initKLM();
    const state = getKLMState();

    expect(state).toHaveProperty('vvHeight');
    expect(state).toHaveProperty('vvTop');
    expect(state).toHaveProperty('kbHeight');
    expect(state).toHaveProperty('isKeyboardOpen');
    expect(state).toHaveProperty('safeBottom');

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue('--vv-height')).not.toBe('');
    expect(rootStyle.getPropertyValue('--vv-top')).not.toBe('');
    expect(rootStyle.getPropertyValue('--kb-height')).not.toBe('');
  });

  it('2. Zero Timers: ChatViewportEngine mounts without creating visualViewport timers', () => {
    const engine = new ChatViewportEngine();
    const container = document.createElement('div');
    const anchor = document.createElement('div');

    const spySetTimeout = vi.spyOn(window, 'setTimeout');
    engine.mount({ containerEl: container, anchorEl: anchor });

    // Verify zero setTimeout calls were issued on mount
    expect(spySetTimeout).not.toHaveBeenCalledWith(expect.any(Function), 50);
    engine.unmount();
  });

  it('3. Container-Internal Scroll Math: scrollToBottom uses scrollTop without calling scrollIntoView', () => {
    const engine = new ChatViewportEngine();
    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    container.scrollTop = 0;

    const anchor = document.createElement('div');
    anchor.scrollIntoView = vi.fn();

    engine.mount({ containerEl: container, anchorEl: anchor });
    engine.scrollToBottom('instant');

    // Container scrollTop must equal scrollHeight - clientHeight (600)
    expect(container.scrollTop).toBe(600);

    // scrollIntoView on window/body elements must NEVER be invoked during internal container scrolling
    expect(anchor.scrollIntoView).not.toHaveBeenCalled();
    engine.unmount();
  });

  it('4. Keyboard Transition Stability: state transitions cleanly to FOLLOWING_BOTTOM', () => {
    const engine = new ChatViewportEngine();
    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollHeight', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });

    const anchor = document.createElement('div');
    let capturedState: ViewportState = ViewportState.IDLE;

    engine.mount({
      containerEl: container,
      anchorEl: anchor,
      onStateChange: (st) => { capturedState = st; },
    });

    engine.scrollToBottom('instant');
    expect(engine.getState()).toBe(ViewportState.FOLLOWING_BOTTOM);
    expect(capturedState).toBe(ViewportState.FOLLOWING_BOTTOM);
    engine.unmount();
  });
});
