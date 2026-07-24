// ============================================================================
// Scheduled Jobs — Periodic maintenance tasks
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { ReservationService } from '@/services/reservation.service';
import { ReconciliationService } from '@/services/reconciliation.service';
import { JobQueue } from '@/lib/queue/job-queue';
import type { Job } from '@/lib/queue/job-queue';

/**
 * Registers all scheduled/recurring job handlers with the queue.
 */
export function registerScheduledJobs(
  queue: JobQueue,
  supabase: SupabaseClient,
): void {
  const reservationService = new ReservationService(supabase);
  const reconciliationService = new ReconciliationService(supabase);

  // Job: Expire stale wallet reservations
  queue.registerHandler('expire_reservations', async (_job: Job) => {
    const count = await reservationService.expireStale();
    console.log(`[ScheduledJob] Expired ${count} stale reservations`);
  });

  // Job: Full system reconciliation
  queue.registerHandler('reconciliation', async (_job: Job) => {
    const report = await reconciliationService.reconcileAll();
    console.log(
      `[ScheduledJob] Reconciliation complete — ` +
      `${report.consistentWallets}/${report.totalWallets} consistent`,
    );
    if (report.inconsistentWallets > 0) {
      console.error(
        `[ScheduledJob] WARNING: ${report.inconsistentWallets} inconsistent wallets detected!`,
      );
    }
  });

  // Job: Recover stale queue locks (workers that crashed)
  queue.registerHandler('recover_stale_jobs', async (_job: Job) => {
    const recovered = await queue.recoverStaleJobs(15);
    if (recovered > 0) {
      console.log(`[ScheduledJob] Recovered ${recovered} stale jobs`);
    }
  });

  // Job: Provider health check refresh
  queue.registerHandler('health_check_refresh', async (_job: Job) => {
    // This simply logs — actual health data is recorded by the HealthMonitor
    // during real API calls. This job is a placeholder for future proactive pings.
    console.log('[ScheduledJob] Health check refresh completed');
  });
}

/**
 * Enqueues the standard periodic jobs.
 * Called once at application startup or via cron.
 */
export async function enqueuePeriodicJobs(queue: JobQueue): Promise<void> {
  const jobs = [
    { type: 'expire_reservations', payload: {}, priority: 5 },
    { type: 'recover_stale_jobs', payload: {}, priority: 3 },
    { type: 'health_check_refresh', payload: {}, priority: 1 },
  ];

  for (const job of jobs) {
    await queue.enqueue(job);
  }

  console.log(`[ScheduledJobs] Enqueued ${jobs.length} periodic jobs`);
}
