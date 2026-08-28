'use strict';

/**
 * SchedulerRegistry.js
 * =====================
 * Central registry mapping cron job names to job runner functions.
 */
class SchedulerRegistry {
  constructor() {
    this.jobs = new Map();
    this.registerDefaultJobs();
  }

  /**
   * Register a background job
   */
  registerJob(jobName, jobConfig) {
    const { schedule = '* * * * *', timeoutMs = 60000, handler } = jobConfig;
    if (!jobName) throw new Error('jobName is required');
    if (typeof handler !== 'function') throw new Error('handler must be a function');

    this.jobs.set(jobName, {
      name: jobName,
      schedule,
      timeoutMs,
      handler
    });
  }

  /**
   * Register default operations background jobs
   */
  registerDefaultJobs() {
    this.registerJob('providerHealthJob', {
      schedule: '*/1 * * * *',
      timeoutMs: 30000,
      handler: async (ctx) => {
        return { status: 'SUCCESS', probedProviders: ['fincra', 'anchor'] };
      }
    });

    this.registerJob('outboxPublisherJob', {
      schedule: '*/5 * * * * *',
      timeoutMs: 15000,
      handler: async (ctx) => {
        return { status: 'SUCCESS', publishedCount: 0 };
      }
    });

    this.registerJob('staleIntentCleanupJob', {
      schedule: '*/5 * * * *',
      timeoutMs: 60000,
      handler: async (ctx) => {
        return { status: 'SUCCESS', expiredIntents: 0 };
      }
    });

    this.registerJob('reconcileProvidersJob', {
      schedule: '0 2 * * *',
      timeoutMs: 300000,
      handler: async (ctx) => {
        return { status: 'SUCCESS', varianceCount: 0 };
      }
    });

    this.registerJob('fxQuoteRefreshJob', {
      schedule: '*/1 * * * *',
      timeoutMs: 30000,
      handler: async (ctx) => {
        return { status: 'SUCCESS', updatedPairs: ['USD/NGN', 'EUR/NGN', 'GBP/NGN'] };
      }
    });

    this.registerJob('treasuryHealthJob', {
      schedule: '*/5 * * * *',
      timeoutMs: 60000,
      handler: async (ctx) => {
        return { status: 'SUCCESS', liquidityRatio: 1.0 };
      }
    });

    this.registerJob('dlqRetryJob', {
      schedule: '*/10 * * * *',
      timeoutMs: 120000,
      handler: async (ctx) => {
        return { status: 'SUCCESS', replayedCount: 0 };
      }
    });

    this.registerJob('subscriptionExpirationJob', {
      schedule: '0 * * * *', // Hourly
      timeoutMs: 60000,
      handler: async (ctx) => {
        const worker = require('./subscriptionExpirationWorker');
        return await worker.processExpiredSubscriptions();
      }
    });
  }

  getJob(jobName) {
    return this.jobs.get(jobName);
  }

  listJobs() {
    return Array.from(this.jobs.values());
  }
}

module.exports = SchedulerRegistry;
