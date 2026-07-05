const fs = require('fs');
const path = require('path');

const ROOT_DIR = 'd:\\Users\\Manuel\\OneDrive\\Desktop\\note-standard';
const data = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'select_star_report.json'), 'utf8'));

// Classification function
function classify(file) {
    const lowerFile = file.toLowerCase().replace(/\\/g, '/');
    
    // Scripts & Maintenance
    if (
        lowerFile.includes('/scripts/') || 
        lowerFile.includes('/scratch/') || 
        lowerFile.includes('/tools/') || 
        lowerFile.includes('tmp_') || 
        lowerFile.includes('check_') || 
        lowerFile.includes('verify_') || 
        lowerFile.includes('investigate_') || 
        lowerFile.includes('fix_user_') || 
        lowerFile.includes('isolate-test') ||
        lowerFile.includes('wipe-data') ||
        lowerFile.includes('ensure_profile') ||
        lowerFile.includes('final_check')
    ) {
        return 'Scripts, Diagnostics & Maintenance';
    }

    // Admin Tools
    if (lowerFile.includes('admincontroller.js') || lowerFile.includes('/admin/')) {
        return 'Admin Tools';
    }

    // Automated Production Workers
    if (lowerFile.includes('/workers/')) {
        return 'Production Background Workers';
    }

    // Production User Flows
    if (
        lowerFile.includes('/mobile/') || 
        lowerFile.includes('/frontend/') || 
        lowerFile.includes('/client/') || 
        lowerFile.includes('/shared/') || 
        lowerFile.includes('/routes/') || 
        lowerFile.includes('/controllers/') || 
        lowerFile.includes('/services/')
    ) {
        return 'Production User Flows';
    }

    return 'Unclassified';
}

const categorizedData = {
    'Production User Flows': [],
    'Production Background Workers': [],
    'Admin Tools': [],
    'Scripts, Diagnostics & Maintenance': [],
    'Unclassified': []
};

data.forEach(item => {
    const category = classify(item.file);
    categorizedData[category].push(item);
});

let md = `# \`.select('*')\` Production vs. Maintenance Analysis\n\n`;
md += `This report classifies every \`.select('*')\` call to highlight which ones directly impact the production user experience versus those used for admin tools, background jobs, or one-off scripts.\n\n`;

for (const [category, items] of Object.entries(categorizedData)) {
    if (items.length === 0) continue;
    md += `## 🚀 ${category}\n`;
    
    if (category === 'Production User Flows') {
        md += `> [!IMPORTANT]\n> These calls are executed during active user sessions. Unpaginated \`.select('*')\` calls here directly impact user perceived latency and cause the highest spikes in Supabase egress bandwidth.\n\n`;
    } else if (category === 'Admin Tools') {
        md += `> [!NOTE]\n> These are used by administrators. While they can pull large datasets, the frequency of execution is much lower than user-facing flows.\n\n`;
    } else if (category === 'Scripts, Diagnostics & Maintenance') {
        md += `> [!TIP]\n> These calls do not affect production egress unless they are run frequently (e.g., via a cron job). Most of these are safe to ignore for bandwidth optimization.\n\n`;
    } else if (category === 'Production Background Workers') {
        md += `> [!WARNING]\n> These run autonomously 24/7. Even if they are limited or small, high-frequency polling can slowly drain egress limits.\n\n`;
    }

    // Group by Risk then Table
    const byRisk = {};
    items.forEach(item => {
        if (!byRisk[item.risk]) byRisk[item.risk] = {};
        if (!byRisk[item.risk][item.tableName]) byRisk[item.risk][item.tableName] = [];
        byRisk[item.risk][item.tableName].push(item);
    });

    for (const risk of ['High', 'Medium', 'Low', 'Low (Paginated/Single)']) {
        if (!byRisk[risk]) continue;
        md += `### Risk: ${risk}\n\n`;
        for (const [table, calls] of Object.entries(byRisk[risk])) {
            md += `**Table:** \`${table}\`\n`;
            calls.forEach(c => {
                md += `- \`${c.file.replace(/\\/g, '/')}\` (Line ${c.lineNum})\n`;
            });
            md += `\n`;
        }
    }
}

fs.writeFileSync('C:\\Users\\hp\\.gemini\\antigravity\\brain\\c47dfe6d-0ddd-4b50-9361-1d1bb70ce04a\\select_star_categorized.md', md);
