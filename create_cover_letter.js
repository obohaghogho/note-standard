const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, ImageRun } = require('docx');

const OUTPUT_DIR = path.join(__dirname, 'documents', 'Anchor Submission Package');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const fileCover = path.join(OUTPUT_DIR, '04 - Cover Letter.docx');
const sigPath = path.join(__dirname, 'temp_anchor_source', 'signature_transparent.png');
const sigBuffer = fs.readFileSync(sigPath);

const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: 1440, // 1 inch
            bottom: 1440,
            left: 1440,
            right: 1440,
          },
        },
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: "JOSSY DIGITAL TECHNOLOGIES LTD",
              bold: true,
              size: 28, // 14pt
              color: "111827",
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Brand / Platform Name: NoteStandard (RC 9586407)",
              bold: true,
              size: 20, // 10pt
              color: "1E40AF",
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Head Office: Effurun, Delta State, Nigeria\nWebsite: https://notestandard.com | Admin Email: admin@notestandard.com | Support Email: support@notestandard.com",
              size: 18, // 9pt
              color: "4B5563",
            }),
          ],
        }),
        new Paragraph({
          text: "_________________________________________________________________________________",
          spacing: { after: 300 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "03 August 2026",
              bold: true,
              size: 22,
            }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "To:\n",
              bold: true,
              size: 22,
            }),
            new TextRun({
              text: "The Compliance & Onboarding Team\nAnchor Software Limited\nD310, Safe Court Apartments, 19 Ojulari Street, Ikate-Lekki\nLagos State, Nigeria",
              size: 22,
            }),
          ],
          spacing: { after: 300 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "SUBJECT: SUBMISSION OF COMPLETED BAAS ONBOARDING PACKAGE & COMPLIANCE DOCUMENTATION — JOSSY DIGITAL TECHNOLOGIES LTD (NOTESTANDARD)",
              bold: true,
              size: 22,
              color: "1E3A8A",
            }),
          ],
          spacing: { after: 300 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Dear Anchor Compliance Team,",
              size: 22,
            }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "On behalf of Jossy Digital Technologies Ltd (operating platform: NoteStandard), we are pleased to submit our complete, bank-grade onboarding documentation package for Banking-as-a-Service (BaaS) integration with Anchor Software Limited.",
              size: 22,
            }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Enclosed within this submission package are the following required documents:",
              size: 22,
            }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: "01 - Anchor Onboarding Questionnaire.xlsx: ", bold: true }),
            new TextRun({ text: "Fully completed original Anchor Company & Product Questionnaire covering all 131 rows, financial projections, product fee schedules, and compliance disclosures." }),
          ],
        }),
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: "02 - Standard Service Agreement.docx: ", bold: true }),
            new TextRun({ text: "Duly executed Client Service Agreement between Anchor Software Ltd and Jossy Digital Technologies Ltd." }),
          ],
        }),
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: "03 - Fincra Wildcard IP Indemnity.pdf: ", bold: true }),
            new TextRun({ text: "Executed Wildcard IP Whitelisting Indemnity document bearing company seal and director authorization." }),
          ],
        }),
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: "05 - Compliance Summary.pdf: ", bold: true }),
            new TextRun({ text: "Executive 1-page compliance overview detailing risk controls, KYC/AML architecture, security controls, and internal ledger specifications." }),
          ],
        }),
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: "06 - README.txt: ", bold: true }),
            new TextRun({ text: "Manifest document outlining file contents and compliance declarations." }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Key Compliance & Architectural Declarations:\n", bold: true }),
            new TextRun({ text: "1. Internal Double-Entry Ledger: NoteStandard maintains its own independent, immutable double-entry ledger system of record (LedgerEngine.js) for customer balances and accounting. Anchor will be utilized strictly as regulated banking infrastructure and clearing rail.\n" }),
            new TextRun({ text: "2. Projected Volume: Baseline processing volume is projected at ₦100,000,000 monthly across NIP bank transfers, wallet funding, and internal book transfers.\n" }),
            new TextRun({ text: "3. Identity Verification & Sanctions: Primary KYC Provider is Prembly (IdentityPass). Customer onboarding includes automated identity verification and sanctions screening through integrated compliance providers." }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "We thank you for your partnership and look forward to finalizing our technical integration and launching production operations upon your approval.",
              size: 22,
            }),
          ],
          spacing: { after: 250 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Sincerely,\n",
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new ImageRun({
              data: sigBuffer,
              transformation: {
                width: 140,
                height: 60,
              },
              type: "png",
            }),
          ],
          spacing: { before: 100, after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Aghogho Oboh\n",
              bold: true,
              size: 22,
            }),
            new TextRun({
              text: "Managing Director & Founder\nJossy Digital Technologies Ltd (NoteStandard)\nRC Number: RC 9586407\nAdmin Email: admin@notestandard.com | Support Email: support@notestandard.com",
              size: 20,
              color: "4B5563",
            }),
          ],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(fileCover, buffer);
  console.log('✓ Successfully generated Cover Letter DOCX with Signature at:', fileCover);
});
