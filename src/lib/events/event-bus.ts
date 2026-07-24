// ============================================================================
// Typed In-Process Event Bus
// ============================================================================
// A lightweight pub/sub bus that provides compile-time safety via EventMap.
// Handlers are invoked sequentially; errors are caught and logged so an
// individual subscriber failure never disrupts the emitter.
// ============================================================================

import type { EventMap } from './types';

/** The shape of an event handler function. */
type EventHandler<T> = (data: T) => void | Promise<void>;

/**
 * Typed, in-process event bus.
 *
 * @example
 * ```ts
 * import { eventBus } from '@/lib/events/event-bus';
 *
 * eventBus.on('deposit.completed', async (data) => {
 *   console.log('Deposit completed:', data.reference);
 * });
 *
 * eventBus.emit('deposit.completed', payload);
 * ```
 */
export class EventBus {
  /** Map of event name → set of handler functions. */
  private handlers: Map<string, Set<EventHandler<unknown>>> = new Map();

  /**
   * Emit an event, invoking every registered handler for that event name.
   *
   * Handlers that return a Promise are awaited one-by-one. If a handler
   * throws (sync or async), the error is logged but **never** re-thrown,
   * so subsequent handlers still execute.
   *
   * @param event - The event name (must be a key of EventMap).
   * @param data  - The event payload.
   */
  async emit<K extends keyof EventMap>(event: K, data: EventMap[K]): Promise<void> {
    const set = this.handlers.get(event as string);
    if (!set || set.size === 0) return;

    for (const handler of set) {
      try {
        await handler(data);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[EventBus] Handler error for "${String(event)}": ${message}`,
          error,
        );
      }
    }
  }

  /**
   * Register a handler for an event.
   *
   * @param event   - The event name.
   * @param handler - Callback to invoke when the event fires.
   */
  on<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>,
  ): void {
    let set = this.handlers.get(event as string);
    if (!set) {
      set = new Set();
      this.handlers.set(event as string, set);
    }
    set.add(handler as EventHandler<unknown>);
  }

  /**
   * Remove a previously registered handler for an event.
   *
   * @param event   - The event name.
   * @param handler - The exact function reference that was passed to `on()`.
   */
  off<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>,
  ): void {
    const set = this.handlers.get(event as string);
    if (!set) return;
    set.delete(handler as EventHandler<unknown>);
    if (set.size === 0) {
      this.handlers.delete(event as string);
    }
  }

  /**
   * Remove all handlers for every event.
   * Useful in tests or during graceful shutdown.
   */
  removeAllListeners(): void {
    this.handlers.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton — import this in application code
// ---------------------------------------------------------------------------

/** Global event bus instance shared across the application. */
export const eventBus = new EventBus();
