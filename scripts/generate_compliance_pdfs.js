const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUTPUT_DIR = path.join(__dirname, '..', 'ANCHOR_COMPLIANCE_RESUBMISSION');
const ID_DIR = path.join(OUTPUT_DIR, '07_DIRECTOR_AND_UBO_IDENTIFICATION');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(ID_DIR)) {
  fs.mkdirSync(ID_DIR, { recursive: true });
}

// Global Styling Template
function wrapHtml(title, documentCode, effectiveDate, version, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @page {
    size: A4;
    margin: 20mm 15mm 20mm 15mm;
  }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #1e293b;
    line-height: 1.6;
    font-size: 10.5pt;
    margin: 0;
    padding: 0;
  }
  
  .cover-page {
    page-break-after: always;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding-top: 40px;
  }
  .cover-header {
    border-bottom: 3px solid #0f172a;
    padding-bottom: 20px;
  }
  .company-title {
    font-size: 24pt;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: 0.5px;
    margin: 0;
    text-transform: uppercase;
  }
  .company-subtitle {
    font-size: 11pt;
    color: #475569;
    margin-top: 5px;
    font-weight: 600;
  }
  
  .doc-title-container {
    margin-top: 80px;
    margin-bottom: 80px;
  }
  .doc-badge {
    display: inline-block;
    background-color: #0f172a;
    color: #ffffff;
    font-size: 9pt;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: 4px;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 15px;
  }
  .doc-main-title {
    font-size: 26pt;
    font-weight: 800;
    color: #1e3e62;
    line-height: 1.2;
    margin: 0 0 15px 0;
  }
  .doc-desc {
    font-size: 12pt;
    color: #334155;
    max-width: 90%;
  }

  .meta-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 40px;
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }
  .meta-table td {
    padding: 10px 14px;
    font-size: 9.5pt;
    border-bottom: 1px solid #e2e8f0;
  }
  .meta-table tr:last-child td {
    border-bottom: none;
  }
  .meta-label {
    font-weight: 700;
    color: #475569;
    width: 35%;
  }
  .meta-val {
    color: #0f172a;
    font-weight: 600;
  }

  .section-title {
    font-size: 15pt;
    font-weight: 700;
    color: #0f172a;
    border-bottom: 2px solid #cbd5e1;
    padding-bottom: 6px;
    margin-top: 28px;
    margin-bottom: 14px;
    page-break-after: avoid;
  }
  .subsection-title {
    font-size: 12pt;
    font-weight: 700;
    color: #1e3e62;
    margin-top: 20px;
    margin-bottom: 8px;
    page-break-after: avoid;
  }
  p {
    margin-top: 0;
    margin-bottom: 12px;
    text-align: justify;
  }
  ul, ol {
    margin-top: 0;
    margin-bottom: 14px;
    padding-left: 24px;
  }
  li {
    margin-bottom: 6px;
  }

  .callout-box {
    background-color: #f1f5f9;
    border-left: 4px solid #0f172a;
    padding: 12px 16px;
    margin: 16px 0;
    border-radius: 0 6px 6px 0;
    font-size: 10pt;
  }
  .callout-box.warning {
    background-color: #fffbebf5;
    border-left-color: #d97706;
  }
  
  table.data-table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 9.5pt;
  }
  table.data-table th {
    background-color: #0f172a;
    color: #ffffff;
    padding: 8px 12px;
    font-weight: 700;
    text-align: left;
    border: 1px solid #0f172a;
  }
  table.data-table td {
    padding: 8px 12px;
    border: 1px solid #cbd5e1;
  }
  table.data-table tr:nth-child(even) {
    background-color: #f8fafc;
  }

  .header-running {
    position: fixed;
    top: -12mm;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #94a3b8;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
  }
  .footer-running {
    position: fixed;
    bottom: -12mm;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #94a3b8;
    border-top: 1px solid #e2e8f0;
    padding-top: 4px;
  }
</style>
</head>
<body>

  <!-- COVER PAGE -->
  <div class="cover-page">
    <div class="cover-header">
      <div class="company-title">Jossy Digital Technologies Ltd.</div>
      <div class="company-subtitle">RC: 9586407 &bull; Regulated Financial Technology Infrastructure</div>
    </div>
    
    <div class="doc-title-container">
      <div class="doc-badge">${documentCode}</div>
      <h1 class="doc-main-title">${title}</h1>
      <div class="doc-desc">Corporate Legal, Regulatory Compliance &amp; Risk Governance Framework</div>
    </div>

    <div>
      <table class="meta-table">
        <tr>
          <td class="meta-label">Document Title:</td>
          <td class="meta-val">${title}</td>
        </tr>
        <tr>
          <td class="meta-label">Legal Entity:</td>
          <td class="meta-val">Jossy Digital Technologies Ltd. (RC 9586407)</td>
        </tr>
        <tr>
          <td class="meta-label">Brand / Product:</td>
          <td class="meta-val">NoteStandard</td>
        </tr>
        <tr>
          <td class="meta-label">Managing Director &amp; CEO:</td>
          <td class="meta-val">Aghogho Jossy Oboh</td>
        </tr>
        <tr>
          <td class="meta-label">Effective Date:</td>
          <td class="meta-val">${effectiveDate}</td>
        </tr>
        <tr>
          <td class="meta-label">Version / Status:</td>
          <td class="meta-val">Version ${version} &bull; Approved</td>
        </tr>
        <tr>
          <td class="meta-label">Submission Target:</td>
          <td class="meta-val">Anchor Software Ltd Legal &amp; Compliance Review Team</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- MAIN BODY CONTENT -->
  <div style="margin-top: 10px;">
    ${bodyHtml}
  </div>

</body>
</html>`;
}

console.log("Template helper initialized.");
