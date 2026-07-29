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

console.log(`Generating Executed Client Service Agreement PDF at: ${outputPath}`);

class ContractPDFGenerator {
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

    // --- RECITALS & BACKGROUND ---
    addSectionHeader('BACKGROUND & PREAMBLE');
    addBodyText('THIS CLIENT SERVICE AGREEMENT is made this 28th day of July 2026.');
    addBodyText('BETWEEN ANCHOR SOFTWARE LTD, a limited liability company duly incorporated under the laws of the Federal Republic of Nigeria with RC Number: 1888102, having its registered address at D310, Safe Court Apartments 19, Ojulari Street, Ikate-Lekki, Lagos ("Anchor");');
    addBodyText('AND JOSSY DIGITAL TECHNOLOGIES LTD, a technology company operating the NoteStandard platform, with its registered office at 10 Winnie Okia Street, Effurun, Delta State, Nigeria ("the Client").');
    addBodyText('BACKGROUND: Anchor engages in providing technological solutions facilitating financial services through banking partners. The Client provides software technology and digital workspace software with embedded financial services. The Client engages Anchor through its APIs for Subscribed Services.');

    // --- KEY CLAUSES SUMMARY ---
    addSectionHeader('1. DEFINITIONS & INCORPORATION BY REFERENCE');
    addBodyText('1.1 Key terms including Agreement, API, Applicable Fees, Applicable Law, Customer, Data Controller, Data Processor, Effective Date, Industry Standards, Initial Term (12 months), Permissible Use, Restricted Business, and Subscribed Services are incorporated by reference.');
    addBodyText('1.2 Incorporation by Reference: Terms, conditions, and policies available on Anchor\'s website are incorporated into this Agreement.');

    addSectionHeader('2. DURATION & TERM');
    addBodyText('2.1 Initial Term: Commences on the Effective Date for twelve (12) months.');
    addBodyText('2.2 Automatic Renewal: Automatically renews for successive 12-month periods unless terminated in accordance with the Agreement.');

    addSectionHeader('3. BANKING AS A SERVICE & ANCHOR OBLIGATIONS');
    addBodyText('3.1 Banking Integration: Anchor integrates with licensed financial institutions to provide full banking suites as specified in Schedule A.');
    addBodyText('3.2 Licenses & Software: Anchor maintains necessary permits/licenses and provides APIs/Software to enable delivery of financial services.');
    addBodyText('3.3 Account Support & Uptime: Anchor maintains 24/7 service periods, post-implementation support, and resolution channels under SLA.');

    addSectionHeader('4. CLIENT OBLIGATIONS & PERMISSIBLE USE');
    addBodyText('4.1 Permissible Use: Client agrees to use Services strictly as permitted and shall not facilitate Restricted Businesses or prohibited activities.');
    addBodyText('4.2 Customer Due Diligence (KYC/CDD): Client is solely responsible for obtaining and verifying KYC/CDD on its customers in compliance with applicable AML/CFT regulations.');
    addBodyText('4.3 Data Protection & Security: Client maintains data security policies, 2-factor authentication, encryption, and prompt breach notifications.');

    addSectionHeader('5. PAYMENT COLLECTION & SETTLEMENT SERVICES');
    addBodyText('5.1 Settlement Account: Anchor credits Client\'s settlement account net of transaction fees within one (1) Business Day.');
    addBodyText('5.2 Withholding & Regulatory Requests: Anchor may withhold funds under fraud/regulatory inquiries, with Client reimbursing reasonable investigation costs.');
    addBodyText('5.3 Reconciliation: Real-time dashboard reconciliation with 30-day discrepancy notification window.');

    addSectionHeader('6. INTELLECTUAL PROPERTY & CONFIDENTIALITY');
    addBodyText('6.1 Software License: Anchor grants a revocable, non-exclusive, non-transferable, royalty-free limited license to access APIs.');
    addBodyText('6.2 Confidentiality: Mutual confidentiality obligations last throughout the Agreement and for 3 years post-termination (indefinitely for trade secrets).');

    addSectionHeader('7. REPRESENTATIONS, WARRANTIES & INDEMNIFICATION');
    addBodyText('7.1 Mutual Representations: Corporate good standing, authority to execute, compliance with applicable laws, and non-infringement of IP.');
    addBodyText('7.2 Indemnification: Mutual indemnification for breaches, with Client fully indemnifying Anchor for data protection breaches, fraud/misconduct by customers/agents, or KYC deficiencies.');

    addSectionHeader('8. SCHEDULE A — SUBSCRIBED SERVICES');
    addBulletList([
      'Dedicated NGN Virtual Accounts (Virtual NUBANs)',
      'USD Banking & Account Infrastructure',
      'Banking-as-a-Service (BaaS) API Access',
      'Treasury Management & Stablecoin Settlement Rails',
      'Cross-Border Banking & International Settlement Services',
      'Payment Collection & Automated Settlement Services'
    ]);

    // --- SIGNATURE SECTION WITH EMBEDDED IMAGE ---
    addSectionHeader('9. EXECUTION & SIGN-OFF');
    addBodyText('IN WITNESS WHEREOF, the Parties have executed this Client Service Agreement as of the Effective Date written above.');

    if (doc.y > 620) doc.addPage();

    const signY = doc.y + 10;

    // Anchor Box (Left)
    doc.rect(50, signY, 235, 130).fill(LIGHT_BG).strokeColor(BORDER_COLOR).stroke();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5).text('SIGNED FOR & ON BEHALF OF:', 60, signY + 10);
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10).text('ANCHOR SOFTWARE LTD', 60, signY + 24);
    doc.font('Helvetica').fontSize(8.5).text('RC Number: 1888102', 60, signY + 38);
    doc.text('Authorized Signatory', 60, signY + 80);
    doc.font('Helvetica-Oblique').text('Director / Legal Counsel', 60, signY + 95);

    // Client Box (Right) with Real Embedded Signature!
    doc.rect(300, signY, 245, 130).fill(LIGHT_BG).strokeColor(BORDER_COLOR).stroke();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5).text('SIGNED FOR & ON BEHALF OF:', 310, signY + 10);
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10).text('JOSSY DIGITAL TECHNOLOGIES LTD', 310, signY + 24);
    doc.font('Helvetica').fontSize(8.5).text('NoteStandard Platform', 310, signY + 38);

    // Embed Signature Image
    try {
      if (fs.existsSync(signatureImgPath)) {
        doc.image(signatureImgPath, 310, signY + 50, { width: 90, height: 40 });
      } else {
        doc.font('Helvetica-Bold').text('[Signature Attached]', 310, signY + 60);
      }
    } catch (e) {
      console.log('Signature image render error:', e.message);
      doc.font('Helvetica-Bold').text('[Signed Electrically]', 310, signY + 60);
    }

    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9).text('Oboh Aghogho Jossy', 310, signY + 95);
    doc.font('Helvetica').fontSize(8.5).text('Founder & CEO — Jossy Digital Technologies Ltd', 310, signY + 108);

    this.addHeaderFooter();

    doc.end();
  }
}

const generator = new ContractPDFGenerator();
generator.stream.on('finish', () => {
  console.log(`Contract PDF generation complete. Copying to brain artifact path: ${brainPath}`);
  try {
    fs.copyFileSync(outputPath, brainPath);
    console.log('Contract PDF successfully copied to brain artifacts directory!');
  } catch (err) {
    console.error('Error copying Contract PDF to brain directory:', err.message);
  }
});

generator.generate();
