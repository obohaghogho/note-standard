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
        dependencies: [],
        feature_flags: [],
        permissions: [],
        rate_limits: [],
        validation_rules: [],
        providers: [],
        retry_logic: false,
        fallback_behavior: false,
        background_jobs: [],
        cron_tasks: [],
        push_events: [],
        websocket_events: []
    };

    // Very rudimentary AST/Regex Simulation for extraction
    if (type === 'route') {
        const routeMatches = content.match(/router\.(get|post|put|delete|patch)\(['"`](.*?)['"`]/g) || [];
        facts.endpoints = routeMatches.map(m => m.replace('router.', '').replace(/['"`\)]/g, '').replace('(', ' '));
        
        // Rate limits
        const rateLimitMatches = content.match(/rateLimiter|limiter/g) || [];
        if (rateLimitMatches.length > 0) facts.rate_limits.push('express-rate-limit');
    }

    if (type === 'controller' || type === 'service') {
        // Extract errors
        const errMatches = content.match(/error:\s*['"`](.*?)['"`]/g) || [];
        errMatches.forEach(m => {
            const match = m.match(/['"`](.*?)['"`]/);
            if (match) facts.errors.push(match[1]);
        });
        
        // Extract events (generalized, plus specific Websocket)
        const eventMatches = content.match(/emit\(['"`](.*?)['"`]/g) || [];
        eventMatches.forEach(m => {
            const match = m.match(/emit\(['"`](.*?)['"`]/);
            if (match) facts.events.push(match[1]);
        });
        
        // Extract specific Websocket events
        const wsMatches = content.match(/emitToUser\(['"`](.*?)['"`]/g) || [];
        wsMatches.forEach(m => {
            const match = m.match(/emitToUser\(['"`](.*?)['"`]/);
            if (match) facts.websocket_events.push(match[1]);
        });

        // Extract dependencies (imports/requires)
        const depMatches = content.match(/require\(['"`](.*?)['"`]\)/g) || [];
        depMatches.forEach(m => {
            const match = m.match(/require\(['"`](.*?)['"`]\)/);
            if (match && !match[1].startsWith('.')) facts.dependencies.push(match[1]);
        });
        
        // Feature flags
        const flagMatches = content.match(/process\.env\.(FEATURE_[A-Z_]+)/g) || [];
        flagMatches.forEach(m => {
            const match = m.match(/process\.env\.(FEATURE_[A-Z_]+)/);
            if (match) facts.feature_flags.push(match[1]);
        });
        
        // Permission checks
        const permMatches = content.match(/permissions\.name',\s*['"`](.*?)['"`]/g) || [];
        permMatches.forEach(m => {
            const match = m.match(/['"`](.*?)['"`]/);
            if (match) facts.permissions.push(match[1]);
        });
        
        // Validation rules
        if (content.includes('Joi.') || content.includes('validator')) {
            facts.validation_rules.push('Schema validation present');
        }
        
        // Supported Providers
        const providerNames = ['Fincra', 'Paystack', 'Twilio', 'SendGrid', 'Supabase'];
        providerNames.forEach(provider => {
            if (content.includes(provider)) facts.providers.push(provider);
        });
        
        // Retry logic
        if (content.match(/while\s*\(.*?retries.*?\)/) || content.includes('retry')) {
            facts.retry_logic = true;
        }
        
        // Fallback behavior
        if (content.includes('LKG') || content.includes('fallback')) {
            facts.fallback_behavior = true;
        }
        
        // Background jobs
        if (content.match(/new Worker|Bull|Agenda/i)) {
            facts.background_jobs.push('Detected worker job queues');
        }
        
        // Cron tasks
        if (content.includes('cron.schedule') || content.includes('node-cron')) {
            facts.cron_tasks.push('Scheduled cron tasks detected');
        }
        
        // Push notification events
        const pushMatches = content.match(/createNotification\([\s\S]*?['"`](.*?)['"`]/g) || [];
        pushMatches.forEach(m => {
            const match = m.match(/['"`](.*?)['"`]/);
            if (match) facts.push_events.push(match[1]);
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
