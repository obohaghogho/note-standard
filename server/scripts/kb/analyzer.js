const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '../../');
const CLIENT_DIR = path.join(__dirname, '../../../client');

// Extract facts via regex
function analyzeFile(filePath, type) {
    const content = fs.readFileSync(filePath, 'utf8');
    const facts = {
        file: filePath,
        type: type,
        endpoints: [],
        errors: [],
        providers: [],
        events: []
    };

    // Very rudimentary static analysis via regex
    if (type === 'route') {
        const routeMatches = content.match(/router\.(get|post|put|delete|patch)\(['"`](.*?)['"`]/g);
        if (routeMatches) {
            facts.endpoints = routeMatches.map(m => {
                const parts = m.replace('router.', '').split('(');
                const method = parts[0].toUpperCase();
                const route = parts[1].replace(/['"`]/g, '');
                return `${method} ${route}`;
            });
        }
    }

    if (type === 'controller' || type === 'service') {
        const errorMatches = content.match(/res\.status\(\d+\)\.json\(\{\s*error:\s*['"`](.*?)['"`]/g) || [];
        const throwMatches = content.match(/throw new Error\(['"`](.*?)['"`]\)/g) || [];
        
        const extractedErrors = new Set();
        errorMatches.forEach(m => {
            const match = m.match(/error:\s*['"`](.*?)['"`]/);
            if (match && match[1]) extractedErrors.add(match[1]);
        });
        throwMatches.forEach(m => {
            const match = m.match(/throw new Error\(['"`](.*?)['"`]\)/);
            if (match && match[1]) extractedErrors.add(match[1]);
        });
        facts.errors = Array.from(extractedErrors);

        // Events
        const socketMatches = content.match(/io\.emit\(['"`](.*?)['"`]/g) || [];
        const toEmitMatches = content.match(/\.to\(.*?\)\.emit\(['"`](.*?)['"`]/g) || [];
        socketMatches.forEach(m => {
            const match = m.match(/emit\(['"`](.*?)['"`]/);
            if (match && match[1]) facts.events.push(match[1]);
        });
        toEmitMatches.forEach(m => {
            const match = m.match(/emit\(['"`](.*?)['"`]/);
            if (match && match[1]) facts.events.push(match[1]);
        });
    }

    return facts;
}

function crawlDirectory(dir, type, results) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            crawlDirectory(fullPath, type, results);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            results.push(analyzeFile(fullPath, type));
        }
    }
}

async function analyzeCodebase() {
    const facts = {
        routes: [],
        controllers: [],
        services: [],
        components: []
    };

    console.log("  -> Scanning routes...");
    crawlDirectory(path.join(SERVER_DIR, 'routes'), 'route', facts.routes);

    console.log("  -> Scanning controllers...");
    crawlDirectory(path.join(SERVER_DIR, 'controllers'), 'controller', facts.controllers);

    console.log("  -> Scanning services...");
    crawlDirectory(path.join(SERVER_DIR, 'services'), 'service', facts.services);

    console.log("  -> Scanning frontend pages...");
    crawlDirectory(path.join(CLIENT_DIR, 'src/pages'), 'page', facts.components);

    return facts;
}

module.exports = { analyzeCodebase };
