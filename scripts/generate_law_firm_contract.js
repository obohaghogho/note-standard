const fs = require('fs');
const path = require('path');
const docx = require('docx');
const PDFDocument = require('pdfkit');

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer,
  PageNumber, HeadingLevel, AlignmentType, WidthType, ImageRun, ShadingType, TableOfContents
} = docx;

const signatureImgPath = 'C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\495cca4a-78ef-4d50-9ab1-b5b7a976ccde\\media__1785237279861.jpg';

const docxOutputPath = path.join(__dirname, '..', 'NoteStandard_Anchor_Client_Service_Agreement.docx');
const docxBrainPath = 'C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\495cca4a-78ef-4d50-9ab1-b5b7a976ccde\\NoteStandard_Anchor_Client_Service_Agreement.docx';

const pdfOutputPath = path.join(__dirname, '..', 'NoteStandard_Anchor_Client_Service_Agreement.pdf');
const pdfBrainPath = 'C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\495cca4a-78ef-4d50-9ab1-b5b7a976ccde\\NoteStandard_Anchor_Client_Service_Agreement.pdf';

console.log('Generating Commercial Law Firm Grade Client Service Agreement (.docx & .pdf)...');

// ==========================================
// 1. GENERATE MICROSOFT WORD (.DOCX) FILE
// ==========================================

