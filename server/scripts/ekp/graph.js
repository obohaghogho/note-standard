function buildFeatureGraph(facts) {
    console.log("  -> Constructing Deep Dependency Graph...");
    const graph = {
        nodes: {},
        relationships: []
    };

    function addNode(featureName, data) {
        if (!graph.nodes[featureName]) {
            graph.nodes[featureName] = {
                id: featureName,
                endpoints: new Set(),
                errors: new Set(),
                events: new Set(),
                ui_elements: new Set(),
                dependencies: new Set(),
                feature_flags: new Set(),
                permissions: new Set(),
                rate_limits: new Set(),
                validation_rules: new Set(),
                providers: new Set(),
                retry_logic: false,
                fallback_behavior: false,
                background_jobs: new Set(),
                cron_tasks: new Set(),
                push_events: new Set(),
                websocket_events: new Set(),
                chain_hash: data.hash // seed the chain hash
            };
        }
        
        const node = graph.nodes[featureName];
        if (data.endpoints) data.endpoints.forEach(e => node.endpoints.add(e));
        if (data.errors) data.errors.forEach(e => node.errors.add(e));
        if (data.events) data.events.forEach(e => node.events.add(e));
        if (data.dependencies) data.dependencies.forEach(e => node.dependencies.add(e));
        if (data.ui_elements) data.ui_elements.forEach(e => node.ui_elements.add(JSON.stringify(e)));
        if (data.feature_flags) data.feature_flags.forEach(e => node.feature_flags.add(e));
        if (data.permissions) data.permissions.forEach(e => node.permissions.add(e));
        if (data.rate_limits) data.rate_limits.forEach(e => node.rate_limits.add(e));
        if (data.validation_rules) data.validation_rules.forEach(e => node.validation_rules.add(e));
        if (data.providers) data.providers.forEach(e => node.providers.add(e));
        if (data.retry_logic) node.retry_logic = true;
        if (data.fallback_behavior) node.fallback_behavior = true;
        if (data.background_jobs) data.background_jobs.forEach(e => node.background_jobs.add(e));
        if (data.cron_tasks) data.cron_tasks.forEach(e => node.cron_tasks.add(e));
        if (data.push_events) data.push_events.forEach(e => node.push_events.add(e));
        if (data.websocket_events) data.websocket_events.forEach(e => node.websocket_events.add(e));
        
        // Accumulate hash for stale detection chain
        node.chain_hash += data.hash;
    }

    const allFacts = [...facts.routes, ...facts.controllers, ...facts.services, ...facts.components];
    
    allFacts.forEach(fact => {
        addNode(fact.feature, fact);
    });

    // Build Relationships
    Object.keys(graph.nodes).forEach(key => {
        const node = graph.nodes[key];
        
        // Derive relationships from dependencies and events
        node.dependencies.forEach(dep => {
            if (dep.includes('Fincra') || dep.includes('Paystack') || dep.includes('Supabase') || dep.includes('Twilio') || dep.includes('SendGrid')) {
                graph.relationships.push({ source: key, target: dep, type: 'provider_specific' });
            } else {
                graph.relationships.push({ source: key, target: dep, type: 'depends_on' });
            }
        });
        
        node.providers.forEach(provider => {
            graph.relationships.push({ source: key, target: provider, type: 'integrates_with' });
        });
        
        node.events.forEach(event => {
            graph.relationships.push({ source: key, target: 'socket_gateway', type: 'emits', details: event });
        });

        node.background_jobs.forEach(job => {
            graph.relationships.push({ source: key, target: 'queue_worker', type: 'enqueues_job' });
        });

        // Convert sets to arrays
        node.endpoints = Array.from(node.endpoints);
        node.errors = Array.from(node.errors);
        node.events = Array.from(node.events);
        node.dependencies = Array.from(node.dependencies);
        node.feature_flags = Array.from(node.feature_flags);
        node.permissions = Array.from(node.permissions);
        node.rate_limits = Array.from(node.rate_limits);
        node.validation_rules = Array.from(node.validation_rules);
        node.providers = Array.from(node.providers);
        node.background_jobs = Array.from(node.background_jobs);
        node.cron_tasks = Array.from(node.cron_tasks);
        node.push_events = Array.from(node.push_events);
        node.websocket_events = Array.from(node.websocket_events);
        node.ui_elements = Array.from(node.ui_elements).map(e => JSON.parse(e));
    });

    return graph;
}

module.exports = { buildFeatureGraph };
