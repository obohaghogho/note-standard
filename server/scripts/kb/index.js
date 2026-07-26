/**
 * Main Orchestrator for Enterprise Knowledge Base Generation
 */
const { analyzeCodebase } = require('./analyzer');
const { buildFeatureGraph } = require('./graph');
const { generateKnowledge } = require('./generator');
const { validateKnowledge } = require('./validator');
const { runSimulationTests } = require('./simulator');
const { generateReport } = require('./report');

async function main() {
    console.log("Starting Enterprise Knowledge Generation Pipeline (v2)...");

    try {
        console.log("\n[1/6] Running Static Analyzer...");
        const facts = await analyzeCodebase();

        console.log("\n[2/6] Building Feature Graph...");
        const featureGraph = buildFeatureGraph(facts);

        console.log("\n[3/6] Generating LLM Documentation...");
        const kb = await generateKnowledge(featureGraph);

        console.log("\n[4/6] Validating Knowledge Base...");
        const validation = validateKnowledge(kb, facts);

        console.log("\n[5/6] Running AI Simulation Tests...");
        const simResults = await runSimulationTests(kb);

        console.log("\n[6/6] Generating Readiness Report...");
        generateReport(facts, featureGraph, kb, validation, simResults);

        console.log("\nPipeline completed successfully.");
    } catch (e) {
        console.error("Pipeline failed:", e);
    }
}

main();
