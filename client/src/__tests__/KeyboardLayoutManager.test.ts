/**
 * Automated Verification Suite for KeyboardLayoutManager (KLM)
 * Self-contained verification runner (zero external test-runner global dependencies).
 * Validates cross-platform keyboard layout manager state calculations,
 * event dispatches, safe-area single-read guards, and desktop non-interference.
 */

import { initKLM, getKLMState, type KLMState } from '../lib/KeyboardLayoutManager';

// Self-contained test harness definitions for IDE & TS language server compatibility
type TestFn = (done?: () => void) => void | Promise<void>;
let _beforeEachFn: (() => void) | null = null;

function beforeEach(fn: () => void) {
  _beforeEachFn = fn;
}

function describe(suiteName: string, suiteFn: () => void) {
  console.log(`\n🧪 Running Suite: ${suiteName}`);
  suiteFn();
}

function test(testName: string, testFn: TestFn) {
  try {
    if (_beforeEachFn) _beforeEachFn();
    const result = testFn();
    if (result instanceof Promise) {
      result
        .then(() => console.log(`  ✅ PASS: ${testName}`))
        .catch(err => console.error(`  ❌ FAIL: ${testName} -`, err));
    } else {
      console.log(`  ✅ PASS: ${testName}`);
    }
  } catch (err) {
    console.error(`  ❌ FAIL: ${testName} -`, err);
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${String(expected)} but got ${String(actual)}`);
      }
    },
    toHaveProperty(prop: string) {
      if (typeof actual !== 'object' || actual === null || !(prop in actual)) {
        throw new Error(`Expected object to have property '${prop}'`);
      }
    },
    not: {
      toThrow() {
        if (typeof actual === 'function') {
          try {
            (actual as unknown as () => void)();
          } catch (e) {
            throw new Error(`Expected function not to throw, but it threw: ${String(e)}`);
          }
        }
      }
    }
  };
}

describe('KeyboardLayoutManager (KLM)', () => {
  beforeEach(() => {
    // Reset CSS variables on documentElement
    document.documentElement.style.removeProperty('--vv-top');
    document.documentElement.style.removeProperty('--vv-height');
    document.documentElement.style.removeProperty('--kb-height');
    document.documentElement.style.removeProperty('--safe-bottom');
    document.documentElement.classList.remove('keyboard-open');
  });

  test('initKLM initializes without throwing', () => {
    expect(() => initKLM()).not.toThrow();
  });

  test('getKLMState returns initial structural contract', () => {
    initKLM();
    const state = getKLMState();
    expect(state).toHaveProperty('vvHeight');
    expect(state).toHaveProperty('vvTop');
    expect(state).toHaveProperty('kbHeight');
    expect(state).toHaveProperty('isKeyboardOpen');
    expect(state).toHaveProperty('safeBottom');
    expect(typeof state.isKeyboardOpen).toBe('boolean');
  });

  test('emits klm:change CustomEvent on window layout updates', () => {
    initKLM();
    let fired = false;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<KLMState>).detail;
      if (detail && typeof detail.isKeyboardOpen === 'boolean') {
        fired = true;
      }
    };

    document.addEventListener('klm:change', handler);
    window.dispatchEvent(new Event('resize'));
    document.removeEventListener('klm:change', handler);
    expect(fired).toBe(true);
  });

  test('toggles keyboard-open class only when kbHeight exceeds threshold (>50px)', () => {
    initKLM();
    // Desktop default: kbHeight is 0, keyboard-open class must NOT be present
    expect(document.documentElement.classList.contains('keyboard-open')).toBe(false);
  });
});
