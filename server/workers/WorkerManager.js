const supabase = require('../config/database');
const logger = require('../utils/logger');
const CausalWorker = require('./CausalWorker');
const crypto = require('crypto');

/**
 * Worker Manager
 * Orchestrates N sharded CausalWorkers and handles failover/rebalancing.
 */
class WorkerManager {
    constructor() {
        this.workerId = crypto.randomUUID();
        this.shards = [];
        this.SHARD_COUNT = 4;
        this.CHECK_INTERVAL = 30000; // 30 seconds
    }

    start() {
        logger.info(`[WorkerManager] Initializing Global Worker ${this.workerId} (Total Shards: ${this.SHARD_COUNT})...`);
        this.rebalanceAndSpawn();
        setInterval(() => this.rebalanceAndSpawn(), this.CHECK_INTERVAL);
    }

    async rebalanceAndSpawn() {
        try {
            // 1. Fetch current lease status
            const { data: leases, error } = await supabase
                .from('system_shard_leases')
                .select('*');

            if (error) throw error;

            for (const lease of leases) {
                const isExpired = new Date(lease.expires_at) < new Date();
                const isOwnedByMe = lease.owner_id === this.workerId;
                
                // If the shard is empty or expired, attempt to take it
                if (!lease.owner_id || isExpired) {
                    if (!this.shards.find(s => s.shardId === lease.shard_id)) {
                        logger.warn(`[WorkerManager] Shard ${lease.shard_id} is ${isExpired ? 'EXPIRED' : 'ORPHAN'}. Attempting takeover...`);
                        await this.spawnWorker(lease.shard_id);
                    }
                }
            }
        } catch (err) {
            logger.error('[WorkerManager] Rebalance failed:', err.message);
        }
    }

    async spawnWorker(shardId) {
        const worker = new CausalWorker(this.workerId, shardId);
        this.shards.push(worker);
        
        // CausalWorker.start will attempt to acquire the fenced lease
        worker.start().catch(err => {
            logger.error(`[WorkerManager] Worker for Shard ${shardId} crashed:`, err.message);
            this.shards = this.shards.filter(s => s.shardId !== shardId);
        });
    }
}

module.exports = new WorkerManager();
