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
                chain_hash: data.hash // seed the chain hash
            };
        }
        
        const node = graph.nodes[featureName];
        if (data.endpoints) data.endpoints.forEach(e => node.endpoints.add(e));
        if (data.errors) data.errors.forEach(e => node.errors.add(e));
        if (data.events) data.events.forEach(e => node.events.add(e));
        if (data.dependencies) data.dependencies.forEach(e => node.dependencies.add(e));
        if (data.ui_elements) data.ui_elements.forEach(e => node.ui_elements.add(JSON.stringify(e)));
        
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
            if (dep.includes('Fincra') || dep.includes('Paystack') || dep.includes('Supabase')) {
                graph.relationships.push({ source: key, target: dep, type: 'provider_specific' });
            } else {
                graph.relationships.push({ source: key, target: dep, type: 'depends_on' });
            }
        });
        
        node.events.forEach(event => {
            graph.relationships.push({ source: key, target: 'socket_gateway', type: 'emits', details: event });
        });

        // Convert sets to arrays
        node.endpoints = Array.from(node.endpoints);
        node.errors = Array.from(node.errors);
        node.events = Array.from(node.events);
        node.dependencies = Array.from(node.dependencies);
        node.ui_elements = Array.from(node.ui_elements).map(e => JSON.parse(e));
    });

    return graph;
}

module.exports = { buildFeatureGraph };
