/**
 * PerfMonitor — Lightweight realtime performance instrumentation
 *
 * Tracks key user-perceived latency metrics:
 * - sendLatency: tap → optimistic bubble visible (target: <16ms)
 * - renderCount: per-component render counter
 * - socketProcessingTime: socket event → state update (target: <16ms)
 * - navigationTime: list tap → chat screen interactive (target: <100ms)
 *
 * All output is dev-only and is completely stripped from production builds.
 */

const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

type MetricKey =
    | 'sendLatency'
    | 'socketProcessingTime'
    | 'navigationTime'
    | 'renderCount'
    | 'flushBatchTime';

interface Measurement {
    key: MetricKey;
    startTime: number;
    label?: string;
}

class PerfMonitorSingleton {
    private pending = new Map<string, Measurement>();
    private renderCounts = new Map<string, number>();

    /** Start timing a user interaction */
    start(key: MetricKey, id: string, label?: string): void {
        if (!IS_DEV) return;
        this.pending.set(`${key}:${id}`, {
            key,
            startTime: performance.now(),
            label,
        });
    }

    /** End timing and log result */
    end(key: MetricKey, id: string): number | null {
        if (!IS_DEV) return null;
        const m = this.pending.get(`${key}:${id}`);
        if (!m) return null;
        this.pending.delete(`${key}:${id}`);

        const duration = performance.now() - m.startTime;
        const label = m.label || id;

        if (duration > 100) {
            console.warn(`🔴 [PerfMonitor] ${key} "${label}": ${duration.toFixed(1)}ms — CRITICAL (>100ms)`);
        } else if (duration > 16) {
            console.warn(`🟡 [PerfMonitor] ${key} "${label}": ${duration.toFixed(1)}ms — SLOW (>16ms)`);
        } else {
            console.log(`🟢 [PerfMonitor] ${key} "${label}": ${duration.toFixed(1)}ms ✓`);
        }

        return duration;
    }

    /** Track how many times a component renders */
    trackRender(componentName: string): void {
        if (!IS_DEV) return;
        const count = (this.renderCounts.get(componentName) || 0) + 1;
        this.renderCounts.set(componentName, count);

        if (count % 10 === 0) {
            console.log(`📊 [PerfMonitor] ${componentName} has rendered ${count} times`);
        }
        if (count > 50) {
            console.warn(`⚠️ [PerfMonitor] ${componentName} rendered ${count} times — potential render storm`);
        }
    }

    /** Print a summary of all render counts */
    printRenderSummary(): void {
        if (!IS_DEV) return;
        console.group('[PerfMonitor] Render Count Summary');
        this.renderCounts.forEach((count, name) => {
            const status = count > 50 ? '🔴' : count > 20 ? '🟡' : '🟢';
            console.log(`${status} ${name}: ${count} renders`);
        });
        console.groupEnd();
    }

    /** Log a frame drop detected via JS thread stall */
    logFrameDrop(durationMs: number, context: string): void {
        if (!IS_DEV) return;
        if (durationMs > 16) {
            console.warn(`🎞️ [PerfMonitor] Frame drop in "${context}": ${durationMs.toFixed(1)}ms`);
        }
    }

    /** Measure a synchronous block directly */
    measure<T>(key: MetricKey, label: string, fn: () => T): T {
        if (!IS_DEV) return fn();
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;
        if (duration > 16) {
            console.warn(`🟡 [PerfMonitor] ${key} "${label}": ${duration.toFixed(1)}ms`);
        }
        return result;
    }
}

export const PerfMonitor = new PerfMonitorSingleton();
