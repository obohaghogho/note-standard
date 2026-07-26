function scoreKnowledgeQuality(rawKb, graph) {
    console.log("  -> Scoring Knowledge Quality (Missing Preconditions, Circular Refs)...");
    
    return rawKb.map(article => {
        // Mock Quality Scorer
        let trustScore = 100;
        let reviewStatus = 'Quality Passed';

        // Penalize for missing keywords or sparse source count
        if (article.article_type === 'feature' && (!article.keywords || article.keywords.length === 0)) {
            trustScore -= 20;
            reviewStatus = 'Needs SME Review';
        }

        if (article.decision_tree && !article.decision_tree.escalation_required) {
            trustScore -= 10;
        }

        return {
            ...article,
            trust_score: trustScore,
            review_status: reviewStatus
        };
    });
}

module.exports = { scoreKnowledgeQuality };
