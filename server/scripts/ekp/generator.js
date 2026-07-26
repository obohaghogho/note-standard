const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function generateKnowledge(graph) {
    console.log("  -> Mocking LLM Knowledge Generation for EKP...");
    const rawKb = [];

    const generateGlobalId = (feature, sub) => `${feature}.${sub}`.toLowerCase().replace(/[^a-z0-9\.]/g, '');

    for (const [feature, data] of Object.entries(graph.nodes)) {
        if (!feature) continue;
        
        // Context enriched with extracted behaviors
        let behavioralContext = `Dependencies: ${data.dependencies.join(', ')}. `;
        if (data.feature_flags.length > 0) behavioralContext += `Flags: ${data.feature_flags.join(', ')}. `;
        if (data.permissions.length > 0) behavioralContext += `Permissions Required: ${data.permissions.join(', ')}. `;
        if (data.rate_limits.length > 0) behavioralContext += `Rate Limited. `;
        if (data.validation_rules.length > 0) behavioralContext += `Validation Present. `;
        if (data.providers.length > 0) behavioralContext += `Providers: ${data.providers.join(', ')}. `;
        if (data.retry_logic) behavioralContext += `Has Retry Logic. `;
        if (data.fallback_behavior) behavioralContext += `Has LKG Fallback. `;
        if (data.background_jobs.length > 0) behavioralContext += `Uses Background Jobs. `;
        if (data.cron_tasks.length > 0) behavioralContext += `Has Scheduled Tasks. `;

        // 1. Feature Article
        rawKb.push({
            knowledge_id: generateGlobalId(feature, 'overview'),
            article_type: 'feature',
            knowledge_version: 1,
            title: `${feature.toUpperCase()} Overview`,
            review_status: 'Generated',
            platforms: ['Android', 'iOS', 'Web', 'Desktop', 'Admin', 'API'],
            chain_hash: crypto.createHash('md5').update(data.chain_hash).digest('hex'),
            content: `Overview for ${feature}. ${behavioralContext}`,
            ui_elements: data.ui_elements,
            keywords: [feature, ...data.providers, ...data.endpoints].filter(Boolean)
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
                    platforms: ['Android', 'iOS', 'Web', 'Desktop', 'Admin', 'API'],
                    decision_tree: {
                        question: `Why am I getting ${err}?`,
                        likely_cause: `System encountered ${err}`,
                        resolution: `Retry operation or escalate.`,
                        escalation_required: true,
                        troubleshooting_steps: ['Check network', 'Verify permissions', 'Retry']
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
            platforms: ['Android', 'iOS', 'Web', 'Desktop', 'Admin', 'API'],
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
