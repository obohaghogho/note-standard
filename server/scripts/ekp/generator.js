const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function generateKnowledge(graph) {
    console.log("  -> Mocking LLM Knowledge Generation for EKP...");
    const rawKb = [];

    const generateGlobalId = (feature, sub) => `${feature}.${sub}`.toLowerCase().replace(/[^a-z0-9\.]/g, '');

    for (const [feature, data] of Object.entries(graph.nodes)) {
        if (!feature) continue;
        
        // 1. Feature Article
        rawKb.push({
            knowledge_id: generateGlobalId(feature, 'overview'),
            article_type: 'feature',
            knowledge_version: 1,
            title: `${feature.toUpperCase()} Overview`,
            review_status: 'Generated',
            platform_awareness: ['Web', 'Android', 'iOS'],
            chain_hash: crypto.createHash('md5').update(data.chain_hash).digest('hex'),
            content: `Overview for ${feature}.`,
            ui_elements: data.ui_elements
        });

        // 2. Hierarchical Intents (Troubleshooting)
        if (data.errors.length > 0) {
            data.errors.forEach(err => {
                rawKb.push({
                    knowledge_id: generateGlobalId(feature, `error.${err}`),
                    article_type: 'troubleshooting',
                    knowledge_version: 1,
                    title: `${feature} Error: ${err}`,
                    review_status: 'Generated',
                    decision_tree: {
                        question: `Why am I getting ${err}?`,
                        likely_cause: `System encountered ${err}`,
                        resolution: `Retry operation or escalate.`,
                        escalation_required: true
                    },
                    chain_hash: crypto.createHash('md5').update(data.chain_hash).digest('hex')
                });
            });
        }

        // 3. Conversation Examples
        rawKb.push({
            knowledge_id: generateGlobalId(feature, 'examples'),
            article_type: 'conversations',
            knowledge_version: 1,
            review_status: 'Generated',
            examples: [
                { persona: 'Simple', user: `How do I use ${feature}?`, ai: `Let me help you with ${feature}.` },
                { persona: 'Power', user: `What are the ${feature} API limits?`, ai: `The limits are...` },
                { persona: 'Confused', user: `${feature} is broken!`, ai: `I'm sorry you're having trouble. Let's check...` }
            ]
        });
    }

    return rawKb;
}

module.exports = { generateKnowledge };
