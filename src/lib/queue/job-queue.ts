// ============================================================================
// Database-Backed Job Queue
// ============================================================================
// Uses the `job_queue` table for persistence.
// Designed for simple, reliable background processing without Redis.
// Supports: priority, retries, scheduled execution, dead-letter tracking.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { JobStatus } from '@/types';
import { jobReference } from '@/lib/utils/reference';

export interface JobPayload {
  type: string;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  scheduledFor?: Date;
}

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  scheduledFor: string;
  createdAt: string;
}

export type JobHandler = (job: Job) => Promise<void>;

export class JobQueue {
  private handlers = new Map<string, JobHandler>();
  private instanceId: string;

  constructor(private readonly supabase: SupabaseClient) {
    this.instanceId = `worker_${jobReference()}`;
  }

  /**
   * Register a handler for a job type.
   */
  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Enqueue a new job for later processing.
   */
  async enqueue(job: JobPayload): Promise<string> {
    const { data, error } = await this.supabase
      .from('job_queue')
      .insert({
        type: job.type,
        payload: job.payload,
        priority: job.priority ?? 0,
        max_attempts: job.maxAttempts ?? 3,
        scheduled_for: (job.scheduledFor ?? new Date()).toISOString(),
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to enqueue job: ${error.message}`);
    return data.id;
  }

  /**
   * Dequeue and lock the next available job.
   * Uses `FOR UPDATE SKIP LOCKED` semantics via a two-step process.
   */
  async dequeue(): Promise<Job | null> {
    // Find the next unlocked pending job that is ready to run
    const { data: pending, error: findError } = await this.supabase
      .from('job_queue')
      .select('id')
      .eq('status', JobStatus.PENDING)
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('scheduled_for', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (findError || !pending) return null;

    // Attempt to lock it (optimistic concurrency)
    const { data: locked, error: lockError } = await this.supabase
      .from('job_queue')
      .update({
        status: JobStatus.PROCESSING,
        locked_by: this.instanceId,
        locked_at: new Date().toISOString(),
      })
      .eq('id', pending.id)
      .eq('status', JobStatus.PENDING)
      .select('*')
      .maybeSingle();

    if (lockError || !locked) return null;

    // Increment attempts
    const newAttempts = (locked.attempts ?? 0) + 1;
    await this.supabase
      .from('job_queue')
      .update({ attempts: newAttempts })
      .eq('id', locked.id);

    return {
      id: locked.id,
      type: locked.type,
      payload: locked.payload,
      status: locked.status as JobStatus,
      priority: locked.priority,
      attempts: newAttempts,
      maxAttempts: locked.max_attempts,
      lastError: locked.last_error,
      scheduledFor: locked.scheduled_for,
      createdAt: locked.created_at,
    };
  }

  /**
   * Mark a job as completed.
   */
  async complete(jobId: string): Promise<void> {
    await this.supabase
      .from('job_queue')
      .update({
        status: JobStatus.COMPLETED,
        completed_at: new Date().toISOString(),
        locked_by: null,
        locked_at: null,
      })
      .eq('id', jobId);
  }

  /**
   * Mark a job as failed. If retries remain, set it back to pending.
   */
  async fail(jobId: string, error: string, attempts: number, maxAttempts: number): Promise<void> {
    const isFinal = attempts >= maxAttempts;

    await this.supabase
      .from('job_queue')
      .update({
        status: isFinal ? JobStatus.DEAD : JobStatus.PENDING,
        last_error: error,
        locked_by: null,
        locked_at: null,
        // Exponential backoff: wait 2^attempts seconds before retrying
        scheduled_for: isFinal
          ? undefined
          : new Date(Date.now() + Math.pow(2, attempts) * 1000).toISOString(),
      })
      .eq('id', jobId);
  }

  /**
   * Process one job from the queue.
   * Returns true if a job was processed, false if queue is empty.
   */
  async processOne(): Promise<boolean> {
    const job = await this.dequeue();
    if (!job) return false;

    const handler = this.handlers.get(job.type);
    if (!handler) {
      console.error(`[JobQueue] No handler registered for job type: ${job.type}`);
      await this.fail(job.id, `No handler for type: ${job.type}`, job.attempts, job.maxAttempts);
      return true;
    }

    try {
      await handler(job);
      await this.complete(job.id);
      console.log(`[JobQueue] Completed job ${job.id} (${job.type})`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[JobQueue] Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}): ${errorMsg}`);
      await this.fail(job.id, errorMsg, job.attempts, job.maxAttempts);
    }

    return true;
  }

  /**
   * Get queue statistics.
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    dead: number;
  }> {
    const statuses = ['pending', 'processing', 'completed', 'failed', 'dead'] as const;
    const result: Record<string, number> = {};

    for (const status of statuses) {
      const { count } = await this.supabase
        .from('job_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);
      result[status] = count ?? 0;
    }

    return result as {
      pending: number;
      processing: number;
      completed: number;
      failed: number;
      dead: number;
    };
  }

  /**
   * Recover stale locked jobs (worker crashed without completing).
   * Any job locked for more than `staleLockMinutes` is reset to pending.
   */
  async recoverStaleJobs(staleLockMinutes = 15): Promise<number> {
    const cutoff = new Date(Date.now() - staleLockMinutes * 60 * 1000);

    const { data } = await this.supabase
      .from('job_queue')
      .update({
        status: JobStatus.PENDING,
        locked_by: null,
        locked_at: null,
        last_error: 'Recovered from stale lock',
      })
      .eq('status', JobStatus.PROCESSING)
      .lt('locked_at', cutoff.toISOString())
      .select('id');

    return data?.length ?? 0;
  }
}
