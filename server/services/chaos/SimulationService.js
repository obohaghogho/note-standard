const { Worker } = require('worker_threads');
const path = require('path');
const supabase = require("../../config/database");
const logger = require("../../utils/logger");

/**
 * Simulation Service (DFOS v6.0 Phase 4)
 * Orchestrates adversarial simulations across isolated workers.
 */
class SimulationService {
    /**
     * Triggers a deterministic scenario run.
     * @param {string} scenarioName - Template name from simulation_scenarios
     * @param {Object} baseRates - Reference ground truth (from SnapshotService)
     * @param {Object} legacyRates - Legacy cache rates for drift comparison
     */
    async runScenario(scenarioName, baseRates, legacyRates) {
        try {
            // 1. Fetch Scenario Template
            const { data: scenario, error } = await supabase
                .from("simulation_scenarios")
                .select("*")
                .eq("name", scenarioName)
                .single();

            if (error || !scenario) throw new Error(`Scenario ${scenarioName} not found.`);

            // 2. Launch Isolated Worker
            return new Promise((resolve, reject) => {
                const worker = new Worker(path.join(__dirname, '../../workers/simulationWorker.js'), {
                    workerData: {
                        scenarioId: scenario.id,
                        seed: scenario.base_seed,
                        baseRates,
                        legacyRates
                    }
                });

                worker.on('message', async (result) => {
                    if (result.success) {
                        await this._persistResults(result);
                        resolve(result);
                    } else {
                        reject(new Error(result.error));
                    }
                });

                worker.on('error', reject);
                worker.on('exit', (code) => {
                    if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
                });
            });
        } catch (err) {
            logger.error(`[SimulationService] Scenario ${scenarioName} Failed: ${err.message}`);
            throw err;
        }
    }

    /**
     * Persists outcome to Simulation Ledger (Audit Path)
     */
    async _persistResults(result) {
        const { error } = await supabase
            .from("simulation_ledger")
            .insert({
                scenario_id: result.scenarioId,
                run_seed: result.seed,
                injected_failures: result.injected_failures,
                shadow_decision: result.shadow_decision,
                relational_metrics: result.relational_metrics,
                outcome_classification: result.outcome_classification
            });

        if (error) {
            logger.error(`[SimulationService] Failed to persist ledger: ${error.message}`);
        } else {
            logger.info(`[SimulationService] Scored Result: ${result.outcome_classification} for Scenario ${result.scenarioId}`);
        }
    }
}

module.exports = new SimulationService();