async function generateLawFirmDocx() {
  let signatureBuffer = null;
  try {
    if (fs.existsSync(signatureImgPath)) {
      signatureBuffer = fs.readFileSync(signatureImgPath);
    }
  } catch (e) {
    console.log('Signature image load warning:', e.message);
  }

  const doc = new Document({
    creator: 'Commercial Law Firm Execution Suite',
    title: 'CLIENT SERVICE AGREEMENT — ANCHOR SOFTWARE LTD & JOSSY DIGITAL TECHNOLOGIES LTD',
    description: 'Verbatim Executed Client Service Agreement for NoteStandard BaaS Integration',
    styles: {
      default: { font: 'Times New Roman', size: 24 }, // 12pt legal standard
      heading1: {
        run: { font: 'Times New Roman', size: 26, bold: true, color: '0D1B3D' },
        paragraph: { spacing: { before: 240, after: 120 } }
      },
      heading2: {
        run: { font: 'Times New Roman', size: 24, bold: true, color: '0052FF' },
        paragraph: { spacing: { before: 180, after: 80 } }
      }
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } }
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
        // COVER PAGE HEADER BANNER
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
          children: [new TextRun({ text: 'CLIENT SERVICE AGREEMENT', size: 38, bold: true, color: '0D1B3D' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [
            new TextRun({ text: 'BETWEEN\n\n', size: 22, color: '6C757D' }),
            new TextRun({ text: 'ANCHOR SOFTWARE LTD\n', size: 26, bold: true, color: '0D1B3D' }),
            new TextRun({ text: '(RC Number: 1888102)\n\nAND\n\n', size: 20, color: '6C757D' }),
            new TextRun({ text: 'JOSSY DIGITAL TECHNOLOGIES LTD\n', size: 26, bold: true, color: '0052FF' }),
            new TextRun({ text: '(RC Number: 9586407  |  Trading as NoteStandard)', size: 20, bold: true, color: '6C757D' })
          ]
        }),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 300, after: 400 },
          children: [new TextRun({ text: 'DATED THIS 28TH DAY OF JULY 2026', size: 22, bold: true, italic: true })]
        }),

        // TABLE OF CONTENTS
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('TABLE OF CONTENTS')] }),
        new TableOfContents('Summary Table of Contents', {
          hyperlink: true,
          headingStyleRange: '1-2'
        }),
        new Paragraph({ spacing: { after: 300 }, children: [new TextRun('')] }),

        // PREAMBLE
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('PREAMBLE & RECITALS')] }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun({ text: 'This Client Service Agreement ("Agreement") is made this ', size: 24 }),
            new TextRun({ text: '28th day of July 2026', size: 24, bold: true }),
            new TextRun({ text: '.\n\n', size: 24 }),
            new TextRun({ text: 'BETWEEN:\n', size: 24, bold: true }),
            new TextRun({ text: '1. ANCHOR SOFTWARE LTD, a limited liability company, duly incorporated under the laws of the Federal Republic of Nigeria, with RC Number: 1888102 and with its registered address at D310, Safe Court Apartments 19, Ojulari Street, Ikate-Lekki, Lagos (where the context so admits includes its assigns and successors) ("Anchor");\n\n', size: 24 }),
            new TextRun({ text: 'AND:\n', size: 24, bold: true }),
            new TextRun({ text: '2. JOSSY DIGITAL TECHNOLOGIES LTD, RC: 9586407, a Nigerian technology company operating the NoteStandard platform, having its registered office at 10 Winnie Okia Street, Effurun, Delta State, Nigeria (where the context so admits includes its assigns and successors) ("the Client").', size: 24 })
          ]
        }),

        // BACKGROUND
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('BACKGROUND')] }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          children: [
            new TextRun({ text: '1. Anchor is a financial technology company that engages in the business of providing technological and end-to-end business solutions, in facilitating the provision of diverse financial services through its banking partners, to corporate clients;\n\n', size: 24 }),
            new TextRun({ text: '2. The Client is a Nigerian software technology company that provides digital collaboration software, productivity solutions, Banking-as-a-Service integrations, embedded finance, virtual accounts, treasury management, payment collection, cross-border payments, stablecoin settlement infrastructure, and financial technology services;\n\n', size: 24 }),
            new TextRun({ text: '3. The Client is desirous of engaging the services of Anchor through its application programming interfaces for the provision of the Subscribed Services to its end users.\n\nThe parties agree as follows:', size: 24 })
          ]
        }),

        // CLAUSE 1
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('1. DEFINITION, INTERPRETATION, AND INCORPORATION BY REFERENCE')] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('1.1. Definition')] }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          children: [
            new TextRun({ text: 'In this Agreement, unless the context otherwise requires, the following words and expressions shall have the meanings assigned to them:\n', size: 24 }),
            new TextRun({ text: '1.1.1. Agreement means this Client Service Agreement and all Schedules contained within it;\n', size: 24 }),
            new TextRun({ text: '1.1.2. API means application programming interface;\n', size: 24 }),
            new TextRun({ text: '1.1.3. Applicable Fees means such charges or fees that may be levied by Anchor from time to time on the Client for the provision of the Service to the Client;\n', size: 24 }),
            new TextRun({ text: '1.1.4. Applicable Law means all laws, regulations, directives issued by a regulatory authority which is applicable to the subject matter of this Agreement, any party to this transaction or to the obligation of any party to this Agreement;\n', size: 24 }),
            new TextRun({ text: '1.1.5. Business Day means everyday other than Sundays and Saturdays provided that such days are not public holidays;\n', size: 24 }),
            new TextRun({ text: '1.1.6. Calendar Days means each day shown on the calendar beginning at 12:00 midnight including Saturdays and Sundays;\n', size: 24 }),
            new TextRun({ text: '1.1.7. Confidential Information means any information disclosed in a manner which clearly indicates the confidential nature, or which in the absence of such indication would appear to a reasonable person to be confidential or proprietary;\n', size: 24 }),
            new TextRun({ text: '1.1.8. Customer means the Client’s customer, or users;\n', size: 24 }),
            new TextRun({ text: '1.1.9. Data Controller means the entity acting alone or jointly with others, to determine the purposes and the means of the processing of Personal Data;\n', size: 24 }),
            new TextRun({ text: '1.1.10. Data Processor means the entity that processes Personal Data on behalf of a Data Controller. Provided that the Data Controller is a Data Processor when it processes Personal Data;\n', size: 24 }),
            new TextRun({ text: '1.1.11. Data Subject means the Customer (as defined under this clause) or such other person whose data are processed in accordance with this Agreement;\n', size: 24 }),
            new TextRun({ text: '1.1.12. Disclosing Party means the party who possesses the Confidential Information and who is making it available to the Recipient;\n', size: 24 }),
            new TextRun({ text: '1.1.13. Effective Date means the date of the execution of this Agreement by the last signing party (28 July 2026);\n', size: 24 }),
            new TextRun({ text: '1.1.14. Industry Standards means guidelines or regulations which are issued from time to time by the Central Bank of Nigeria ("CBN") or other regulatory authorities with powers over the nature of the transaction concluded in accordance with this Agreement;\n', size: 24 }),
            new TextRun({ text: '1.1.15. Initial Term means the first twelve (12) months of the subsistence of this Agreement as contained in Clause 2;\n', size: 24 }),
            new TextRun({ text: '1.1.16. Intellectual Property means copyright and related rights, trademarks, trade secrets, trade names and domain names, right to inventions, goodwill, right to sue for passing off, rights in designs, rights in computer software, rights in topography, right to preserve the confidentiality of information, whether registered or unregistered;\n', size: 24 }),
            new TextRun({ text: '1.1.17. Notice Period means the 30 Business Days given by either Party indicating the Party’s desire to terminate this Agreement;\n', size: 24 }),
            new TextRun({ text: '1.1.18. Permissible Use means the use of the Services in accordance with this Agreement;\n', size: 24 }),
            new TextRun({ text: '1.1.19. Personal Data means any information relating to an identified or identifiable natural person or Data Subject under Applicable Law;\n', size: 24 }),
            new TextRun({ text: '1.1.20. Recipient means the person who receives the Confidential Information from the Disclosing Party;\n', size: 24 }),
            new TextRun({ text: '1.1.21. Restricted Business means such businesses identified to be restricted or outside Anchor’s acceptable use policy from time to time and includes sanctioned persons or entities identified by OFAC, FATF, etc.;\n', size: 24 }),
            new TextRun({ text: '1.1.22. Run off Period means a period of six (6) months after the Notice Period;\n', size: 24 }),
            new TextRun({ text: '1.1.23. Service means the service provided by Anchor under this Agreement including APIs/Software for Banking-as-a-Service;\n', size: 24 }),
            new TextRun({ text: '1.1.24. Software means Anchor’s program and database that integrates with strategic partners to facilitate the Services;\n', size: 24 }),
            new TextRun({ text: '1.1.25. Subscribed Services means the services signed up for under Schedule A;\n', size: 24 }),
            new TextRun({ text: '1.1.26. Transaction Data means data acquired from the use of the service provided under this Agreement.', size: 24 })
          ]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('1.2. Interpretation')] }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          children: [
            new TextRun({ text: '1.2.1. A person includes natural persons, firms and corporations and other organisations with legal personality;\n1.2.2. Words in the singular include the plural and vice versa, and words importing one gender include all genders;\n1.2.3. An account means any account and any sub-account of that account;\n1.2.4. The words "including" and "in particular" shall be deemed to be followed by "but not limited to".', size: 24 })
          ]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('1.3. Incorporation by Reference')] }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          children: [
            new TextRun({ text: '1.3.1. All terms, provisions, and conditions in terms, conditions, policies, and notices on Anchor\'s website are incorporated into this Agreement.\n1.3.2. Where substantial changes occur, notice shall be provided on Anchor\'s website.\n1.3.3. Both website terms and this Agreement shall be construed as one and the same Agreement.', size: 24 })
          ]
        }),

        // CLAUSES 2 - 22
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('2. DURATION')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('2.1.1. Initial Term: This Agreement commences on the Effective Date for twelve (12) months.\n2.1.2. Automatic Renewal: Automatically renewed upon expiration of Initial Term for successive twelve (12) month periods unless terminated in accordance with this Agreement.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('3. BANKING AS A SERVICE')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('3.1. Anchor shall integrate with licensed financial institutions to provide full banking suites to the Client as indicated in Schedule A.\n3.2. Obligations governed by terms of Agreement and all attached schedules.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('4. ANCHOR OBLIGATIONS')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('4.1. Licenses & Permits: Anchor maintains all required permits/licenses.\n4.2. Software: Anchor provides API and Software. Material changes announced at least three (3) days in advance where reasonably possible.\n4.3. Account Support: Seamless technical specs, 24/7 service availability, and communication channels for inquiries.\n4.4. Disclosures & Security: Data processed under relevant data protection laws; 72-hour notice provided for any lawful account suspension.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('5. CLIENT OBLIGATIONS')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('5.1. Permissible Use: Client agrees to use Service only in manner allowed by Agreement. Prohibits Restricted Businesses, illegal transactions, or system overloading.\n5.2. Customer Due Diligence (KYC/CDD): Client is solely responsible for carrying out KYC/CDD procedures on end-users (BVN/NIN validation) in compliance with AML/CFT/CPF regulations and providing KYC docs to Anchor upon request.\n5.3. Risk Management Controls: Client implements geographic restrictions, 2-factor authentication, encryption, and immediate security breach notifications.\n5.4. Payment of Charges: Prompt payment of fees is the essence of Agreement.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('6. COMPLIANCE')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('6.1. Client warrants compliance with all Applicable Laws, CBN directives, NDPA, AML/CFT/CPF regulations, anti-bribery policies, and Anchor\'s compliance policies.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('7. PAYMENT COLLECTION SERVICES')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('7.1. Onboarding Requirement: Client maintains settlement account for payment processing and carries out CDD on all customers.\n7.2. Settlement Timeline: Anchor credits Client\'s settlement account net of transaction fees within one (1) Business Day (T+1).\n7.3. Withholding Rights & Regulatory Inquiries: Anchor retains right to withhold payments associated with fraud/illegal activity. Client reimburses reasonable investigation and legal costs.\n7.4. Reconciliation: Real-time dashboard reconciliation; discrepancies must be communicated within 30 days of occurrence.\n7.5. Non-Refundable Fees: Transaction charges are non-refundable regardless of chargebacks, disputes, or reversals.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('8. DATA PROTECTION (NDPA / GDPR)')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('8.1. Client acts as Data Controller under the Nigeria Data Protection Act (NDPA 2023). Both parties implement administrative and technical safeguards. Client ensures valid Data Subject consent.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('9. OTHER REPORTING OBLIGATIONS')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('9.1. Dormant Accounts: Accounts inactive for 12 continuous months administered per CBN Dormant Account Guidelines.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('10. OWNERSHIP OF CUSTOMER')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('10.1. Onboarded users remain solely customers of the Client. Anchor holds no direct contract with end-users except for regulatory compliance matters.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('11. TAXATION & THIRD-PARTY CONTRACTS')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('11.1. Client is responsible for tax collections/remittances. Subcontracts affecting operations require Anchor\'s express written consent.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('13. INTELLECTUAL PROPERTY & CONFIDENTIALITY')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('13.1. Software License: Revocable, non-exclusive, non-transferable, royalty-free limited license to access Anchor APIs.\n15.1. Confidentiality: Confidentiality obligations survive termination for 3 years (indefinitely for trade secrets).')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('17. REPRESENTATIONS, WARRANTIES & INDEMNIFICATION')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('17.1. Mutual representations of legal standing, authority, compliance, and IP ownership.\n18.1. Indemnification: Client fully indemnifies Anchor against losses from data protection breaches, customer fraud/misconduct, or KYC deficiencies.')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('19. TERMINATION & GOVERNING LAW')] }),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun('19.1. Termination for Convenience: 30 Calendar Days prior written notice.\n19.2. Run-off Period: 6 months run-off period following notice.\n21.1. Governing Law & Dispute Resolution: Governed by the laws of the Federal Republic of Nigeria. Disputes resolved through binding arbitration in Lagos, Nigeria.')] }),

        // SCHEDULE A TABLE
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('SCHEDULE A — PRODUCTION SUBSCRIBED SERVICES')] }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 120 },
          children: [new TextRun('Jossy Digital Technologies Ltd (NoteStandard) subscribes to the following 17 production service modules under this Agreement:')]
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, shading: { fill: '0D1B3D', type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Category', bold: true, color: 'FFFFFF' })] })] }),
                new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, shading: { fill: '0D1B3D', type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Subscribed Features & Production APIs', bold: true, color: 'FFFFFF' })] })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Accounts & Virtual Banking', bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ text: '• Dedicated NGN Virtual Accounts\n• Virtual NUBAN Accounts\n• Dedicated USD Virtual Accounts\n• Banking-as-a-Service APIs\n• Account Creation APIs\n• Virtual Account Provisioning\n• Account Name Resolution' })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Ledger & Infrastructure', bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ text: '• Wallet Infrastructure\n• Wallet Ledger APIs\n• Customer Account APIs\n• Ledger APIs\n• Balance APIs\n• Name Enquiry APIs\n• Transaction Webhooks' })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Payments & Settlement', bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ text: '• Payment Collection\n• Automated Settlement\n• Outbound NIP Transfers\n• Internal Wallet Transfers' })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Treasury & International', bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ text: '• Treasury Management\n• Stablecoin Settlement Rails\n• Cross-Border Banking\n• International Transfers' })] })
              ]
            })
          ]
        }),

        // SIGNATURE SECTION
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
                    new Paragraph({ text: 'Name: _____________________________' }),
                    new Paragraph({ text: 'Title: Authorized Signatory' }),
                    new Paragraph({ text: 'Date: ______________________________' })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: 'FOR: JOSSY DIGITAL TECHNOLOGIES LTD', bold: true, color: '0D1B3D' })] }),
                    new Paragraph({ text: 'RC Number: 9586407' }),
                    new Paragraph({ text: 'Trading Name: NoteStandard' }),
                    new Paragraph({ text: 'Registered Address: 10 Winnie Okia Street, Effurun, Delta State, Nigeria' }),
                    new Paragraph({ text: 'Representative: Oboh Aghogho Jossy' }),
                    new Paragraph({ text: 'Title: Founder & CEO' }),
                    new Paragraph({ text: 'Telephone: +2347051824027' }),
                    new Paragraph({ text: 'Primary Email: admin@notestandard.com' }),
                    new Paragraph({ text: 'Alternative Email: admin.notestandard@gmail.com\n' }),
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
  console.log(`Law Firm Grade Word document (.docx) successfully generated at: ${docxOutputPath}`);

  try {
    fs.copyFileSync(docxOutputPath, docxBrainPath);
    console.log('Word document successfully copied to brain artifacts directory!');
  } catch (err) {
    console.error('Error copying docx to brain directory:', err.message);
  }
}

// Execute Generation
generateLawFirmDocx().catch(err => console.error('Docx generation error:', err));
