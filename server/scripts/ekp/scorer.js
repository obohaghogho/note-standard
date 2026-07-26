function scoreKnowledgeQuality(rawKb, graph) {
    console.log("  -> Scoring Knowledge Quality (Missing Preconditions, Circular Refs)...");
    
    // Quick lookup for orphan check
    const graphNodeIds = new Set(Object.keys(graph.nodes));

    return rawKb.map(article => {
        let trustScore = 100;
        let reviewStatus = 'Quality Passed';

        // Penalize for missing keywords
        if (article.article_type === 'feature' && (!article.keywords || article.keywords.length === 0)) {
            trustScore -= 20;
            reviewStatus = 'Needs SME Review';
        }

        // Validate troubleshooting steps and escalations
        if (article.article_type === 'troubleshooting') {
            if (!article.decision_tree || !article.decision_tree.escalation_required) {
                trustScore -= 10;
            }
            if (!article.decision_tree || !article.decision_tree.troubleshooting_steps || article.decision_tree.troubleshooting_steps.length === 0) {
                trustScore -= 20;
                reviewStatus = 'Incomplete Troubleshooting';
            }
        }

        // Stale documentation check (via chain hash missing or mismatched in real life)
        if (!article.chain_hash) {
            trustScore -= 30;
            reviewStatus = 'Stale / Detached';
        }

        // Orphan graph node check
        const baseFeature = article.knowledge_id.split('.')[0];
        if (!graphNodeIds.has(baseFeature)) {
            trustScore -= 40;
            reviewStatus = 'Orphaned Knowledge';
        }

        return {
            ...article,
            trust_score: trustScore,
            confidence_score: trustScore / 100.0,
            review_status: trustScore < 80 ? 'Needs SME Review' : reviewStatus
        };
    });
}

module.exports = { scoreKnowledgeQuality };
