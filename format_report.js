const fs = require('fs');
const path = require('path');

const ROOT_DIR = 'd:\\Users\\Manuel\\OneDrive\\Desktop\\note-standard';
const data = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'select_star_report.json'), 'utf8'));

// We want to group by risk, then table, then file.
// Or the prompt asks: "grouped by file and table name, and rank them by estimated egress risk"

let md = `# Comprehensive \`.select('*')\` Egress Risk Report\n\n`;
md += `This report lists every \`.select('*')\` call in the repository, ranked by egress risk (based on table volume and lack of pagination).\n\n`;

const riskGroups = ['High', 'Medium', 'Low', 'Low (Paginated/Single)'];

riskGroups.forEach(risk => {
    const items = data.filter(d => d.risk === risk);
    if (items.length === 0) return;

    md += `## Risk Level: ${risk}\n\n`;

    // Group by table
    const byTable = {};
    items.forEach(item => {
        if (!byTable[item.tableName]) byTable[item.tableName] = {};
        if (!byTable[item.tableName][item.file]) byTable[item.tableName][item.file] = [];
        byTable[item.tableName][item.file].push(item);
    });

    for (const [table, files] of Object.entries(byTable)) {
        md += `### Table: \`${table}\`\n\n`;
        for (const [file, calls] of Object.entries(files)) {
            md += `**File:** \`${file.replace(/\\/g, '/')}\`\n`;
            calls.forEach(c => {
                md += `- Line ${c.lineNum}: \`${c.codeSnippet}\`\n`;
            });
            md += `\n`;
        }
    }
});

fs.writeFileSync('C:\\Users\\hp\\.gemini\\antigravity\\brain\\c47dfe6d-0ddd-4b50-9361-1d1bb70ce04a\\select_star_calls.md', md);
