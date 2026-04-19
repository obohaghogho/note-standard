const { parentPort, workerData } = require('worker_threads');
const SnapshotService = require('../services/SnapshotService');
const DecisionEngine = require('../services/DecisionEngine');
const ChaosKernel = require('../services/chaos/ChaosKernel');
const SimulationMonitor = require('../services/chaos/SimulationMonitor');

/**
 * Shadow Simulation Loop (Isolated Runtime)
 */
async function runSimulation() {
    const { scenarioId, seed, baseRates, legacyRates } = workerData;
    
    try {
        // 1. Generate Deterministic Failure Injections
        let injections = ChaosKernel.generateDeterministicInjections(scenarioId, seed, baseRates);
        injections = ChaosKernel.enforceRealityAnchor(injections);

        // 2. Parallel Universe Evaluation (Shadow Snapshot)
        // Pass the injected results into the SnapshotService logic
        const shadowSnapshot = await SnapshotService.generateMarketSnapshot(injections);

        // 3. Shadow Decision Logic
        const decision = DecisionEngine.evaluate(shadowSnapshot, "simulation_wallet", legacyRates);

        // 4. Categorize Outcome & Metrics
        const outcome = SimulationMonitor.classifyOutcome(injections.meta, shadowSnapshot, decision);
        const metrics = SimulationMonitor.calculateRelationalMetrics(injections.meta, shadowSnapshot, decision);

        // 5. Report back
        parentPort.postMessage({
            success: true,
            scenarioId,
            seed,
            injected_failures: injections.meta,
            shadow_decision: decision,
            outcome_classification: outcome,
            relational_metrics: metrics
        });
    } catch (err) {
        parentPort.postMessage({
            success: false,
            error: err.message
        });
    }
}

runSimulation();
