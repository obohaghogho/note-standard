const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── Color Palette ───
const NAVY = '#0B192C';
const ACCENT_BLUE = '#1E56A0';
const TEAL = '#00ADB5';
const DARK_TEXT = '#1F2937';
const LIGHT_GREY = '#F8FAFC';
const BORDER_COLOR = '#E2E8F0';
const WHITE = '#FFFFFF';

// Target PDF Output Path
const outputDir = path.join(__dirname, '..', '..');
const outputPath = path.join(outputDir, 'NoteStandard_Fincra_Source_of_Funds_Declaration.pdf');

console.log(`Generating Fincra Source of Funds PDF: ${outputPath}`);

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 45, right: 45 },
  bufferPages: true
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Helper: Header Header Line
function drawHeader(doc) {
  // Top Banner
  doc.rect(0, 0, 595.28, 12).fill(NAVY);
  doc.rect(0, 12, 595.28, 4).fill(TEAL);

  // Logo Text
  doc.fillColor(NAVY).fontSize(20).font('Helvetica-Bold').text('NOTESTANDARD', 45, 30);
  doc.fillColor(TEAL).fontSize(10).font('Helvetica').text('ENTERPRISE BANKING PLATFORM', 45, 52);

  // Date & Reference
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.fillColor(DARK_TEXT).fontSize(9).font('Helvetica')
     .text(`Date: ${today}`, 380, 30, { align: 'right' })
     .text('Ref: FIN-SOF-2026-0802', 380, 43, { align: 'right' })
     .text('Target: Fincra Compliance Team', 380, 56, { align: 'right' });

  // Divider
  doc.moveTo(45, 75).lineTo(550, 75).strokeColor(BORDER_COLOR).lineWidth(1).stroke();
}

// Draw Header
drawHeader(doc);

let y = 90;

// Document Title Box
doc.rect(45, y, 505, 42).fill(LIGHT_GREY).strokeColor(ACCENT_BLUE).lineWidth(1).stroke();
doc.fillColor(NAVY).fontSize(14).font('Helvetica-Bold')
   .text('DECLARATION OF BUSINESS MODEL & SOURCE OF FUNDS', 55, y + 10, { width: 485, align: 'center' });
doc.fillColor(ACCENT_BLUE).fontSize(9).font('Helvetica-Bold')
   .text('MERCHANT ACCOUNT ACTIVATION SUBMISSION FOR MULTI-CURRENCY RAILS', 55, y + 26, { width: 485, align: 'center' });

y += 55;

// Recipient Address
doc.fillColor(DARK_TEXT).fontSize(10).font('Helvetica-Bold').text('To: Fincra Compliance & Risk Assessment Team', 45, y);
doc.fillColor(DARK_TEXT).fontSize(9).font('Helvetica').text('Subject: Source of Funds, Revenue Model & Compliance Overview for NoteStandard Accounts', 45, y + 14);

y += 35;

// Section 1: Business Overview
doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('1. Executive Business Overview', 45, y);
doc.moveTo(45, y + 14).lineTo(550, y + 14).strokeColor(TEAL).lineWidth(1).stroke();
y += 20;

doc.fillColor(DARK_TEXT).fontSize(9.5).font('Helvetica').text(
  'NoteStandard Technologies Limited is a licensed multi-currency enterprise banking and financial operating platform. We provide businesses, institutions, and platforms across Africa and international markets with infrastructure for payment collection, multi-currency wallets, automated treasury rebalancing, and virtual accounts.',
  45, y, { width: 505, align: 'justify', lineGap: 3 }
);

y += 45;

// Section 2: How NoteStandard Earns Money (Revenue Model)
doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('2. Monetization & Revenue Generation Model (How We Earn Money)', 45, y);
doc.moveTo(45, y + 14).lineTo(550, y + 14).strokeColor(TEAL).lineWidth(1).stroke();
y += 20;

