const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const NAVY = '#0D1B3D';
const BLUE_ACCENT = '#0052FF';
const DARK_TEXT = '#2B2B2B';
const LIGHT_BG = '#F4F7FA';
const GREY = '#6C757D';
const BORDER_COLOR = '#E2E8F0';

const outputPath = path.join(__dirname, '..', 'NoteStandard_Anchor_BaaS_Onboarding_Document.pdf');
const brainPath = 'C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\495cca4a-78ef-4d50-9ab1-b5b7a976ccde\\NoteStandard_Anchor_BaaS_Onboarding_Document.pdf';

console.log(`Generating PDF at: ${outputPath}`);

class PDFGenerator {
  constructor() {
    this.doc = new PDFDocument({
      size: 'A4',
      margins: { top: 55, bottom: 55, left: 50, right: 50 },
      bufferPages: true
    });

    this.stream = fs.createWriteStream(outputPath);
    this.doc.pipe(this.stream);
  }

  addHeaderFooter() {
    const range = this.doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      this.doc.switchToPage(i);

      // Top Header (pages > 0)
      if (i > 0) {
        this.doc.save();
        this.doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8).text('NOTESTANDARD', 50, 25);
        this.doc.fillColor(GREY).font('Helvetica').fontSize(8).text('BANKING-AS-A-SERVICE (BaaS) ONBOARDING DOCUMENT', 150, 25, { align: 'right', width: 395 });
        this.doc.moveTo(50, 37).lineTo(545, 37).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
        this.doc.restore();
      }

