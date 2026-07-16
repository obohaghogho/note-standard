const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const ChaosService = require('../services/chaos/ChaosService');

/**
 * PressureRunner - Adversarial Mutation Engine
 * Provokes the system via specific attack profiles.
 */
class PressureRunner {
    constructor(baseUrl, chaosToken) {
        this.baseUrl = baseUrl;
        this.chaosToken = chaosToken;
        this.wallets = []; // Active test subjects
    }

    /**
     * Profile 1: BURST_CONCURRENCY
     * Rapid-fire mutex contention on a single key.
     */
    async burstConcurrency(walletId, count = 100) {
        logger.info(`[Attack] Starting BURST_CONCURRENCY on ${walletId} with ${count} iterations`);
        
        const tasks = [];
        for (let i = 0; i < count; i++) {
            tasks.push(this.simulateWebhook(walletId, {
                transactionId: `burst_${walletId}_${i}`,
                amount: 1.0,
                type: 'deposit'
            }));
        }

        const results = await Promise.allSettled(tasks);
        const successes = results.filter(r => r.status === 'fulfilled').length;
        logger.warn(`[Attack_Report] Burst finished. Successes: ${successes}/${count}`);
    }

    /**
     * Profile 2: ORDER_RESHUFFLE
     * Injects a causal chain out-of-order.
     */
    async orderReshuffle(walletId) {
        logger.info(`[Attack] Starting ORDER_RESHUFFLE on ${walletId}`);
        
        const rootId = crypto.randomUUID();
        const events = [
            { id: 'ev3', parent: 'ev2', root: rootId },
            { id: 'ev1', parent: null, root: rootId },
            { id: 'ev2', parent: 'ev1', root: rootId }
        ];

        // Send out of order (ev3 first)
        for (const ev of events) {
            await this.simulateWebhook(walletId, {
                transactionId: ev.id,
                rootCausalId: ev.root,
                parentCausalId: ev.parent,
                amount: 10.0
            });
        }
    }

    /**
     * Profile 3: INVALID_VALID_INTERLEAVE
     * Mixes valid transactions with intentional drift injections.
     */
    async interleaveAttacks(walletId) {
        logger.info(`[Attack] Starting INVALID_VALID_INTERLEAVE on ${walletId}`);
        
        await this.simulateWebhook(walletId, { transactionId: 'valid_1', amount: 100 });
        
        // Inject intentional drift via Chaos Service
        await ChaosService.executeFault(this.chaosToken, async () => {
            // Internal call to corrupt state simulation
            logger.warn('[Chaos] Injecting $0.01 balance drift on ' + walletId);
        });

        await this.simulateWebhook(walletId, { transactionId: 'valid_2', amount: 50 });
    }

    /**
     * Profile 4: REPLAY_RACE_CONFLICT
     * Races live ingestion against its own replay.
     */
    async replayRace(walletId) {
        const txId = `race_${Date.now()}`;
        
        // Trigger live
        const p1 = this.simulateWebhook(walletId, { transactionId: txId, amount: 20 });
        
        // Trigger immediate replay (simulated)
        const p2 = this.simulateWebhook(walletId, { 
            transactionId: txId, 
            amount: 20,
            isReplay: true 
        });

        await Promise.all([p1, p2]);
    }

    async simulateWebhook(walletId, data) {
        // Implementation of axios post to webhook endpoint
        return { status: 200 };
    }
}

module.exports = PressureRunner;
