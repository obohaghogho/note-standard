const fs = require('fs');
const path = require('path');
const docx = require('docx');
const PDFDocument = require('pdfkit');

const {
  Document, Pack会议, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer,
  PageNumber, NumberFormat, HeadingLevel, AlignmentType, BorderStyle, WidthType,
  ImageRun, TableOfContents, ShadingType
} = docx;

const signatureImgPath = 'C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\495cca4a-78ef-4d50-9ab1-b5b7a976ccde\\media__1785237279861.jpg';

const docxOutputPath = path.join(__dirname, '..', 'NoteStandard_Anchor_Client_Service_Agreement.docx');
const docxBrainPath = 'C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\495cca4a-78ef-4d50-9ab1-b5b7a976ccde\\NoteStandard_Anchor_Client_Service_Agreement.docx';

const pdfOutputPath = path.join(__dirname, '..', 'NoteStandard_Anchor_Client_Service_Agreement.pdf');
const pdfBrainPath = 'C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\495cca4a-78ef-4d50-9ab1-b5b7a976ccde\\NoteStandard_Anchor_Client_Service_Agreement.pdf';

console.log('Generating Microsoft Word (.docx) & PDF documents...');

// ==========================================
// 1. GENERATE MICROSOFT WORD (.DOCX) FILE
// ==========================================

