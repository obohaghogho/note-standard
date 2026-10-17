/**
 * KeyboardLayoutManager (KLM) — v1.0
 *
 * The single authority for keyboard height, viewport dimensions, and safe-area
 * across every chat surface in NoteStandard (Personal Chat, Team Chat, Group,
 * Workspace, Meeting, AI, Support, Channel).
 *
 * Architecture:
 *  • ONE visualViewport listener, never duplicated
 *  • CSS custom properties are the ONLY output — components never read
 *    window.visualViewport or window.innerHeight directly
 *  • 'klm:change' CustomEvent lets React hooks subscribe without re-renders
 *    on every frame — they only re-render on meaningful state transitions
 *  • Desktop detection: listeners register but CSS vars remain at full-page
 *    defaults; zero unnecessary layout work on desktop
 *
 * CSS custom properties emitted:
 *  --vv-height   Visual viewport height in px
 *  --vv-top      Visual viewport top offset in px (iOS Safari page scroll)
 *  --kb-height   Keyboard height in px (0 on desktop, 0 on Android with resizes-content)
 *  --safe-bottom Safe area inset bottom in px (read once, never doubled)
 *
 * HTML class toggled:
 *  keyboard-open   Added when keyboard height > KLM_KEYBOARD_THRESHOLD
 */

export interface KLMState {
  vvHeight: number;
  vvTop: number;
  kbHeight: number;
  isKeyboardOpen: boolean;
  safeBottom: number;
}

// Minimum px to be considered "keyboard open" — filters out browser chrome resize
const KLM_KEYBOARD_THRESHOLD = 50;

/**
 * Check if an element is an editable input inside a fixed overlay or
 * visual-viewport-tracked container where document scrolling is disallowed.
 */
function isViewportTrackedInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
  if (!isEditable) return false;

  // 1. Direct match on known full-screen / viewport-avoidant container classes or selectors
  if (el.closest && el.closest('.chat-root, .teams-page, .team-chat, .chat-widget, [role="dialog"], [id^="comments-sheet-"]')) {
    return true;
  }

  // 2. Structural match: any ancestor with position: fixed
  let curr: Element | null = el.parentElement;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    try {
      const style = window.getComputedStyle(curr);
      if (style.position === 'fixed') {
        return true;
      }
    } catch {
      break;
    }
    curr = curr.parentElement;
  }

  return false;
}

// Cached safe-area — read once from CSS, never recalculated per-frame
let _safeBottom = 0;

function readSafeAreaOnce(): number {
  try {
    // Requires viewport-fit=cover in <meta name="viewport">
    const tmp = document.createElement('div');
    tmp.style.cssText = [
      'position:fixed',
      'bottom:0',
      'left:0',
      'width:0',
      'height:0',
      'padding-bottom:env(safe-area-inset-bottom,0px)',
      'visibility:hidden',
      'pointer-events:none',
    ].join(';');
    document.documentElement.appendChild(tmp);
    const h = parseFloat(getComputedStyle(tmp).paddingBottom) || 0;
    document.documentElement.removeChild(tmp);
    return h;
  } catch {
    return 0;
  }
}

/** Compute the current KLM state from browser APIs */
function computeState(): KLMState {
  const vp = window.visualViewport;

  if (vp) {
    const vvTop    = Math.round(vp.offsetTop);
    const vvHeight = Math.round(vp.height);

    // With `interactive-widget=resizes-content` (Android Chrome 108+):
    //   window.innerHeight ALREADY shrinks with the keyboard → kbHeight ≈ 0.
    //   The container height: var(--vv-height) shrinks continuously.
    // With iOS Safari:
    //   window.innerHeight stays fixed → kbHeight = keyboard size.
    //   The container shrinks via --vv-height continuously.
    const kbHeight = Math.max(0, window.innerHeight - vvHeight);

    return {
      vvTop,
      vvHeight,
      kbHeight,
      isKeyboardOpen: kbHeight > KLM_KEYBOARD_THRESHOLD,
      safeBottom: _safeBottom,
    };
  }

  // Fallback: no visualViewport (very old browsers, jsdom, SSR)
  return {
    vvTop:    0,
    vvHeight: window.innerHeight,
    kbHeight: 0,
    isKeyboardOpen: false,
    safeBottom: _safeBottom,
  };
}