      // Bottom Footer (all pages)
      this.doc.save();
      this.doc.moveTo(50, 790).lineTo(545, 790).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
      this.doc.fillColor(GREY).font('Helvetica').fontSize(8).text('Jossy Digital Technologies Ltd — Confidential & Proprietary', 50, 797);
      this.doc.text(`Page ${i + 1} of ${range.count}`, 50, 797, { align: 'right', width: 495 });
      this.doc.restore();
    }
  }

  generate() {
    const doc = this.doc;

    // --- COVER / HEADER BANNER ---
    doc.rect(50, 50, 495, 100).fill(NAVY);
    
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text('NOTESTANDARD', 70, 68);
    doc.fontSize(12).font('Helvetica').text('Banking-as-a-Service (BaaS) Onboarding Document', 70, 92);
    doc.fontSize(9).fillColor('#CBD5E1').text('Confidential Submission for Anchor Compliance & Onboarding Review', 70, 115);

    doc.y = 170;

    // --- METADATA BOX ---
    doc.rect(50, doc.y, 495, 65).fill(LIGHT_BG).strokeColor(BORDER_COLOR).stroke();
    const metaY = doc.y + 12;
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9);
    doc.text('Legal Entity:', 65, metaY);
    doc.font('Helvetica').text('Jossy Digital Technologies Ltd', 140, metaY);

    doc.font('Helvetica-Bold').text('Product Name:', 65, metaY + 16);
    doc.font('Helvetica').text('NoteStandard', 140, metaY + 16);

    doc.font('Helvetica-Bold').text('Website:', 65, metaY + 32);
    doc.font('Helvetica').fillColor(BLUE_ACCENT).text('https://notestandard.com', 140, metaY + 32);

    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').text('Contact Email:', 310, metaY);
    doc.font('Helvetica').text('admin@notestandard.com', 385, metaY);

    doc.font('Helvetica-Bold').text('Document Date:', 310, metaY + 16);
    doc.font('Helvetica').text('July 2026', 385, metaY + 16);

    doc.font('Helvetica-Bold').text('Target Partner:', 310, metaY + 32);
    doc.font('Helvetica').text('Anchor API (GetAnchor)', 385, metaY + 32);

    doc.y = 255;

    // Helper functions for content formatting
    const addSectionHeader = (title) => {
      if (doc.y > 700) doc.addPage();
      doc.moveDown(0.8);
      const y = doc.y;
      doc.rect(50, y, 4, 16).fill(BLUE_ACCENT);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(title, 62, y + 1);
      doc.moveDown(0.5);
    };

    const addSubHeader = (title) => {
      if (doc.y > 720) doc.addPage();
      doc.moveDown(0.4);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(title, 50);
      doc.moveDown(0.2);
    };

    const addBodyText = (text) => {
      if (doc.y > 730) doc.addPage();
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9).text(text, 50, doc.y, { align: 'justify', lineGap: 2 });
      doc.moveDown(0.3);
    };

    const addBulletList = (items) => {
      items.forEach(item => {
        if (doc.y > 730) doc.addPage();
        doc.fillColor(BLUE_ACCENT).font('Helvetica-Bold').fontSize(10).text('• ', 55, doc.y, { continued: true });
        doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9).text(item, { lineGap: 2 });
      });
      doc.moveDown(0.3);
    };

    // --- 1. EXECUTIVE SUMMARY ---
    addSectionHeader('1. Executive Summary');
    addBodyText('NoteStandard is a productivity and collaboration platform with embedded financial services that enable users to securely store value, fund wallets, make payments, receive funds, and access multi-currency financial services through regulated Banking-as-a-Service (BaaS) and licensed payment partners.');
    addBodyText('NoteStandard is not a bank, not a money transmitter, and does not operate as a cryptocurrency exchange or brokerage. All regulated financial services are delivered through licensed infrastructure providers.');
    addBodyText('Our objective is to provide individuals, creators, students, freelancers, businesses, and organizations with a unified digital workspace where productivity tools integrate seamlessly with compliant financial services.');

    // --- 2. COMPANY INFORMATION ---
    addSectionHeader('2. Company Information');
    addBulletList([
      'Legal Business Name: Jossy Digital Technologies Ltd',
      'Product Name: NoteStandard',
      'Business Type: Software Technology Company (SaaS)',
      'Industry: Productivity Software with Embedded Financial Services',
      'Registered Address: 10 Winnie Okia Street, Effurun, Delta State, Nigeria'
    ]);

    addSubHeader('Business Model');
    addBodyText('NoteStandard combines productivity software with embedded financial services. Core platform features include:');
    addBulletList([
      'Digital note management & team collaboration',
      'Workspace management, messaging & community spaces',
      'Digital multi-currency wallets & merchant payments',
      'Subscription management & advertising payments'
    ]);
    addBodyText('Financial services are provided exclusively through regulated partners.');

    addSubHeader('Target Customers');
    addBodyText('Our platform primarily serves: Students, Professionals, Freelancers, Small Businesses, Startups, Content Creators, Educational Institutions, Organizations, and Remote Teams. Initially launching in Nigeria with planned expansion into additional supported jurisdictions.');

    // --- 3. BANKING & PAYMENT ARCHITECTURE ---
    addSectionHeader('3. Banking & Payment Architecture');
    addBodyText('NoteStandard uses a multi-provider architecture where each provider performs specialized regulated functions:');

    addSubHeader('Fincra — Primary Fiat Infrastructure');
    addBulletList([
      'Merchant collections, Credit & Debit Card payments, NGN payments, and Multi-currency checkout',
      'Merchant settlements, Local payouts, and Cross-border payment services (where supported)',
      'Payment verification and payment gateway services',
      'All outbound Fincra API requests are routed through our dedicated secure gateway with a static IP address.'
    ]);

    addSubHeader('Anchor — Primary Banking-as-a-Service Provider');
    addBulletList([
      'Dedicated Virtual Accounts (Virtual NUBANs)',
      'USD Banking Infrastructure & Banking-as-a-Service APIs',
      'Treasury Infrastructure & Stablecoin Settlement Rails',
      'Cross-border Banking Infrastructure & Future global account infrastructure'
    ]);
    addBodyText('Dedicated customer virtual accounts are provisioned only after successful onboarding and KYC approval where required.');

    addSubHeader('Grey & NowPayments');
    addBulletList([
      'Grey: Supports manual international banking services where applicable.',
      'NowPayments: Supports cryptocurrency payment processing through regulated infrastructure.'
    ]);

    addSubHeader('Payment Flow');
    addBodyText('Users can fund their wallets using secure card payments, receive payments, receive dedicated virtual account transfers, send payouts where enabled, pay subscriptions, pay for advertisements, transfer between wallets, and make merchant payments. Payment routing is dynamically selected by the platform\'s capability-driven routing engine.');

    // --- 4. TECHNOLOGY ARCHITECTURE ---
    addSectionHeader('4. Technology Architecture');
    addBodyText('Financial operations are managed through an enterprise provider abstraction layer. Routing decisions are capability-based rather than vendor-specific. Core components include:');
    addBulletList([
      'Payment Service & Gateway Router',
      'Payment Factory & Provider Capability Engine',
      'Double-entry Ledger & Reconciliation Engine',
      'Audit Logging & Treasury Services'
    ]);
    addBodyText('This architecture enables the platform to support multiple regulated providers without vendor lock-in.');

    // --- 5. SECURITY ARCHITECTURE ---
    addSectionHeader('5. Security Architecture');
    addBodyText('Security controls include TLS encryption, HMAC request signing, static IP gateway routing, API authentication, audit logging, immutable ledger records, role-based access control, transaction monitoring, replay attack protection, rate limiting, and webhook signature verification. Every financial transaction is recorded within an immutable audit trail.');

    // --- 6. KYC & COMPLIANCE ---
    addSectionHeader('6. KYC & Compliance');
    addBodyText('Customer identity verification is performed through approved KYC service providers integrated into the platform. Production KYC infrastructure will be fully enabled prior to public launch. Compliance controls include: Customer Identification Program (CIP), Know Your Customer (KYC), Anti-Money Laundering (AML), Transaction Monitoring, Sanctions Screening, Suspicious Activity Monitoring, Fraud Detection, Risk Scoring, and Audit Logging.');

    // --- 7. WALLET INFRASTRUCTURE ---
    addSectionHeader('7. Wallet Infrastructure');
    addBodyText('Users may have access to NGN Wallet, USD Wallet, EUR Wallet, GBP Wallet, and Cryptocurrency Wallets (supported digital assets only). Wallet balances are maintained using an enterprise double-entry ledger. Every balance mutation generates matching ledger records.');

    // --- 8. DIGITAL ASSETS ---
    addSectionHeader('8. Digital Assets');
    addBodyText('NoteStandard does not operate a cryptocurrency exchange or brokerage. Digital asset functionality is limited to wallet features and regulated partner infrastructure. Where supported, digital asset services are delivered through licensed partners.');

    // --- 9. VIRTUAL ACCOUNT PROVISIONING ---
    addSectionHeader('9. Virtual Account Provisioning');
    addBodyText('Upon successful onboarding and identity verification, eligible users may receive dedicated virtual accounts provisioned through regulated banking partners. Virtual accounts are intended for: Wallet funding, Business collections, Merchant collections, Account identification, and Payment reconciliation.');

    // --- 10. INTERNATIONAL PAYMENTS ---
    addSectionHeader('10. International Payments');
    addBodyText('The platform supports international payment capabilities through regulated partners. Capabilities include: USD Banking Infrastructure, Multi-currency wallets, Treasury management, Cross-border banking, and International settlements. Additional international services will be enabled as providers expand approved capabilities.');

    // --- 11. TRANSACTION MONITORING ---
    addSectionHeader('11. Transaction Monitoring');
    addBodyText('The platform continuously monitors transactions for fraud indicators, velocity anomalies, AML risk, sanctions exposure, duplicate payments, suspicious activity, and failed payment patterns. Risk events are logged for investigation.');

    // --- 12. ESTIMATED TRANSACTION VOLUMES ---
    addSectionHeader('12. Estimated Transaction Volumes');
    addBodyText('Initial production volumes are expected to be modest while the platform scales. Long-term projections include thousands of active users, significant monthly payment volume, multi-currency payment activity, merchant collections, subscription payments, and business payments. Transaction volumes will increase progressively as user adoption grows.');

    // --- 13. CUSTOMER SUPPORT ---
    addSectionHeader('13. Customer Support');
    addBodyText('Support is available through in-app support, email support, and administrative support dashboard. Additional communication channels may be introduced in future releases.');

    // --- 14. DATA PROTECTION ---
    addSectionHeader('14. Data Protection');
    addBodyText('User information is protected through encryption in transit, secure authentication, principle of least privilege, secure infrastructure, audit logging, and regular security monitoring. Sensitive financial information is handled exclusively through regulated payment infrastructure.');

    // --- 15. REGULATORY POSITION ---
    addSectionHeader('15. Regulatory Position');
    addBodyText('NoteStandard provides software services with embedded financial functionality. Banking, payment processing, virtual accounts, settlements, and regulated financial services are delivered by licensed Banking-as-a-Service and payment partners. The platform does not represent itself as a bank or licensed financial institution.');

    // --- 16. LEGAL DOCUMENTS (SECTION I) ---
    addSectionHeader('16. Legal Documents & Disclosures (Section I)');
    addBulletList([
      'Terms of Use: NoteStandard Terms of Service & End-User License Agreement (https://notestandard.com/terms) — Published and accessible across web and mobile apps outlining user rights, platform subscription terms, and technology provider disclosures.',
      'Privacy Policy: NoteStandard Privacy Policy & Data Protection Notice (https://notestandard.com/privacy) — Fully compliant with the Nigeria Data Protection Act (NDPA 2023) and international GDPR privacy principles.',
      'Electronic Signature Agreement: NoteStandard Electronic Signature, Disclosures & Consent Agreement (https://notestandard.com/electronic-signature-agreement) — Embedded in digital onboarding flow governing electronic consent, account disclosures, and digital signature execution.'
    ]);

    // --- 16. CURRENT BANKING PARTNERS ---
    addSectionHeader('16. Current Banking Partners');
    
    if (doc.y > 650) doc.addPage();

    // Draw Table
    const tableTop = doc.y + 5;
    const col1X = 55;
    const col2X = 160;
    const tableWidth = 485;

    // Table Header
    doc.rect(50, tableTop, tableWidth, 20).fill(NAVY);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
    doc.text('Provider', col1X, tableTop + 5);
    doc.text('Primary Role & Responsibilities', col2X, tableTop + 5);

    const rows = [
      { p: 'Fincra', r: 'Primary fiat payment infrastructure, merchant collections, card payments, settlements, payouts, payment gateway' },
      { p: 'Anchor', r: 'Banking-as-a-Service, virtual accounts, USD banking infrastructure, treasury, cross-border banking' },
      { p: 'Grey', r: 'Manual international banking services' },
      { p: 'NowPayments', r: 'Cryptocurrency payment processing' }
    ];

    let rowY = tableTop + 20;
    rows.forEach((row, idx) => {
      const bg = idx % 2 === 0 ? LIGHT_BG : '#FFFFFF';
      doc.rect(50, rowY, tableWidth, 22).fill(bg).strokeColor(BORDER_COLOR).stroke();
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(8.5).text(row.p, col1X, rowY + 6);
      doc.font('Helvetica').fontSize(8.5).text(row.r, col2X, rowY + 6, { width: 365 });
      rowY += 22;
    });

    doc.y = rowY + 15;

    // --- 17. COMMITMENT & SIGN-OFF ---
    addSectionHeader('17. Commitment & Submission Sign-Off');
    addBodyText('Jossy Digital Technologies Ltd is committed to operating NoteStandard in compliance with all applicable regulatory requirements and industry best practices. We are committed to implementing strong KYC, AML, transaction monitoring, security, audit, and governance controls while partnering exclusively with licensed financial institutions and regulated Banking-as-a-Service providers.');
    addBodyText('We look forward to partnering with Anchor to deliver secure, compliant, and scalable embedded banking services to our users.');

    doc.moveDown(1);
    if (doc.y > 680) doc.addPage();

    const signY = doc.y;
    doc.rect(50, signY, 495, 90).fill(LIGHT_BG).strokeColor(BORDER_COLOR).stroke();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text('Submitted by:', 65, signY + 10);
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(11).text('Oboh Aghogho Jossy', 65, signY + 24);
    doc.font('Helvetica').fontSize(9).text('Founder & CEO — Jossy Digital Technologies Ltd', 65, signY + 38);
    doc.text('Address: 10 Winnie Okia Street, Effurun, Delta State, Nigeria', 65, signY + 52);
    doc.text('Email: admin@notestandard.com  |  Product: NoteStandard  |  Website: https://notestandard.com', 65, signY + 66);

    // Apply header & footer across all pages
    this.addHeaderFooter();

    doc.end();
  }
}

const generator = new PDFGenerator();
generator.stream.on('finish', () => {
  console.log(`PDF generation complete. Copying to brain artifact path: ${brainPath}`);
  try {
    fs.copyFileSync(outputPath, brainPath);
    console.log('PDF successfully copied to brain artifacts directory!');
  } catch (err) {
    console.error('Error copying PDF to brain directory:', err.message);
  }
});

generator.generate();
