/**
 * Enterprise Knowledge Platform (EKP) Pipeline
 * Acts as the centralized AI brain for NoteStandard.
 */
const { analyzeCodebase } = require('./analyzer');
const { buildFeatureGraph } = require('./graph');
const { generateKnowledge } = require('./generator');
const { scoreKnowledgeQuality } = require('./scorer');
const { logFeedbackLoops } = require('./feedback');
const { generateMachineDashboard } = require('./report');

async function runEKP() {
    console.log("🚀 Starting NoteStandard Enterprise Knowledge Platform (EKP)...");

    try {
        console.log("\n[1/6] Layer 1 & 2: Static Analysis (Code -> Facts & UI)...");
        const facts = await analyzeCodebase();

        console.log("\n[2/6] Layer 3: Building Dependency Graph...");
        const graph = buildFeatureGraph(facts);

        console.log("\n[3/6] Layer 4: LLM Generation (Intents, Workflows, Policies)...");
        const rawKb = await generateKnowledge(graph);

        console.log("\n[4/6] Layer 5: Enterprise Quality Scorer...");
        const scoredKb = scoreKnowledgeQuality(rawKb, graph);

        console.log("\n[5/6] Layer 6: Processing Feedback & Learning Loops...");
        logFeedbackLoops(scoredKb);

        console.log("\n[6/6] Layer 7: Benchmarks & Dashboard Generation...");
        generateMachineDashboard(scoredKb, facts, graph);

        console.log("\n✅ EKP Pipeline execution completed successfully.");
    } catch (e) {
        console.error("❌ EKP Pipeline failed:", e);
    }
}

runEKP();