const revenueStreams = [
  {
    title: 'A. Payment Transaction Processing Fees (0.5% - 1.5%)',
    desc: 'NoteStandard charges a standard processing fee on all incoming payins/collections (Cards, Bank Transfers, Mobile Money across NGN, GHS, KES, ZAR, UGX, TZS, ZMW, XOF, XAF). Fees are automatically deducted upon successful settlement.'
  },
  {
    title: 'B. Foreign Exchange Spread & Currency Conversions (0.5% - 1.0%)',
    desc: 'We earn an FX margin on cross-border currency conversions (e.g., NGN/USD, EUR/NGN, GHS/USD) executed through our locked FX quote engine, providing transparent rates to merchants while capturing spread revenue.'
  },
  {
    title: 'C. Virtual Account Issuance & Monthly Maintenance Fees',
    desc: 'Corporate accounts pay nominal account setup and recurring monthly maintenance fees for dedicated NGN, USD, EUR, and GBP virtual collection accounts issued on the platform.'
  },
  {
    title: 'D. Enterprise SaaS Subscription Fees ($99 - $999/month)',
    desc: 'Tiered monthly software subscription fees collected from enterprise merchants for accessing advanced features such as automated treasury rebalancing, developer APIs, custom ERP integrations, and multi-user RBAC controls.'
  }
];

revenueStreams.forEach(item => {
  doc.fillColor(ACCENT_BLUE).fontSize(9.5).font('Helvetica-Bold').text(item.title, 45, y);
  y += 13;
  doc.fillColor(DARK_TEXT).fontSize(9).font('Helvetica').text(item.desc, 55, y, { width: 495, align: 'justify', lineGap: 2 });
  y += 28;
});

y += 5;

// Section 3: Source of Funds Justification
doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('3. Source of Funds & Liquidity Origin', 45, y);
doc.moveTo(45, y + 14).lineTo(550, y + 14).strokeColor(TEAL).lineWidth(1).stroke();
y += 20;

doc.fillColor(DARK_TEXT).fontSize(9.5).font('Helvetica').text(
  'All funds deposited into and processed through our Fincra collection accounts originate strictly from verified, legitimate business transactions. These include: (1) End-user payments for digital goods, software, and commercial services; (2) Corporate treasury funding deposited to maintain liquidity buffers; and (3) Merchant settlement receivables processed through approved banking rails.',
  45, y, { width: 505, align: 'justify', lineGap: 3 }
);

y += 50;

// Section 4: Compliance & AML Commitments
doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('4. AML / KYC Compliance & Risk Controls', 45, y);
doc.moveTo(45, y + 14).lineTo(550, y + 14).strokeColor(TEAL).lineWidth(1).stroke();
y += 20;

doc.fillColor(DARK_TEXT).fontSize(9.5).font('Helvetica').text(
  'NoteStandard enforces strict compliance standards: 100% of corporate clients undergo Tier-3 KYC verification (CAC Certificate, Form CO7, Director BVN/NIN, Proof of Address). Real-time sanctions and PEPs screening hooks (OFAC/UN watchlists) automatically block high-risk transactions. All processing is audited via an immutable double-entry accounting engine.',
  45, y, { width: 505, align: 'justify', lineGap: 3 }
);

y += 55;

// Signature & Authorization Block
doc.rect(45, y, 505, 90).fill(LIGHT_GREY).strokeColor(BORDER_COLOR).lineWidth(1).stroke();

doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('OFFICIAL SIGN-OFF & AUTHORIZATION', 60, y + 10);
doc.fillColor(DARK_TEXT).fontSize(8.5).font('Helvetica').text(
  'I hereby declare that the information provided above regarding NoteStandard Technologies Limited\'s business model, revenue streams, and source of funds is true, complete, and accurate.',
  60, y + 24, { width: 475 }
);

// Signature Line
const sigY = y + 55;
doc.moveTo(60, sigY + 15).lineTo(220, sigY + 15).strokeColor(NAVY).lineWidth(1).stroke();
doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text('Authorized Signatory Signature', 60, sigY + 20);

// Details
doc.fillColor(DARK_TEXT).fontSize(9).font('Helvetica-Bold').text('Name:', 280, sigY);
doc.font('Helvetica').text('Managing Director / CEO', 325, sigY);

doc.font('Helvetica-Bold').text('Company:', 280, sigY + 14);
doc.font('Helvetica').text('NoteStandard Technologies Ltd', 335, sigY + 14);

doc.font('Helvetica-Bold').text('Date:', 280, sigY + 28);
doc.font('Helvetica').text(new Date().toLocaleDateString('en-US'), 315, sigY + 28);

// Footer
doc.rect(0, 825, 595.28, 17).fill(NAVY);
doc.fillColor(WHITE).fontSize(8).font('Helvetica')
   .text('NoteStandard Technologies Limited • Enterprise Banking Architecture v1.0 • Confidential Compliance Document', 0, 830, { align: 'center' });

doc.end();

writeStream.on('finish', () => {
  console.log(`✅ PDF generated successfully: ${outputPath}`);
});
