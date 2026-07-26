const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SERVER_DIR = path.join(__dirname, '../../');
const CLIENT_DIR = path.join(__dirname, '../../../client');

function hashContent(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}

function analyzeFile(filePath, type) {
    const content = fs.readFileSync(filePath, 'utf8');
    const basename = path.basename(filePath, path.extname(filePath));
    const featureName = basename.replace('Controller', '').replace('Service', '').replace('Page', '').toLowerCase();

    const facts = {
        file: filePath,
        type: type,
        feature: featureName,
        hash: hashContent(content),
        endpoints: [],
        errors: [],
        events: [],
        ui_elements: [],
        dependencies: []
    };

    // Very rudimentary AST/Regex Simulation for extraction
    if (type === 'route') {
        const routeMatches = content.match(/router\.(get|post|put|delete|patch)\(['"`](.*?)['"`]/g) || [];
        facts.endpoints = routeMatches.map(m => m.replace('router.', '').replace(/['"`\)]/g, '').replace('(', ' '));
    }

    if (type === 'controller' || type === 'service') {
        // Extract errors
        const errMatches = content.match(/error:\s*['"`](.*?)['"`]/g) || [];
        errMatches.forEach(m => {
            const match = m.match(/['"`](.*?)['"`]/);
            if (match) facts.errors.push(match[1]);
        });
        
        // Extract events
        const eventMatches = content.match(/emit\(['"`](.*?)['"`]/g) || [];
        eventMatches.forEach(m => {
            const match = m.match(/emit\(['"`](.*?)['"`]/);
            if (match) facts.events.push(match[1]);
        });
        
        // Extract dependencies (imports/requires)
        const depMatches = content.match(/require\(['"`](.*?)['"`]\)/g) || [];
        depMatches.forEach(m => {
            const match = m.match(/require\(['"`](.*?)['"`]\)/);
            if (match && !match[1].startsWith('.')) facts.dependencies.push(match[1]);
        });
    }

    if (type === 'component') {
        // Extract UI elements (buttons, dialogs, etc.)
        const btnMatches = content.match(/<button.*?>(.*?)<\/button>/g) || [];
        const labelMatches = content.match(/label=['"`](.*?)['"`]/g) || [];
        
        btnMatches.forEach(m => {
            const match = m.match(/>(.*?)<\/button>/);
            if (match && match[1] && !match[1].includes('<')) facts.ui_elements.push({ type: 'button', name: match[1].trim() });
        });

        labelMatches.forEach(m => {
            const match = m.match(/label=['"`](.*?)['"`]/);
            if (match) facts.ui_elements.push({ type: 'label', name: match[1] });
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

    console.log("  -> Scanning frontend pages/components (Extracting UI)...");
    crawlDirectory(path.join(CLIENT_DIR, 'src/pages'), 'component', facts.components);
    crawlDirectory(path.join(CLIENT_DIR, 'src/components'), 'component', facts.components);

    return facts;
}

module.exports = { analyzeCodebase };
