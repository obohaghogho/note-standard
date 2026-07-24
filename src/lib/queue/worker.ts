// ============================================================================
// Queue Worker — Polls the job queue on an interval
// ============================================================================

import type { JobQueue } from './job-queue';

export class QueueWorker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(
    private readonly queue: JobQueue,
    private readonly pollIntervalMs = 5_000,
  ) {}

  /**
   * Start the worker. Polls the queue every `pollIntervalMs`.
   */
  start(): void {
    if (this.intervalId) return;

    console.log(`[QueueWorker] Starting with ${this.pollIntervalMs}ms poll interval`);

    this.intervalId = setInterval(async () => {
      if (this.isProcessing) return;

      this.isProcessing = true;
      try {
        // Process all available jobs in the queue
        let processed = true;
        while (processed) {
          processed = await this.queue.processOne();
        }
      } catch (err) {
        console.error('[QueueWorker] Error during processing:', err);
      } finally {
        this.isProcessing = false;
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stop the worker.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[QueueWorker] Stopped');
    }
  }

  /**
   * Process a single batch of jobs immediately (useful for testing).
   */
  async processNow(): Promise<number> {
    let count = 0;
    let processed = true;

    while (processed) {
      processed = await this.queue.processOne();
      if (processed) count++;
    }

    return count;
  }
}
