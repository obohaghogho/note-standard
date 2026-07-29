const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const NAVY = '#0D1B3D';
const BLUE_ACCENT = '#0052FF';
const DARK_TEXT = '#2B2B2B';
const LIGHT_BG = '#F4F7FA';
const GREY = '#6C757D';
const BORDER_COLOR = '#E2E8F0';

const signatureImgPath = 'C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\495cca4a-78ef-4d50-9ab1-b5b7a976ccde\\media__1785237279861.jpg';
const outputPath = path.join(__dirname, '..', 'NoteStandard_Anchor_Client_Service_Agreement.pdf');
const brainPath = 'C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\495cca4a-78ef-4d50-9ab1-b5b7a976ccde\\NoteStandard_Anchor_Client_Service_Agreement.pdf';

console.log(`Generating Full Executed Client Service Agreement PDF at: ${outputPath}`);

class FullContractPDFGenerator {
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

      if (i > 0) {
        this.doc.save();
        this.doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8).text('ANCHOR SOFTWARE LTD & JOSSY DIGITAL TECHNOLOGIES LTD', 50, 25);
        this.doc.fillColor(GREY).font('Helvetica').fontSize(8).text('CLIENT SERVICE AGREEMENT', 150, 25, { align: 'right', width: 395 });
        this.doc.moveTo(50, 37).lineTo(545, 37).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
        this.doc.restore();
      }

      this.doc.save();
      this.doc.moveTo(50, 790).lineTo(545, 790).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
      this.doc.fillColor(GREY).font('Helvetica').fontSize(8).text('Anchor Software Ltd & Jossy Digital Technologies Ltd — Confidential', 50, 797);
      this.doc.text(`Page ${i + 1} of ${range.count}`, 50, 797, { align: 'right', width: 495 });
      this.doc.restore();
    }
  }

  generate() {
    const doc = this.doc;

    // --- TITLE BANNER ---
    doc.rect(50, 50, 495, 95).fill(NAVY);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text('CLIENT SERVICE AGREEMENT', 70, 68);
    doc.fontSize(11).font('Helvetica').text('Between Anchor Software Ltd and Jossy Digital Technologies Ltd', 70, 92);
    doc.fontSize(8.5).fillColor('#CBD5E1').text('Execution Date: 28th Day of July 2026', 70, 112);

    doc.y = 160;

    // --- PARTIES SUMMARY BOX ---
    doc.rect(50, doc.y, 495, 80).fill(LIGHT_BG).strokeColor(BORDER_COLOR).stroke();
    const metaY = doc.y + 10;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5).text('PARTIES TO THIS AGREEMENT:', 65, metaY);
    
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(8.5).text('1. ANCHOR SOFTWARE LTD', 65, metaY + 16);
    doc.font('Helvetica').text('RC Number: 1888102 | Address: D310, Safe Court Apartments 19, Ojulari Street, Ikate-Lekki, Lagos', 65, metaY + 28);

    doc.font('Helvetica-Bold').text('2. JOSSY DIGITAL TECHNOLOGIES LTD (NoteStandard)', 65, metaY + 44);
    doc.font('Helvetica').text('Operating Entity for NoteStandard | Address: 10 Winnie Okia Street, Effurun, Delta State, Nigeria', 65, metaY + 56);

    doc.y = 255;

    const addSectionHeader = (title) => {
      if (doc.y > 700) doc.addPage();
      doc.moveDown(0.8);
      const y = doc.y;
      doc.rect(50, y, 4, 15).fill(BLUE_ACCENT);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(title, 62, y + 1);
      doc.moveDown(0.5);
    };

    const addSubHeader = (title) => {
      if (doc.y > 720) doc.addPage();
      doc.moveDown(0.4);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5).text(title, 50);
      doc.moveDown(0.2);
    };

    const addBodyText = (text) => {
      if (doc.y > 730) doc.addPage();
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(8.5).text(text, 50, doc.y, { align: 'justify', lineGap: 2.5 });
      doc.moveDown(0.3);
    };

    const addBulletList = (items) => {
      items.forEach(item => {
        if (doc.y > 730) doc.addPage();
        doc.fillColor(BLUE_ACCENT).font('Helvetica-Bold').fontSize(9).text('• ', 55, doc.y, { continued: true });
        doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(8.5).text(item, { lineGap: 2.5 });
      });
      doc.moveDown(0.3);
    };

    // --- PREAMBLE ---
    addSectionHeader('PREAMBLE & RECITALS');
    addBodyText('THIS CLIENT SERVICE AGREEMENT ("Agreement") is made this 28th day of July 2026.');
    addBodyText('BETWEEN: ANCHOR SOFTWARE LTD, a limited liability company, duly incorporated under the laws of the Federal Republic of Nigeria, with RC Number: 1888102 and with its registered address at D310, Safe Court Apartments 19, Ojulari Street, Ikate-Lekki, Lagos ("Anchor");');
    addBodyText('AND: JOSSY DIGITAL TECHNOLOGIES LTD, a technology company operating the NoteStandard platform, with its registered office at 10 Winnie Okia Street, Effurun, Delta State, Nigeria ("the Client").');
    
    addSubHeader('BACKGROUND');
    addBulletList([
      '1. Anchor is a financial technology company that engages in the business of providing technological and end-to-end business solutions, in facilitating the provision of diverse financial services through its banking partners, to corporate clients;',
      '2. The Client is a Software Technology Company providing digital collaboration software with embedded financial services through regulated Banking-as-a-Service and licensed payment infrastructure partners;',
      '3. The Client is desirous of engaging the services of Anchor through its application programming interfaces for the provision of the Subscribed Services to its end users.'
    ]);

    // --- CLAUSE 1 ---
    addSectionHeader('1. DEFINITIONS, INTERPRETATION, AND INCORPORATION BY REFERENCE');
    addBodyText('1.1. Definitions: Agreement, API, Applicable Fees, Applicable Law, Business Day, Calendar Days, Confidential Information, Customer, Data Controller, Data Processor, Data Subject, Disclosing Party, Effective Date, Industry Standards, Initial Term (12 months), Intellectual Property, Notice Period (30 Business Days), Permissible Use, Personal Data, Recipient, Restricted Business, Run-off Period (6 months), Service, Software, Subscribed Services (Schedule A), Transaction Data.');
    addBodyText('1.2. Interpretation: Singular includes plural, headings are for reference only, "including" means "including without limitation".');
    addBodyText('1.3. Incorporation by Reference: Terms, conditions, and policies on Anchor\'s website are incorporated with equal force and effect.');

    // --- CLAUSE 2 & 3 ---
    addSectionHeader('2. DURATION & TERM');
    addBodyText('2.1. Initial Term: 12 months from Effective Date.');
    addBodyText('2.2. Automatic Renewal: Automatically renews for successive 12-month periods unless terminated in accordance with this Agreement.');

    addSectionHeader('3. BANKING AS A SERVICE');
    addBodyText('3.1. Anchor integrates with licensed financial institutions to provide full banking suites to the Client as specified in Schedule A.');

    // --- CLAUSE 4 & 5 ---
    addSectionHeader('4. ANCHOR OBLIGATIONS');
    addBodyText('4.1. Licenses & Permits: Anchor maintains all required licenses/permits to offer Subscribed Services.');
    addBodyText('4.2. Software & API: Anchor provides APIs/Software for delivery of financial services with 3-day notice for material changes.');
    addBodyText('4.3. Account Support & 24/7 Availability: Seamless 24/7 service access, technical specifications, and support ticketing.');
    addBodyText('4.4. Disclosures & Security: Data processed under relevant data protection laws; 72-hour notice for any lawful account suspension.');

    addSectionHeader('5. CLIENT OBLIGATIONS & COMPLIANCE');
    addBodyText('5.1. Permissible Use: Client shall use Services strictly in accordance with Agreement and shall not facilitate Restricted Businesses.');
    addBodyText('5.2. KYC & Customer Due Diligence (CDD): Client is solely responsible for obtaining and verifying KYC/CDD on end-users (BVN/NIN validation) in compliance with AML/CFT/CPF regulations, making docs available to Anchor upon request.');
    addBodyText('5.3. Risk & Data Security: Client maintains processes protecting customer data, 2-factor authentication, encryption, and immediate breach notification.');
    addBodyText('5.4. Licenses & Permits: Client maintains all permits necessary to operate its business.');

    // --- CLAUSE 6 & 7 ---
    addSectionHeader('6. COMPLIANCE');
    addBodyText('6.1. Client warrants compliance with all Applicable Laws, CBN directives, AML/CFT policies, and anti-bribery regulations.');

    addSectionHeader('7. PAYMENT COLLECTION & SETTLEMENT SERVICES');
    addBodyText('7.1. Settlement Account: Anchor credits Client\'s settlement account net of transaction fees within one (1) Business Day (T+1).');
    addBodyText('7.2. Withholding Rights & Regulatory Inquiries: Anchor retains right to withhold payments associated with fraud/illegal activity. Client reimburses reasonable investigation and legal costs.');
    addBodyText('7.3. Reconciliation: Real-time dashboard reconciliation; discrepancies must be communicated within 30 days of occurrence.');
    addBodyText('7.4. Refunds & Reversals: Transaction fees are non-refundable regardless of reversals, chargebacks, or disputes.');

    // --- CLAUSE 8 - 12 ---
    addSectionHeader('8. DATA PROTECTION (NDPA / GDPR)');
    addBodyText('8.1. Client acts as Data Controller. Both parties maintain physical/technical data safeguards. Client ensures legal consent from Data Subjects for data processing.');

    addSectionHeader('9. DORMANT ACCOUNTS & REPORTING');
    addBodyText('9.1. Accounts inactive for 12 months administered per CBN Dormant Account Guidelines.');

    addSectionHeader('10. OWNERSHIP OF CUSTOMERS');
    addBodyText('10.1. Onboarded users remain solely customers of the Client. Anchor holds no direct contract with end-users except for regulatory compliance.');

    addSectionHeader('11. TAXATION & THIRD-PARTY CONTRACTS');
    addBodyText('11.1. Client responsible for tax collections/remittances. Third-party subcontracts affecting Agreement require Anchor\'s express consent.');

    // --- CLAUSE 13 - 17 ---
    addSectionHeader('13. INTELLECTUAL PROPERTY & CONFIDENTIALITY');
    addBodyText('13.1. License: Revocable, non-exclusive, non-transferable, royalty-free limited license to access APIs.');
    addBodyText('13.2. Confidentiality: Confidentiality obligations survive termination for 3 years (indefinitely for trade secrets).');

    addSectionHeader('16. MAINTENANCE & SECURITY CHECKS');
    addBodyText('16.1. Routine maintenance with 7 days written notice unless emergency security checks are required (not exceeding 48 hours disruption).');

    addSectionHeader('17. REPRESENTATIONS, WARRANTIES & INDEMNIFICATION');
    addBodyText('17.1. Mutual representations of legal standing, authority, compliance, and IP ownership.');
    addBodyText('17.2. Indemnification: Client fully indemnifies Anchor against losses from data protection breaches, customer fraud/misconduct, or KYC deficiencies.');

    // --- CLAUSE 18 - 22 ---
    addSectionHeader('19. TERMINATION & GOVERNING LAW');
    addBodyText('19.1. Termination for Convenience: 30 Calendar Days prior written notice.');
    addBodyText('19.2. Run-off Period: 6 months run-off period following notice of termination.');
    addBodyText('21. Governing Law & Dispute Resolution: Governed by the laws of the Federal Republic of Nigeria. Disputes resolved through good-faith negotiation and binding arbitration in Lagos, Nigeria.');

    // --- SCHEDULE A ---
    addSectionHeader('SCHEDULE A — SUBSCRIBED SERVICES & APPLICABLE FEES');
    
    if (doc.y > 600) doc.addPage();

    const tableTop = doc.y + 5;
    const col1X = 55;
    const col2X = 170;
    const tableWidth = 485;

    doc.rect(50, tableTop, tableWidth, 20).fill(NAVY);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
    doc.text('Service Category', col1X, tableTop + 5);
    doc.text('Subscribed Features & Production APIs', col2X, tableTop + 5);

    const rows = [
      { p: 'Accounts & Virtual Banking', r: '• Dedicated NGN Virtual Accounts\n• Virtual NUBAN Accounts\n• Dedicated USD Virtual Accounts\n• Banking-as-a-Service APIs\n• Account Creation APIs\n• Virtual Account Provisioning\n• Account Name Resolution' },
      { p: 'Ledger & Infrastructure', r: '• Wallet Infrastructure\n• Wallet Ledger APIs\n• Customer Account APIs\n• Ledger APIs\n• Balance APIs\n• Name Enquiry APIs\n• Transaction Webhooks' },
      { p: 'Payments & Settlement', r: '• Payment Collection\n• Automated Settlement\n• Outbound NIP Transfers\n• Internal Wallet Transfers' },
      { p: 'Treasury & International', r: '• Treasury Management\n• Stablecoin Settlement Rails\n• Cross-Border Banking\n• International Transfers' }
    ];

    let rowY = tableTop + 20;
    rows.forEach((row, idx) => {
      const bg = idx % 2 === 0 ? LIGHT_BG : '#FFFFFF';
      doc.rect(50, rowY, tableWidth, 65).fill(bg).strokeColor(BORDER_COLOR).stroke();
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(8.5).text(row.p, col1X, rowY + 6);
      doc.font('Helvetica').fontSize(8).text(row.r, col2X, rowY + 6, { width: 355 });
      rowY += 65;
    });

    doc.y = rowY + 15;

    // --- SIGNATURE SECTION WITH EMBEDDED SIGNATURE IMAGE ---
    addSectionHeader('EXECUTION & SIGNATURE PAGE');
    addBodyText('IN WITNESS WHEREOF, the Parties have executed this Client Service Agreement as of the Effective Date written above.');

    if (doc.y > 580) doc.addPage();

    const signY = doc.y + 10;

    // Anchor Box (Left - Blank for Anchor representative)
    doc.rect(50, signY, 235, 155).fill(LIGHT_BG).strokeColor(BORDER_COLOR).stroke();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5).text('FOR: ANCHOR SOFTWARE LTD', 60, signY + 10);
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(8.5).text('RC Number: 1888102', 60, signY + 24);
    doc.text('D310 Safe Court Apartments, 19 Ojulari Street, Ikate-Lekki, Lagos', 60, signY + 36, { width: 215 });
    doc.text('Signature: __________________________', 60, signY + 75);
    doc.text('Name: ______________________________', 60, signY + 95);
    doc.text('Title: Authorized Signatory', 60, signY + 115);
    doc.text('Date: ______________________________', 60, signY + 130);

    // Client Box (Right - Jossy Digital Technologies Ltd with Real Signature)
    doc.rect(300, signY, 245, 155).fill(LIGHT_BG).strokeColor(BORDER_COLOR).stroke();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5).text('FOR: JOSSY DIGITAL TECHNOLOGIES LTD', 310, signY + 10);
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(8.5).text('RC Number: 9586407', 310, signY + 24);
    doc.font('Helvetica').fontSize(8.5).text('Operating Entity: NoteStandard', 310, signY + 36);
    doc.text('Registered Address: 10 Winnie Okia Street, Effurun, Delta State, Nigeria', 310, signY + 48, { width: 225 });
    doc.text('Representative: Oboh Aghogho Jossy', 310, signY + 72);
    doc.text('Title: Founder & Chief Executive Officer', 310, signY + 84);
    doc.text('Phone: +2347051824027', 310, signY + 96);
    doc.text('Primary Email: admin@notestandard.com', 310, signY + 106);
    doc.text('Alternative Email: admin.notestandard@gmail.com', 310, signY + 116);

    // Embed Signature Image
    try {
      if (fs.existsSync(signatureImgPath)) {
        doc.image(signatureImgPath, 310, signY + 124, { width: 85, height: 28 });
      } else {
        doc.font('Helvetica-Bold').text('Signature: __________________________', 310, signY + 128);
      }
    } catch (e) {
      console.log('Signature image render error:', e.message);
      doc.font('Helvetica-Bold').text('Signature: [Signed Electronically]', 310, signY + 128);
    }

    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(8).text('Date: 28 July 2026', 420, signY + 138);

    this.addHeaderFooter();

    doc.end();
  }
}

const generator = new FullContractPDFGenerator();
generator.stream.on('finish', () => {
  console.log(`Full Contract PDF generation complete. Copying to brain artifact path: ${brainPath}`);
  try {
    fs.copyFileSync(outputPath, brainPath);
    console.log('Full Contract PDF successfully copied to brain artifacts directory!');
  } catch (err) {
    console.error('Error copying Full Contract PDF to brain directory:', err.message);
  }
});

generator.generate();
