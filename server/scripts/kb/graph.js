const path = require('path');

function getFeatureNameFromPath(filePath) {
    const basename = path.basename(filePath, path.extname(filePath));
    return basename.replace('Controller', '').replace('Service', '').replace('Page', '').toLowerCase();
}

function buildFeatureGraph(facts) {
    console.log("  -> Constructing knowledge graph...");
    const graph = {
        nodes: {},
        relationships: []
    };

    // Helper to add nodes
    function addNode(featureName, data) {
        if (!graph.nodes[featureName]) {
            graph.nodes[featureName] = {
                id: featureName,
                endpoints: new Set(),
                errors: new Set(),
                events: new Set()
            };
        }
        
        if (data.endpoints) data.endpoints.forEach(e => graph.nodes[featureName].endpoints.add(e));
        if (data.errors) data.errors.forEach(e => graph.nodes[featureName].errors.add(e));
        if (data.events) data.events.forEach(e => graph.nodes[featureName].events.add(e));
    }

    // Process all extracted facts
    const allFacts = [...facts.routes, ...facts.controllers, ...facts.services, ...facts.components];
    
    allFacts.forEach(fact => {
        if (fact.endpoints.length === 0 && fact.errors.length === 0 && fact.events.length === 0) return; // Skip empty
        
        const feature = getFeatureNameFromPath(fact.file);
        addNode(feature, fact);
    });

    // Convert sets to arrays for JSON serialization
    Object.keys(graph.nodes).forEach(key => {
        graph.nodes[key].endpoints = Array.from(graph.nodes[key].endpoints);
        graph.nodes[key].errors = Array.from(graph.nodes[key].errors);
        graph.nodes[key].events = Array.from(graph.nodes[key].events);
    });

    // Mocking relationships for demonstration
    // Real implementation would parse imports/requires to build 'depends_on', 'uses', etc.
    const features = Object.keys(graph.nodes);
    if (features.includes('wallet') && features.includes('transaction')) {
        graph.relationships.push({ source: 'wallet', target: 'transaction', type: 'creates' });
    }
    if (features.includes('wallet') && features.includes('notification')) {
        graph.relationships.push({ source: 'wallet', target: 'notification', type: 'notifies' });
    }
    if (features.includes('chat') && features.includes('space')) {
        graph.relationships.push({ source: 'chat', target: 'space', type: 'depends_on' });
    }

    return graph;
}

module.exports = { buildFeatureGraph };
