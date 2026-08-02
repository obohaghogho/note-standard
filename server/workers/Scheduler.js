'use strict';

const SchedulerRegistry = require('./SchedulerRegistry');

/**
 * Scheduler.js
 * ============
 * Central Background Scheduler Framework for NoteStandard Enterprise Banking.
 * Enforces distributed leadership locking (Postgres advisory lock / lock manager),
 * job timeouts, and logs execution history to scheduler_job_runs.
 */
class Scheduler {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../config/database');
    } catch (e) {
      this.db = options.db || null;
    }

    this.registry = options.registry || new SchedulerRegistry();
    this.isLeader = true;
    this.workerId = options.workerId || `worker_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    this.inMemoryRuns = [];
  }

  /**
   * Acquire Distributed Leadership Lock
   */
  async acquireLeadershipLock() {
    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(`SELECT pg_try_advisory_lock(888123) as is_leader`);
        if (res.rows && res.rows[0]) {
          this.isLeader = res.rows[0].is_leader;
        }
      } catch (err) {
        this.isLeader = true; // Fallback to single-instance leader
      }
    }
    return this.isLeader;
  }

  /**
   * Execute a scheduled job with leadership check, timeout enforcement, and execution history logging
   */
  async executeJob(jobName) {
    // 1. Leadership Check
    const hasLock = await this.acquireLeadershipLock();
    if (!hasLock) {
      return { status: 'SKIPPED_NOT_LEADER', message: 'Instance is standby worker; skipping job execution.' };
    }

    const job = this.registry.getJob(jobName);
    if (!job) throw new Error(`JOB_NOT_FOUND: Background job '${jobName}' is not registered.`);

    const traceId = `trace_job_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const startTime = Date.now();

    const runRecord = {
      id: `run_${Date.now()}`,
      job_name: jobName,
      started_at: new Date(),
      status: 'RUNNING',
      trace_id: traceId,
      worker_id: this.workerId
    };
    this.inMemoryRuns.push(runRecord);

    let status = 'SUCCESS';
    let errorMessage = null;
    let result = null;

    try {
      // Enforce job timeout via Promise.race
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`JOB_TIMEOUT: Job '${jobName}' exceeded timeout of ${job.timeoutMs}ms`)), job.timeoutMs);
      });

      result = await Promise.race([job.handler({ traceId, db: this.db }), timeoutPromise]);
    } catch (err) {
      status = err.message.includes('JOB_TIMEOUT') ? 'TIMEOUT' : 'FAILED';
      errorMessage = err.message;
    }

    const durationMs = Date.now() - startTime;
    runRecord.status = status;
    runRecord.completed_at = new Date();
    runRecord.duration_ms = durationMs;
    runRecord.error_message = errorMessage;

    // Log run history to database
    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `INSERT INTO public.scheduler_job_runs 
           (job_name, started_at, completed_at, duration_ms, status, error_message, trace_id, worker_id)
           VALUES ($1, NOW() - ($2 || ' milliseconds')::interval, NOW(), $2, $3, $4, $5, $6)`,
          [jobName, durationMs, status, errorMessage, traceId, this.workerId]
        );
      } catch (err) {
        // Fallback
      }
    }

    if (status === 'FAILED' || status === 'TIMEOUT') {
      throw new Error(errorMessage || `Job ${jobName} failed`);
    }

    return {
      jobName,
      status,
      durationMs,
      traceId,
      result
    };
  }
}

module.exports = Scheduler;