async function generateDocx() {
  let signatureBuffer = null;
  try {
    if (fs.existsSync(signatureImgPath)) {
      signatureBuffer = fs.readFileSync(signatureImgPath);
    }
  } catch (e) {
    console.log('Signature image load warning:', e.message);
  }

  const doc = new Document({
    creator: 'Jossy Digital Technologies Ltd',
    title: 'CLIENT SERVICE AGREEMENT - ANCHOR SOFTWARE LTD & JOSSY DIGITAL TECHNOLOGIES LTD',
    description: 'Executed Client Service Agreement for NoteStandard BaaS Integration',
    styles: {
      default: {
        font: 'Calibri',
        size: 22, // 11pt
      },
      heading1: {
        run: { font: 'Calibri', size: 28, bold: true, color: '0D1B3D' },
        paragraph: { spacing: { before: 240, after: 120 } }
      },
      heading2: {
        run: { font: 'Calibri', size: 24, bold: true, color: '0052FF' },
        paragraph: { spacing: { before: 180, after: 80 } }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } // 1 inch margins
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: 'CLIENT SERVICE AGREEMENT  |  ANCHOR SOFTWARE LTD & JOSSY DIGITAL TECHNOLOGIES LTD', size: 16, color: '6C757D', italic: true })
              ]
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              children: [
                new TextRun({ text: 'Anchor Software Ltd & Jossy Digital Technologies Ltd — Confidential  ', size: 16, color: '6C757D' }),
                new TextRun({ text: '\tPage ', size: 16, color: '6C757D' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '6C757D' }),
                new TextRun({ text: ' of ', size: 16, color: '6C757D' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '6C757D' })
              ]
            })
          ]
        })
      },
      children: [
        // --- TITLE ---
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
          children: [
            new TextRun({ text: 'CLIENT SERVICE AGREEMENT', size: 36, bold: true, color: '0D1B3D' })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [
            new TextRun({ text: 'BETWEEN\nANCHOR SOFTWARE LTD\nAND\nJOSSY DIGITAL TECHNOLOGIES LTD (NOTESTANDARD)', size: 24, bold: true, color: '0052FF' })
          ]
        }),

        // --- PREAMBLE ---
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun({ text: 'THIS CLIENT SERVICE AGREEMENT ("Agreement") is made this ', size: 22 }),
            new TextRun({ text: '28th day of July 2026', size: 22, bold: true }),
            new TextRun({ text: '.', size: 22 })
          ]
        }),

        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun({ text: 'BETWEEN:\n', size: 22, bold: true }),
            new TextRun({ text: '1. ANCHOR SOFTWARE LTD, a limited liability company duly incorporated under the laws of the Federal Republic of Nigeria with RC Number 1888102, having its registered office at D310 Safe Court Apartments, 19 Ojulari Street, Ikate-Lekki, Lagos (where the context so admits includes its assigns and successors) ("Anchor").\n\n', size: 22 }),
            new TextRun({ text: 'AND:\n', size: 22, bold: true }),
            new TextRun({ text: '2. JOSSY DIGITAL TECHNOLOGIES LTD, RC: 9586407, a Nigerian software technology company operating the NoteStandard platform, having its registered office at 10 Winnie Okia Street, Effurun, Delta State, Nigeria (where the context so admits includes its assigns and successors) ("the Client").', size: 22 })
          ]
        }),

        // --- BACKGROUND ---
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('BACKGROUND')] }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: '1. Anchor is a financial technology company that engages in the business of providing technological and end-to-end business solutions, in facilitating the provision of diverse financial services through its banking partners, to corporate clients;\n\n', size: 22 }),
            new TextRun({ text: '2. The Client is a Nigerian software technology company that develops productivity software and digital collaboration platforms with embedded financial services delivered through regulated Banking-as-a-Service infrastructure and licensed financial partners;\n\n', size: 22 }),
            new TextRun({ text: '3. The Client is desirous of engaging the services of Anchor through its application programming interfaces for the provision of the Subscribed Services to its end users.', size: 22 })
          ]
        }),

        // --- CLAUSE 1 ---
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('1. DEFINITION, INTERPRETATION, AND INCORPORATION BY REFERENCE')] }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: '1.1. Definitions: Agreement, API, Applicable Fees, Applicable Law, Business Day, Calendar Days, Confidential Information, Customer, Data Controller, Data Processor, Data Subject, Disclosing Party, Effective Date (28 July 2026), Industry Standards, Initial Term (12 months), Intellectual Property, Notice Period (30 Business Days), Permissible Use, Personal Data, Recipient, Restricted Business, Run off Period (6 months), Service, Software, Subscribed Services (Schedule A), Transaction Data.\n\n', size: 22 }),
            new TextRun({ text: '1.2. Interpretation: Singular includes plural, headings are for reference only, "including" means "including without limitation".\n\n', size: 22 }),
            new TextRun({ text: '1.3. Incorporation by Reference: Terms, conditions, and policies available on Anchor\'s website from time to time are incorporated into this Agreement with the same force and effect as though fully set forth herein.', size: 22 })
          ]
        }),

        // --- CLAUSES 2 - 12 ---
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('2. DURATION & TERM')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('2.1. Initial Term: This Agreement commences on the Effective Date for twelve (12) months.\n2.2. Automatic Renewal: Automatically renews for successive twelve (12) month periods unless terminated in accordance with this Agreement.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('3. BANKING AS A SERVICE')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('3.1. Anchor shall integrate with licensed financial institutions to provide full banking suites to the Client as specified in Schedule A. The Client subscribes to the suite of Services requested and provided under this Agreement.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('4. ANCHOR OBLIGATIONS')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('4.1. Licenses & Permits: Anchor maintains all required permits/licenses.\n4.2. Software & API: Anchor provides API and software with at least 3 days prior notice for material changes.\n4.3. Account Support & 24/7 Availability: Seamless 24/7 service access, technical specifications, and post-implementation support.\n4.4. Suspension Notice: 72-hour notice provided for any lawful account suspension or cancellation.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('5. CLIENT OBLIGATIONS & COMPLIANCE')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('5.1. Permissible Use: Client agrees to use Services strictly as permitted and shall not facilitate Restricted Businesses.\n5.2. Customer Due Diligence (KYC/CDD): Client is solely responsible for obtaining and verifying KYC/CDD on end-users (BVN/NIN validation) in compliance with AML/CFT/CPF regulations, making docs available to Anchor upon request.\n5.3. Risk Management & Security: Client maintains data protection processes, 2-factor authentication, encryption, and immediate breach notification.\n5.4. Licenses & Permits: Client maintains all permits necessary to operate its business.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('6. COMPLIANCE')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('6.1. Client warrants compliance with all Applicable Laws, CBN directives, NDPA, AML/CFT/CPF regulations, and anti-bribery policies.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('7. PAYMENT COLLECTION & SETTLEMENT SERVICES')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('7.1. Settlement Timeline: Anchor credits Client\'s settlement account net of transaction fees within one (1) Business Day (T+1).\n7.2. Withholding & Regulatory Inquiries: Anchor retains right to withhold payments associated with fraud/illegal activity. Client reimburses reasonable investigation and legal costs.\n7.3. Reconciliation: Real-time dashboard reconciliation; discrepancies must be communicated within 30 days of occurrence.\n7.4. Non-Refundable Fees: Transaction processing fees are non-refundable regardless of reversals, chargebacks, or disputes.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('8. DATA PROTECTION (NDPA / GDPR)')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('8.1. Client acts as Data Controller. Both parties maintain physical/technical data safeguards. Client ensures legal consent from Data Subjects for data processing under the Nigeria Data Protection Act (NDPA).')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('9. OTHER REPORTING OBLIGATIONS')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('9.1. Dormant Accounts: Accounts inactive for 12 continuous months administered per CBN Dormant Account Guidelines.\n9.2. Ancillary Reports: Prompt regulatory filings by each party.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('10. OWNERSHIP OF CUSTOMER')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('10.1. Onboarded users remain solely customers of the Client. Anchor holds no direct contract with end-users except for regulatory compliance.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('11. TAXATION & THIRD-PARTY CONTRACTS')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('11.1. Client responsible for tax collections/remittances. Third-party subcontracts affecting Agreement require Anchor\'s express written consent.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('13. INTELLECTUAL PROPERTY & CONFIDENTIALITY')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('13.1. API License: Revocable, non-exclusive, non-transferable, royalty-free limited license to access Anchor APIs.\n15.1. Confidentiality: Confidentiality obligations survive termination for 3 years (indefinitely for trade secrets).')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('17. REPRESENTATIONS, WARRANTIES & INDEMNIFICATION')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('17.1. Mutual representations of legal standing, authority, compliance, and IP ownership.\n18.1. Indemnification: Client fully indemnifies Anchor against losses from data protection breaches, customer fraud/misconduct, or KYC deficiencies.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('19. TERMINATION & GOVERNING LAW')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('19.1. Termination for Convenience: 30 Calendar Days prior written notice.\n19.2. Run-off Period: 6 months run-off period following notice.\n21.1. Governing Law & Dispute Resolution: Governed by the laws of the Federal Republic of Nigeria. Disputes resolved through binding arbitration in Lagos, Nigeria.')] }),

        // --- SCHEDULE A TABLE ---
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('SCHEDULE A — PRODUCTION SUBSCRIBED SERVICES')] }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 120 },
          children: [new TextRun('The following production services are subscribed to by Jossy Digital Technologies Ltd under this Agreement:')]
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, shading: { fill: '0D1B3D', type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Category', bold: true, color: 'FFFFFF' })] })] }),
                new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, shading: { fill: '0D1B3D', type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Subscribed Service Modules & Features', bold: true, color: 'FFFFFF' })] })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Banking Infrastructure', bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ text: 'Dedicated NGN Virtual Accounts, Dedicated USD Virtual Accounts, Banking-as-a-Service APIs, Wallet Ledger APIs, Customer Account APIs, Virtual Account Provisioning, Account Name Resolution, Transaction Webhooks, Ledger Synchronization' })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Payments & Collections', bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ text: 'Incoming Bank Transfers, Outgoing NIP Transfers, Payment Collection, Merchant Settlement, Wallet Funding, Internal Wallet Transfers' })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Treasury & FX', bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ text: 'Treasury Infrastructure, Stablecoin Settlement Rails, Cross-border Banking Infrastructure, Foreign Exchange Infrastructure, Multi-currency Wallet Support' })] })
              ]
            })
          ]
        }),

        // --- SIGNATURE SECTION ---
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('EXECUTION & SIGNATURE PAGE')] }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 200 },
          children: [new TextRun('IN WITNESS WHEREOF, the Parties have executed this Client Service Agreement as of the 28th day of July 2026.')]
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: 'FOR: ANCHOR SOFTWARE LTD', bold: true, color: '0D1B3D' })] }),
                    new Paragraph({ text: 'RC Number: 1888102' }),
                    new Paragraph({ text: 'D310 Safe Court Apartments, 19 Ojulari Street, Ikate-Lekki, Lagos, Nigeria\n' }),
                    new Paragraph({ text: 'Signature: __________________________' }),
                    new Paragraph({ text: 'Name: Authorized Signatory' }),
                    new Paragraph({ text: 'Title: Director / CEO' }),
                    new Paragraph({ text: 'Date: 28 July 2026' })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: 'FOR: JOSSY DIGITAL TECHNOLOGIES LTD', bold: true, color: '0D1B3D' })] }),
                    new Paragraph({ text: 'RC Number: 9586407 (Operator of NoteStandard)' }),
                    new Paragraph({ text: 'Registered Address: 10 Winnie Okia Street, Effurun, Delta State, Nigeria' }),
                    new Paragraph({ text: 'Representative: Oboh Aghogho Jossy' }),
                    new Paragraph({ text: 'Title: Founder & Chief Executive Officer' }),
                    new Paragraph({ text: 'Phone: +2347051824027 | Email: admin@notestandard.com\n' }),
                    signatureBuffer ? new Paragraph({
                      children: [
                        new ImageRun({
                          data: signatureBuffer,
                          transformation: { width: 140, height: 50 }
                        })
                      ]
                    }) : new Paragraph({ text: 'Signature: __________________________' }),
                    new Paragraph({ text: 'Date: 28 July 2026' })
                  ]
                })
              ]
            })
          ]
        })
      ]
    }]
  });

  const buffer = await docx.Packer.toBuffer(doc);
  fs.writeFileSync(docxOutputPath, buffer);
  console.log(`Word document (.docx) successfully generated at: ${docxOutputPath}`);

  try {
    fs.copyFileSync(docxOutputPath, docxBrainPath);
    console.log('Word document successfully copied to brain artifacts directory!');
  } catch (err) {
    console.error('Error copying docx to brain directory:', err.message);
  }
}

// Execute Docx Generation
generateDocx().catch(err => console.error('Docx generation error:', err));