/** Apply computed state to CSS custom properties — SYNCHRONOUSLY (no rAF) */
function applyState(state: KLMState): void {
  const root = document.documentElement;

  // Prevent iOS Safari window offset drift on focus
  if (state.isKeyboardOpen || state.vvTop > 0) {
    if (window.scrollY > 0) {
      window.scrollTo(0, 0);
    }
  }

  root.style.setProperty('--vv-top',    `${state.vvTop}px`);
  root.style.setProperty('--vv-height', `${state.vvHeight}px`);
  root.style.setProperty('--kb-height', `${state.kbHeight}px`);
  root.classList.toggle('keyboard-open', state.isKeyboardOpen);

  // Notify React subscribers — fired AFTER CSS vars are written
  document.dispatchEvent(
    new CustomEvent<KLMState>('klm:change', { detail: state })
  );
}

/** Apply state in a rAF — used only for orientation/window resize (non-keyboard) */
let _rafId: number | null = null;
function applyStateRaf(): void {
  if (_rafId !== null) cancelAnimationFrame(_rafId);
  _rafId = requestAnimationFrame(() => {
    applyState(computeState());
    _rafId = null;
  });
}

let _initialized = false;

/**
 * initKLM() — call ONCE in main.tsx before React renders.
 * Idempotent: safe to call multiple times (noop after first call).
 */
export function initKLM(): void {
  if (_initialized) return;
  _initialized = true;

  // Read safe-area before any layout change
  _safeBottom = readSafeAreaOnce();

  // Write safe-area to CSS once (so components can read --safe-bottom)
  document.documentElement.style.setProperty('--safe-bottom', `${_safeBottom}px`);

  // ── Focus-scroll mitigation for iOS Safari ────────────────────────────────
  // Mobile Safari automatically scrolls the layout viewport (window.scrollY > 0)
  // when an input is focused to center it in the screen. For fixed/viewport-tracked
  // containers (Chat, Team Chat, Feed Comments, Reels Comments), this unwanted
  // document scroll causes the composer to transiently jump toward the top of the
  // screen before visualViewport.resize fires and resets it.
  // We clamp window.scrollY to (0, 0) immediately upon scroll/focusin for tracked inputs.
  window.addEventListener('scroll', () => {
    if (window.scrollY !== 0 && isViewportTrackedInput(document.activeElement)) {
      window.scrollTo(0, 0);
    }
  }, { passive: true });

  document.addEventListener('focusin', (e) => {
    const target = e.target as Element | null;
    if (isViewportTrackedInput(target)) {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    }
  }, { passive: true });

  // ── Primary: visualViewport (iOS Safari + Android Chrome) ─────────────────
  if (window.visualViewport) {
    // SYNC (no rAF) so the CSS var update lands in the SAME frame as the
    // visualViewport resize event — this is what eliminates the gap on iOS.
    window.visualViewport.addEventListener('resize', () => applyState(computeState()), { passive: true });
    window.visualViewport.addEventListener('scroll', () => applyState(computeState()), { passive: true });
  }

  // ── Secondary: window resize for orientation changes ──────────────────────
  // rAF is fine here — orientation changes are not time-critical
  window.addEventListener('resize', applyStateRaf, { passive: true });

  // ── Tertiary: Chrome 94+ Virtual Keyboard API ─────────────────────────────
  // Supplements visualViewport on Chrome where geometrychange may fire
  // when visualViewport.resize doesn't (e.g. PWA on some Android OEM browsers).
  type VKNav = Navigator & {
    virtualKeyboard?: {
      addEventListener(
        type: 'geometrychange',
        listener: (e: Event & { target: { boundingRect: DOMRect } }) => void
      ): void;
    };
  };
  const vkNav = navigator as VKNav;
  if (vkNav.virtualKeyboard) {
    vkNav.virtualKeyboard.addEventListener('geometrychange', (e) => {
      // Only use this to sync the keyboard-open class — let visualViewport
      // handle the actual --kb-height (avoids double-counting)
      const kbH = e.target.boundingRect?.height ?? 0;
      document.documentElement.classList.toggle(
        'keyboard-open',
        kbH > KLM_KEYBOARD_THRESHOLD
      );
    });
  }

  // ── Apply immediately on init ─────────────────────────────────────────────
  applyState(computeState());

  // ── Safe-area refresh on orientation change ───────────────────────────────
  // Safe-area can change when rotating from portrait to landscape on iPad
  window.addEventListener('orientationchange', () => {
    requestAnimationFrame(() => {
      _safeBottom = readSafeAreaOnce();
      document.documentElement.style.setProperty('--safe-bottom', `${_safeBottom}px`);
      applyState(computeState());
    });
  }, { passive: true });
}

/**
 * getKLMState() — synchronous read of the current KLM state.
 * Useful for one-off reads outside React (e.g. in scroll handlers).
 */
export function getKLMState(): KLMState {
  return computeState();
}
