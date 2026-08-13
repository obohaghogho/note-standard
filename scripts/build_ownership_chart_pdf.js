const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'ANCHOR_COMPLIANCE_RESUBMISSION');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Ownership and Beneficial Ownership Chart — Jossy Digital Technologies Ltd.</title>
<style>
  @page {
    size: A4 portrait;
    margin: 10mm 12mm 10mm 12mm;
  }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #0f172a;
    background: #ffffff;
    margin: 0;
    padding: 0;
    font-size: 9.5pt;
    line-height: 1.35;
  }
  
  .header-box {
    text-align: center;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 6px;
    margin-bottom: 10px;
  }
  .comp-name {
    font-size: 16pt;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #0f172a;
    text-transform: uppercase;
    margin: 0;
  }
  .doc-title {
    font-size: 13pt;
    font-weight: 700;
    color: #1e3e62;
    margin: 2px 0;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .comp-rc {
    font-size: 10pt;
    font-weight: 700;
    color: #334155;
  }
  .doc-sub {
    font-size: 8.5pt;
    color: #64748b;
    font-style: italic;
    margin-top: 2px;
  }

  .sec-heading {
    font-size: 9.5pt;
    font-weight: 800;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 2px;
    margin-top: 8px;
    margin-bottom: 5px;
  }

  table.info-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    font-size: 8.5pt;
  }
  table.info-table td {
    padding: 4px 8px;
    border: 1px solid #cbd5e1;
  }
  .lbl {
    font-weight: 700;
    color: #334155;
    background-color: #f8fafc;
    width: 32%;
  }
  .val {
    color: #0f172a;
    font-weight: 600;
  }

  /* OWNERSHIP DIAGRAM */
  .diagram-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 8px 0;
  }
  .diag-box {
    border: 2px solid #0f172a;
    background-color: #f8fafc;
    border-radius: 6px;
    padding: 6px 18px;
    text-align: center;
    width: 75%;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .diag-box.company {
    background-color: #0f172a;
    color: #ffffff;
  }
  .diag-box.company .title {
    font-size: 10.5pt;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .diag-box.company .sub {
    font-size: 8.5pt;
    color: #cbd5e1;
  }
  
  .connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 3px 0;
  }
  .line {
    width: 2px;
    height: 12px;
    background-color: #0f172a;
  }
  .arrow-down {
    width: 0; 
    height: 0; 
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid #0f172a;
  }
  .conn-label {
    font-size: 7.5pt;
    font-weight: 800;
    color: #1e3e62;
    background-color: #e2e8f0;
    padding: 2px 8px;
    border-radius: 3px;
    letter-spacing: 0.5px;
    margin: 1px 0;
  }

  .diag-box.owner .name {
    font-size: 11.5pt;
    font-weight: 800;
    color: #0f172a;
  }
  .diag-box.owner .role {
    font-size: 8.5pt;
    font-weight: 700;
    color: #1e3e62;
  }
  .diag-box.owner .equity {
    font-size: 9pt;
    font-weight: 800;
    color: #16a34a;
    margin-top: 1px;
  }

  .declaration-text {
    font-size: 8.5pt;
    color: #334155;
    background-color: #f1f5f9;
    border-left: 3px solid #0f172a;
    padding: 5px 9px;
    margin: 6px 0;
    border-radius: 0 4px 4px 0;
  }
  .declaration-text p {
    margin: 0 0 3px 0;
  }
  .declaration-text p:last-child {
    margin-bottom: 0;
  }

  .exec-table {
    width: 100%;
    border-collapse: collapse;
    margin: 6px 0;
    font-size: 8.5pt;
  }
  .exec-table td {
    padding: 4px 8px;
    border: 1px solid #cbd5e1;
  }

  .notary-box {
    border: 2px dashed #64748b;
    background-color: #fafafa;
    border-radius: 6px;
    padding: 6px 10px;
    margin-top: 6px;
  }
  .notary-header {
    font-size: 9pt;
    font-weight: 800;
    color: #0f172a;
    text-align: center;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 2px;
    margin-bottom: 4px;
    text-transform: uppercase;
  }
  .notary-sub {
    font-size: 7.5pt;
    font-weight: 700;
    color: #475569;
    text-align: center;
    margin-bottom: 6px;
  }
  
  .notary-grid {
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
  }
  .notary-col {
    width: 48%;
  }
  .notary-field {
    margin-bottom: 6px;
  }
  .notary-line {
    border-bottom: 1px solid #94a3b8;
    display: inline-block;
    width: 65%;
    height: 10px;
  }
  .notary-stamp-space {
    border: 1px dashed #cbd5e1;
    height: 55px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
    font-size: 7.5pt;
    font-weight: 600;
    background-color: #ffffff;
  }

  .footer-bar {
    margin-top: 8px;
    border-top: 1px solid #e2e8f0;
    padding-top: 3px;
    display: flex;
    justify-content: space-between;
    font-size: 7.5pt;
    color: #64748b;
  }
</style>
</head>
<body>

  <!-- HEADER -->
  <div class="header-box">
    <div class="comp-name">Jossy Digital Technologies Ltd.</div>
    <div class="doc-title">Ownership and Beneficial Ownership Chart</div>
    <div class="comp-rc">Corporate Registration No.: RC 9586407</div>
    <div class="doc-sub">Prepared for Corporate Legal &amp; Compliance Review &bull; For Notarisation</div>
  </div>

  <!-- SECTION 1 — COMPANY INFORMATION -->
  <div class="sec-heading">SECTION 1 &mdash; COMPANY INFORMATION</div>
  <table class="info-table">
    <tr>
      <td class="lbl">Legal Entity</td>
      <td class="val">Jossy Digital Technologies Ltd.</td>
    </tr>
    <tr>
      <td class="lbl">Registration Number</td>
      <td class="val">RC 9586407</td>
    </tr>
    <tr>
      <td class="lbl">Principal Business / Platform</td>
      <td class="val">NoteStandard</td>
    </tr>
    <tr>
      <td class="lbl">Registered Office</td>
      <td class="val">Effurun, Delta State, Nigeria</td>
    </tr>
    <tr>
      <td class="lbl">Date of Chart</td>
      <td class="val">11 August 2026</td>
    </tr>
  </table>

  <!-- SECTION 2 — OWNERSHIP STRUCTURE -->
  <div class="sec-heading">SECTION 2 &mdash; OWNERSHIP STRUCTURE</div>
  <div class="diagram-container">
    <div class="diag-box company">
      <div class="title">JOSSY DIGITAL TECHNOLOGIES LTD.</div>
      <div class="sub">Registration No.: RC 9586407</div>
    </div>
    
    <div class="connector">
      <div class="line"></div>
      <div class="conn-label">100% EQUITY OWNERSHIP</div>
      <div class="line"></div>
      <div class="arrow-down"></div>
    </div>
    
    <div class="diag-box owner">
      <div class="name">AGHOGHO JOSSY OBOH</div>
      <div class="role">Director &bull; Ultimate Beneficial Owner (UBO)</div>
      <div class="equity">Equity Ownership: 100%</div>
    </div>
  </div>

  <!-- SECTION 3 — OWNERSHIP DECLARATION -->
  <div class="sec-heading">SECTION 3 &mdash; OWNERSHIP DECLARATION</div>
  <div class="declaration-text">
    <p>Based on the corporate ownership information made available for this document, Aghogho Jossy Oboh is identified as the Director and Ultimate Beneficial Owner of Jossy Digital Technologies Ltd., holding 100% of the company's equity ownership.</p>
    <p>This ownership chart is prepared for corporate onboarding, legal and compliance review, and beneficial ownership verification purposes.</p>
  </div>

  <!-- SECTION 4 — DECLARANT / COMPANY REPRESENTATIVE -->
  <div class="sec-heading">SECTION 4 &mdash; DECLARATION AND EXECUTION</div>
  <p style="font-size: 8pt; margin-bottom: 4px; color: #334155;">I confirm that the ownership information stated in this document is true and accurate to the best of my knowledge and is consistent with the company's authoritative corporate records.</p>
  <table class="exec-table">
    <tr>
      <td style="width: 15%; font-weight: 700; background-color: #f8fafc;">Name:</td>
      <td style="width: 35%; font-weight: 700;">Aghogho Jossy Oboh</td>
      <td style="width: 15%; font-weight: 700; background-color: #f8fafc;">Position:</td>
      <td style="width: 35%; font-weight: 700;">Director</td>
    </tr>
    <tr>
      <td style="font-weight: 700; background-color: #f8fafc;">Signature:</td>
      <td>__________________________________</td>
      <td style="font-weight: 700; background-color: #f8fafc;">Date:</td>
      <td>__________________________________</td>
    </tr>
  </table>

  <!-- SECTION 5 — NOTARY PUBLIC -->
  <div class="notary-box">
    <div class="notary-header">FOR NOTARY PUBLIC USE ONLY</div>
    <div class="notary-sub">NOTARIAL ATTESTATION / CERTIFICATION</div>
    
    <div class="notary-grid">
      <div class="notary-col">
        <div class="notary-field"><strong>Name of Notary Public:</strong> <span class="notary-line"></span></div>
        <div class="notary-field"><strong>Signature:</strong> <span class="notary-line"></span></div>
        <div class="notary-field"><strong>Date:</strong> <span class="notary-line"></span></div>
        <div class="notary-field"><strong>Place:</strong> <span class="notary-line"></span></div>
      </div>
      <div class="notary-col">
        <div style="font-size: 7.5pt; font-weight: 700; margin-bottom: 3px; color: #475569; text-align: center;">NOTARY SEAL / STAMP</div>
        <div class="notary-stamp-space">
          [ Space for Physical Notary Seal &amp; Stamp ]
        </div>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer-bar">
    <span>Jossy Digital Technologies Ltd. | RC 9586407 | Ownership &amp; Beneficial Ownership Chart</span>
    <span>Page 1 of 1</span>
  </div>

</body>
</html>`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent);

  const targetPath = path.join(OUTPUT_DIR, '06_OWNERSHIP_CHART_FOR_NOTARISATION.pdf');
  await page.pdf({
    path: targetPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '5mm', bottom: '5mm', left: '5mm', right: '5mm' }
  });

  console.log(`Successfully generated 1-Page PDF: ${targetPath}`);
  await browser.close();
}

main().catch(err => {
  console.error("PDF generation failed:", err);
  process.exit(1);
});
