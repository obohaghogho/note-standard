const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── Colors ───
const NAVY = '#0D1B3D';
const RED = '#E30613';
const GREY = '#6C757D';
const LIGHT_GREY = '#F2F4F7';
const DARK_TEXT = '#2B2B2B';
const WHITE = '#FFFFFF';

// Create target directory if it doesn't exist
const outputDir = path.join(__dirname, '..', '..');
const outputPath = path.join(outputDir, 'NoteStandard_Zenith_Bank_Proposal_v2.pdf');

console.log(`Initializing PDF generation. Saving to: ${outputPath}`);

// Initialize document in A4 Portrait mode with 50pt margins
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 60, bottom: 60, left: 50, right: 50 },
  bufferPages: true
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// ─────────────────────────────────────────────────────────────────────────────
// ─── Helper Functions ────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// Draw vector Zenith "Z" logo on cover page
function drawZenithLogo(doc, x, y, size) {
  doc.save();
  doc.translate(x, y);
  doc.scale(size / 100);
  
  // Outer stylized red Z segment
  doc.moveTo(10, 10)
     .lineTo(90, 10)
     .lineTo(30, 90)
     .lineTo(90, 90)
     .lineTo(80, 100)
     .lineTo(10, 100)
     .lineTo(70, 20)
     .lineTo(10, 20)
     .closePath()
     .fill(RED);
     
  doc.restore();
}

// Draw vector NoteStandard logo
function drawNoteStandardLogo(doc, x, y, size) {
  doc.save();
  doc.translate(x, y);
  doc.scale(size / 100);
  
  // Custom double layered N logo in Navy and Red
  doc.rect(10, 10, 20, 80).fill(NAVY);
  doc.rect(70, 10, 20, 80).fill(NAVY);
  
  doc.moveTo(30, 10)
     .lineTo(70, 90)
     .lineTo(50, 90)
     .lineTo(30, 50)
     .closePath()
     .fill(RED);
     
  doc.restore();
}

// Global page header (drawn on every page except cover page)
function drawHeader(doc, titleText) {
  doc.save();
  
  // NoteStandard Logo Icon (top left)
  doc.rect(50, 20, 8, 25).fill(NAVY);
  doc.rect(63, 20, 8, 25).fill(NAVY);
  doc.moveTo(58, 20).lineTo(63, 45).lineTo(58, 45).closePath().fill(RED);
  
  doc.fillColor(NAVY)
     .font('Helvetica-Bold')
     .fontSize(10)
     .text('NOTESTANDARD', 76, 23);
     
  doc.fillColor(GREY)
     .font('Helvetica')
     .fontSize(8)
     .text('TECHNOLOGIES', 76, 33);
     
  // Header text (top right)
  doc.fillColor(NAVY)
     .font('Helvetica-Bold')
     .fontSize(9)
     .text(titleText.toUpperCase(), 50, 25, { align: 'right', width: 495 });
     
  doc.fillColor(GREY)
     .font('Helvetica')
     .fontSize(7)
     .text('STRATEGIC BANKING PARTNERSHIP PROPOSAL', 50, 36, { align: 'right', width: 495 });
     
  // Border line
  doc.moveTo(50, 50).lineTo(545, 50).lineWidth(0.5).stroke(NAVY);
  doc.restore();
}

// Global page footer (drawn on every page except cover page)
function drawFooter(doc, pageNum, totalPages) {
  doc.save();
  doc.moveTo(50, 790).lineTo(545, 790).lineWidth(0.5).stroke(GREY);
  
  doc.fillColor(GREY)
     .font('Helvetica')
     .fontSize(8)
     .text('CONFIDENTIAL - FOR ZENITH BANK ECOMMERCIAL TEAM USE ONLY', 50, 798);
     
  doc.text(`Page ${pageNum} of ${totalPages}`, 50, 798, { align: 'right', width: 495 });
  doc.restore();
}

// Subheading helper
function addSectionHeader(doc, num, title) {
  doc.moveDown(1.5);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(14).text(`${num}. ${title}`);
  doc.rect(doc.x, doc.y + 2, 40, 3).fill(RED);
  doc.moveDown(1);
}

// Bullet point helper
function bullet(doc, text, boldPrefix = '') {
  doc.save();
  const currentX = 50; // Align with the left margin (50)
  const currentY = doc.y;
  
  // Draw bullet circle
  doc.circle(currentX + 5, currentY + 6, 2.5).fill(RED);
  
  // Set cursor position explicitly to avoid PDFKit continued text width shriveling bug
  doc.x = currentX + 15;
  doc.y = currentY;
  
  doc.fillColor(DARK_TEXT).fontSize(10);
  
  if (boldPrefix) {
    doc.font('Helvetica-Bold').text(boldPrefix, { continued: true });
    doc.font('Helvetica').text(text, { width: 480 });
  } else {
    doc.font('Helvetica').text(text, { width: 480 });
  }
  doc.restore();
  doc.x = 50; // Reset left margin cursor position
  doc.moveDown(0.4);
}

// Screenshot Placeholder box
function drawScreenshotPlaceholder(doc, labelText) {
  doc.save();
  const startY = doc.y + 10;
  
  // Correctly separate fill and stroke to prevent path consumption bugs
  doc.rect(50, startY, 495, 140).fill(LIGHT_GREY);
  doc.rect(50, startY, 495, 140).stroke(GREY);
     
  // Inner image icon
  doc.rect(275, startY + 35, 45, 30).lineWidth(1).stroke(GREY);
  doc.circle(287, startY + 45, 4).stroke(GREY);
  doc.moveTo(275, startY + 65).lineTo(290, startY + 50).lineTo(300, startY + 58).lineTo(310, startY + 45).lineTo(320, startY + 65).stroke(GREY);
  
  doc.fillColor(GREY)
     .font('Helvetica-Bold')
     .fontSize(10)
     .text(`Screenshot Placeholder: ${labelText}`, 50, startY + 80, { align: 'center', width: 495 });
     
  doc.fillColor(GREY)
     .font('Helvetica-Oblique')
     .fontSize(8)
     .text('(Will display high-resolution application screen mockups in final render)', 50, startY + 95, { align: 'center', width: 495 });
     
  doc.restore();
  doc.x = 50; // Reset left margin cursor position
  doc.y = startY + 160;
}

// Table generator
function drawTable(doc, startY, tableHeaders, tableRows, columnWidths) {
  doc.save();
  let currentY = startY;
  
  // Header row
  doc.rect(50, currentY, 495, 25).fill(NAVY);
  let currentX = 50;
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9);
  
  for (let i = 0; i < tableHeaders.length; i++) {
    doc.text(tableHeaders[i], currentX + 8, currentY + 8, { width: columnWidths[i] - 10, lineBreak: false });
    currentX += columnWidths[i];
  }
  currentY += 25;
  
  // Rows
  doc.font('Helvetica').fontSize(8.5);
  for (let r = 0; r < tableRows.length; r++) {
    const row = tableRows[r];
    const isEven = (r % 2 === 0);
    
    // Background fill
    doc.rect(50, currentY, 495, 22).fill(isEven ? WHITE : LIGHT_GREY);
    
    currentX = 50;
    doc.fillColor(DARK_TEXT);
    for (let c = 0; c < row.length; c++) {
      doc.text(String(row[c]), currentX + 8, currentY + 7, { width: columnWidths[c] - 10, lineBreak: false });
      currentX += columnWidths[c];
    }
    
    // Bottom border line for row
    doc.moveTo(50, currentY + 22).lineTo(545, currentY + 22).lineWidth(0.5).stroke(GREY);
    currentY += 22;
  }
  
  doc.restore();
  doc.x = 50; // Reset left margin cursor position
  doc.y = currentY + 15;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── Diagram Drawing Helpers (NATIVE VECTORS) ───────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// Helper to draw horizontal arrow
function drawArrow(doc, startX, endX, y) {
  doc.moveTo(startX, y).lineTo(endX, y).lineWidth(1.5).stroke(GREY);
  doc.moveTo(endX - 6, y - 4).lineTo(endX, y).lineTo(endX - 6, y + 4).fill(GREY);
}

// 1. User Journey Diagram
function drawUserJourney(doc) {
  doc.save();
  const startY = doc.y + 15;
  const nodes = ['Register', 'Verify Email', 'Login', 'Explore', 'Subscribe', 'Payment', 'Premium'];
  
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('User Journey Step Flow', 50, startY - 5, { align: 'center', width: 495 });
  
  const totalWidth = 495;
  const nodeCount = nodes.length;
  const stepX = totalWidth / nodeCount;
  
  for (let i = 0; i < nodeCount; i++) {
    const cx = 50 + (i * stepX) + (stepX / 2);
    const cy = startY + 40;
    
    // Node Circle
    doc.circle(cx, cy, 18).fill(i === 6 ? RED : NAVY);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9).text(String(i + 1), cx - 5, cy - 4);
    
    // Label
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(7.5).text(nodes[i], cx - 25, cy + 24, { width: 50, align: 'center' });
    
    // Connective Arrow
    if (i < nodeCount - 1) {
      drawArrow(doc, cx + 18, cx + stepX - 18, cy);
    }
  }
  
  doc.restore();
  doc.y = startY + 95;
}

// 2. Current Payment Flow Diagram
function drawCurrentPayment(doc) {
  doc.save();
  const startY = doc.y + 15;
  
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('Current Payment & Activation Loop', 50, startY - 5, { align: 'center', width: 495 });
  
  // Row 1 (Forward Flow)
  const cy1 = startY + 35;
  const steps1 = ['User', 'Choose Plan', 'Checkout', 'Gateway', 'Authorize'];
  const stepX = 495 / 5;
  
  for (let i = 0; i < 5; i++) {
    const cx = 50 + (i * stepX) + (stepX / 2);
    doc.rect(cx - 35, cy1 - 15, 70, 30).fill(NAVY);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7).text(steps1[i], cx - 32, cy1 - 5, { width: 64, align: 'center' });
    
    if (i < 4) {
      drawArrow(doc, cx + 35, cx + stepX - 35, cy1);
    }
  }
  
  // Connect Row 1 to Row 2
  doc.moveTo(50 + 4 * stepX + stepX/2, cy1 + 15).lineTo(50 + 4 * stepX + stepX/2, cy1 + 45).lineWidth(1.5).stroke(GREY);
  doc.moveTo(50 + 4 * stepX + stepX/2 - 4, cy1 + 40).lineTo(50 + 4 * stepX + stepX/2, cy1 + 45).lineTo(50 + 4 * stepX + stepX/2 + 4, cy1 + 40).fill(GREY);
  
  // Row 2 (Backend Processing & Callback Loop)
  const cy2 = startY + 90;
  const steps2 = ['Success', 'Webhook', 'Verify (BE)', 'Update DB', 'Receipt'];
  
  // Draw backward flow
  for (let i = 4; i >= 0; i--) {
    const cx = 50 + (i * stepX) + (stepX / 2);
    doc.rect(cx - 35, cy2 - 15, 70, 30).fill(i === 0 ? RED : NAVY);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7).text(steps2[4 - i], cx - 32, cy2 - 5, { width: 64, align: 'center' });
    
    if (i > 0) {
      // Arrow pointing left
      const startX = cx - 35;
      const endX = cx - stepX + 35;
      doc.moveTo(startX, cy2).lineTo(endX, cy2).lineWidth(1.5).stroke(GREY);
      doc.moveTo(endX + 6, cy2 - 4).lineTo(endX, cy2).lineTo(endX + 6, cy2 + 4).fill(GREY);
    }
  }
  
  doc.restore();
  doc.y = startY + 140;
}

// 3. Future Banking Integration Flow (Zenith APIs)
function drawFutureIntegration(doc) {
  doc.save();
  const startY = doc.y + 15;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('Proposed Zenith Bank Core Integration Flow', 50, startY - 5, { align: 'center', width: 495 });
  
  const steps = [
    { title: 'User / Biz', desc: 'Trigger checkout' },
    { title: 'NS Platform', desc: 'Generate payload' },
    { title: 'Zenith API', desc: 'Settle / Gateway' },
    { title: 'Webhook', desc: 'Callback event' },
    { title: 'Reconciliation', desc: 'Ledger log sync' },
    { title: 'Activated', desc: 'Receipt issued' }
  ];
  
  const nodeCount = steps.length;
  const stepX = 495 / nodeCount;
  
  for (let i = 0; i < nodeCount; i++) {
    const cx = 50 + (i * stepX) + (stepX / 2);
    const cy = startY + 45;
    
    // Draw Box
    doc.rect(cx - 35, cy - 20, 70, 40).fill(i === 2 ? RED : NAVY);
    
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7).text(steps[i].title, cx - 32, cy - 13, { width: 64, align: 'center' });
    doc.font('Helvetica-Oblique').fontSize(6).text(steps[i].desc, cx - 32, cy + 5, { width: 64, align: 'center' });
    
    if (i < nodeCount - 1) {
      drawArrow(doc, cx + 35, cx + stepX - 35, cy);
    }
  }
  
  doc.restore();
  doc.y = startY + 95;
}

// 4. Merchant Collections Flow
function drawMerchantCollections(doc) {
  doc.save();
  const startY = doc.y + 15;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('B2B Merchant Collection & Settlement Flow', 50, startY - 5, { align: 'center', width: 495 });
  
  const steps = [
    'Create Invoice',
    'Customer Pays',
    'Zenith Gateway',
    'Capture Funds',
    'Settlement',
    'Notify Merchant'
  ];
  
  const stepX = 495 / 6;
  const cy = startY + 40;
  
  for (let i = 0; i < 6; i++) {
    const cx = 50 + (i * stepX) + (stepX / 2);
    doc.circle(cx, cy, 16).fill(i === 2 ? RED : NAVY);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5).text(String(i+1), cx - 4, cy - 4);
    
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(7).text(steps[i], cx - 35, cy + 22, { width: 70, align: 'center' });
    
    if (i < 5) {
      drawArrow(doc, cx + 16, cx + stepX - 16, cy);
    }
  }
  
  doc.restore();
  doc.y = startY + 90;
}

// 5. System Architecture Diagram
function drawSystemArchitecture(doc) {
  doc.save();
  const startY = doc.y + 20;
  
  // Core Container Box
  doc.rect(50, startY, 495, 230).lineWidth(1).stroke(NAVY);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('SYSTEM INFRASTRUCTURE FLOW', 50, startY + 12, { align: 'center', width: 495 });
  
  // Layer 1: Client Applications
  doc.fillColor(GREY).font('Helvetica-Bold').fontSize(8.5).text('CLIENT LAYER', 65, startY + 38);
  doc.rect(150, startY + 32, 80, 24).fill(NAVY);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5).text('Web Application', 150, startY + 40, { align: 'center', width: 80 });
  
  doc.rect(250, startY + 32, 80, 24).fill(NAVY);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5).text('Android Native', 250, startY + 40, { align: 'center', width: 80 });
  
  doc.rect(350, startY + 32, 80, 24).fill(NAVY);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5).text('iOS (PWA)', 350, startY + 40, { align: 'center', width: 80 });
  
  // Layer 2: API Gateway / Routing
  doc.fillColor(GREY).font('Helvetica-Bold').fontSize(8.5).text('ROUTING LAYER', 65, startY + 80);
  doc.rect(200, startY + 74, 180, 24).fill(RED);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5).text('API Gateway & Load Balancer', 200, startY + 82, { align: 'center', width: 180 });
  
  // Layer 3: Application Server Logic
  doc.fillColor(GREY).font('Helvetica-Bold').fontSize(8.5).text('SERVICE LAYER', 65, startY + 122);
  doc.rect(150, startY + 116, 120, 24).fill(NAVY);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5).text('Express API Services', 150, startY + 124, { align: 'center', width: 120 });
  
  doc.rect(310, startY + 116, 120, 24).fill(NAVY);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5).text('Socket.io Real-time', 310, startY + 124, { align: 'center', width: 120 });
  
  // Layer 4: Storage & Database
  doc.fillColor(GREY).font('Helvetica-Bold').fontSize(8.5).text('STORAGE LAYER', 65, startY + 164);
  doc.rect(150, startY + 158, 120, 24).fill(NAVY);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5).text('PostgreSQL DB Pool', 150, startY + 166, { align: 'center', width: 120 });
  
  doc.rect(310, startY + 158, 120, 24).fill(NAVY);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5).text('Supabase CDN Storage', 310, startY + 166, { align: 'center', width: 120 });
  
  // Layer 5: External Services integration
  doc.fillColor(GREY).font('Helvetica-Bold').fontSize(8.5).text('EXTERNAL LAYER', 65, startY + 206);
  doc.rect(120, startY + 200, 90, 20).lineWidth(0.5).stroke(NAVY);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7).text('Agora Call Engine', 120, startY + 206, { align: 'center', width: 90 });
  
  doc.rect(250, startY + 200, 90, 20).lineWidth(0.5).stroke(NAVY);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7).text('Zenith Bank APIs', 250, startY + 206, { align: 'center', width: 90 });
  
  doc.rect(380, startY + 200, 90, 20).lineWidth(0.5).stroke(NAVY);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7).text('SendGrid / Push notification', 380, startY + 206, { align: 'center', width: 90 });
  
  // Connection arrows (vertical)
  doc.moveTo(290, startY + 56).lineTo(290, startY + 74).lineWidth(1.5).stroke(GREY);
  doc.moveTo(290, startY + 98).lineTo(210, startY + 116).stroke(GREY);
  doc.moveTo(290, startY + 98).lineTo(370, startY + 116).stroke(GREY);
  doc.moveTo(210, startY + 140).lineTo(210, startY + 158).stroke(GREY);
  doc.moveTo(370, startY + 140).lineTo(370, startY + 158).stroke(GREY);
  
  doc.restore();
  doc.y = startY + 250;
}

// 6. Security Architecture Flow
function drawSecurityArchitecture(doc) {
  doc.save();
  const startY = doc.y + 15;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('Secure Application Flow Architecture', 50, startY - 5, { align: 'center', width: 495 });
  
  const nodes = [
    { title: 'Users', desc: 'Secure clients' },
    { title: 'JWT / RBAC Auth', desc: 'Handshake gate' },
    { title: 'TLS 1.2+ API', desc: 'Encryption transit' },
    { title: 'App Layer', desc: 'Controller route' },
    { title: 'AES-256 Data', desc: 'Encryption at rest' }
  ];
  
  const stepX = 495 / 5;
  const cy = startY + 45;
  
  for (let i = 0; i < 5; i++) {
    const cx = 50 + (i * stepX) + (stepX / 2);
    
    doc.rect(cx - 35, cy - 20, 70, 40).fill(i === 1 || i === 4 ? RED : NAVY);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7).text(nodes[i].title, cx - 35, cy - 13, { width: 70, align: 'center' });
    doc.font('Helvetica-Oblique').fontSize(6).text(nodes[i].desc, cx - 35, cy + 5, { width: 70, align: 'center' });
    
    if (i < 4) {
      drawArrow(doc, cx + 35, cx + stepX - 35, cy);
    }
  }
  
  doc.restore();
  doc.y = startY + 95;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── Build Proposal Pages ───────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const pages = [
  // ─── PAGE 1: COVER PAGE ───
  {
    title: 'Cover Page',
    render: (doc) => {
      // Subtle navy pattern border
      doc.rect(20, 20, 555, 800).lineWidth(1.5).stroke(NAVY);
      doc.rect(25, 25, 545, 790).lineWidth(0.5).stroke(RED);
      
      // Giant watermark "Z" behind
      doc.save();
      doc.fillColor(LIGHT_GREY).opacity(0.15);
      doc.moveTo(100, 250).lineTo(450, 250).lineTo(200, 600).lineTo(450, 600).lineTo(400, 650).lineTo(100, 650).lineTo(350, 300).lineTo(100, 300).closePath().fill();
      doc.restore();
      
      // Logos at the top
      drawNoteStandardLogo(doc, 50, 80, 50);
      drawZenithLogo(doc, 450, 80, 50);
      
      // Text layout
      doc.y = 260;
      doc.fillColor(NAVY)
         .font('Helvetica-Bold')
         .fontSize(22)
         .text('STRATEGIC BANKING PARTNERSHIP PROPOSAL', 50, doc.y, { align: 'center', width: 495 });
         
      doc.moveDown(0.5);
      doc.fillColor(RED)
         .font('Helvetica-Bold')
         .fontSize(11)
         .text('UNIFYING SECURE COLLABORATION AND DIGITAL ENTERPRISE BANKING SERVICES', 50, doc.y, { align: 'center', width: 495 });
         
      doc.moveDown(3);
      doc.fillColor(DARK_TEXT)
         .font('Helvetica')
         .fontSize(10.5)
         .text('PREPARED FOR:', 50, doc.y, { align: 'center', width: 495 });
         
      doc.fillColor(NAVY)
         .font('Helvetica-Bold')
         .fontSize(12)
         .text('ZENITH BANK PLC (eCOMMERCIAL & DIGITAL BANKING DIVISION)', 50, doc.y + 4, { align: 'center', width: 495 });
         
      doc.y = doc.y + 40;
      doc.fillColor(DARK_TEXT)
         .font('Helvetica')
         .fontSize(10.5)
         .text('SUBMITTED BY:', 50, doc.y, { align: 'center', width: 495 });
         
      doc.fillColor(NAVY)
         .font('Helvetica-Bold')
         .fontSize(12)
         .text('NOTESTANDARD TECHNOLOGIES', 50, doc.y + 4, { align: 'center', width: 495 });
         
      // Metadata footer
      doc.y = 700;
      doc.fillColor(GREY)
         .font('Helvetica')
         .fontSize(9)
         .text('DOCUMENT REF: NST-ZBP-2026-001  |  DATE: JULY 2026', 50, doc.y, { align: 'center', width: 495 });
      doc.text('CLASSIFICATION: RESTRICTED / COMMERCIAL-IN-CONFIDENCE', 50, doc.y + 12, { align: 'center', width: 495 });
    }
  },
  
  // ─── PAGE 2: LETTER TO ZENITH ECOMMERCIAL TEAM ───
  {
    title: 'Letter to Zenith eCommercial Team',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      doc.text('July 7, 2026\n\nTo,\nThe eCommercial & Digital Banking Division,\nZenith Bank Plc,\nVictoria Island, Lagos, Nigeria.\n\nDear Sir/Ma,');
      
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('SUBJECT: PROPOSED STRATEGIC BANKING PARTNERSHIP & PAYMENT API INTEGRATION');
      
      doc.moveDown(1);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('NoteStandard Technologies is pleased to submit this partnership proposal to Zenith Bank Plc. We have built an operational, secure enterprise collaboration workspace that unifies dynamic notes management, real-time messaging, organizational feeds, and peer-to-peer WebRTC video/audio communications.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('As our enterprise customer base expands, we seek to align our core payment operations with Zenith Bank’s digital collections network. Through this relationship, we intend to integrate Zenith Bank’s card checkout and collections APIs to automate license payments, settle subscriptions, and lay the foundation for joint B2B billing utilities.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('By partnering with Nigeria’s leading eCommercial bank, we gain access to robust settlement infrastructures while Zenith Bank captures high-frequency, secure transaction volumes from NoteStandard’s user base. We look forward to your positive review and are ready to initiate Sandbox API evaluations immediately.', { align: 'justify' });
      
      doc.moveDown(2);
      doc.text('Yours faithfully,\n\nNoteStandard Technologies Team\nLagos, Nigeria.');
    }
  },
  
  // ─── PAGE 3: EXECUTIVE SUMMARY (PAGE 1) ───
  {
    title: 'Executive Summary (1/2)',
    render: (doc) => {
      addSectionHeader(doc, '3', 'Executive Summary');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('This document presents a structured framework for a strategic partnership between NoteStandard Technologies and Zenith Bank Plc. In today’s corporate environment, companies face severe fragmentation in their digital toolchains. Collaborative teams use separate apps for messaging, document editing, and online calls, which raises subscription costs and exposes data to security vulnerabilities.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('NoteStandard solves these issues by providing a unified, secure system. We combine real-time communication modules (chat, status updates, calling) directly with database-backed documentation structures. By focusing on defensive programming, client bundle optimization, and database connection pooling, we have built a stable software infrastructure ready for enterprise scaling.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Key Objectives of the Partnership:');
      doc.moveDown(0.5);
      bullet(doc, 'Secure operating accounts with Zenith Bank to manage corporate operations, payroll, and reserves.');
      bullet(doc, 'Integrate Zenith Bank payment checkout gateways directly into NoteStandard’s subscription module.');
      bullet(doc, 'Configure webhook communication systems to automate real-time billing reconciliation.');
      bullet(doc, 'Partner with Zenith Bank’s technology division to explore future virtual accounts and cross-border settlement channels.');
    }
  },
  
  // ─── PAGE 4: EXECUTIVE SUMMARY (PAGE 2) ───
  {
    title: 'Executive Summary (2/2)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('A partnership between NoteStandard and Zenith Bank aligns modern productivity software with robust commercial clearing systems. The integration ensures that all user actions—from invoice collection to daily ledger updates—are processed directly by Zenith Bank’s secure banking APIs.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('The commercial value is mutual: NoteStandard obtains a Tier-1 clearing partner, guaranteeing fast transaction speeds and high compliance oversight, while Zenith Bank establishes itself as the primary treasury holder and payment processing channel for NoteStandard’s growing user base.', { align: 'justify' });
      
      doc.moveDown(2);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Proposed Partnership Phases:');
      doc.moveDown(0.5);
      bullet(doc, 'Setup corporate banking lines and deploy merchant payment checkouts.', 'Phase 1: Operational Base (Months 1–3) — ');
      bullet(doc, 'Link automated webhooks to process payments and ledger reconciliation.', 'Phase 2: Reconciliation Automation (Months 4–6) — ');
      bullet(doc, 'Integrate virtual accounts and treasury APIs (subject to approvals).', 'Phase 3: Deep API Integration (Months 7+) — ');
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Subscription Dashboard & Billing Area');
    }
  },
  
  // ─── PAGE 5: COMPANY PROFILE (PAGE 1) ───
  {
    title: 'Company Profile (1/2)',
    render: (doc) => {
      addSectionHeader(doc, '4', 'Company Profile');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('NoteStandard Technologies is a software firm specializing in real-time communication, document databases, and productivity solutions. Founded on principles of disciplined software architecture and information security, we build applications that help modern organizations collaborate.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('Unlike platforms that rely on third-party integrations, NoteStandard is built natively on a unified relational database schema. This design ensures that text messages, files, documents, calls, and status updates are linked in one system. This architecture reduces database lookup latency, prevents sync failures, and allows granular access controls.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Corporate Governance & Philosophy:');
      doc.moveDown(0.5);
      bullet(doc, 'We do not exaggerate metrics, valuations, or active licenses.');
      bullet(doc, 'We design platforms to be secure by default, using industry-standard cryptography.');
      bullet(doc, 'We support regulatory compliance, designing features to align with NDPR/GDPR privacy guidelines.');
    }
  },
  
  // ─── PAGE 6: COMPANY PROFILE (PAGE 2) ───
  {
    title: 'Company Profile (2/2)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('NoteStandard Technologies is structured to scale responsibly, separating roles across software engineering, quality assurance, customer support, and finance. While currently operating as a private growth-stage firm, the company is establishing corporate partnerships to prepare for larger enterprise deployments.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('Our primary market opportunity is providing secure collaboration environments for professional services (such as legal and financial advisories), distributed engineering teams, and remote educational institutions. These sectors require strict data privacy, auditable collaboration records, and reliable communication links.', { align: 'justify' });
      
      doc.moveDown(2);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Company Details:');
      doc.moveDown(0.5);
      bullet(doc, 'Lagos, Nigeria', 'Headquarters: ');
      bullet(doc, 'Enterprise Productivity & Digital Communications', 'Primary Sector: ');
      bullet(doc, 'Software-as-a-Service (SaaS) Subscriptions & API Licenses', 'Revenue Model: ');
      bullet(doc, 'partnerships@notesstandard.com', 'Contact Email: ');
      bullet(doc, 'https://notesstandard.com', 'Website: ');
    }
  },
  
  // ─── PAGE 7: ABOUT NOTESTANDARD PLATFORM (PAGE 1) ───
  {
    title: 'About NoteStandard Platform (1/3)',
    render: (doc) => {
      addSectionHeader(doc, '5', 'About NoteStandard Platform');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('The NoteStandard platform is designed to replace fragmented collaboration stacks. Instead of running separate applications for messaging, document editing, and calls, teams access all tools within a single interface. This consolidated approach improves productivity and ensures data consistency.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Available Client Environments:');
      doc.moveDown(0.5);
      bullet(doc, 'A responsive, secure React application compiled with TypeScript, optimized for modern desktop browsers.', 'Web Application: ');
      bullet(doc, 'A native mobile application utilizing specialized push notification handlers and Agora calls.', 'Android Native APK: ');
      bullet(doc, 'A lightweight Progressive Web App utilizing service workers for local storage and notifications.', 'iOS PWA: ');
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Web Client Landing Interface');
    }
  },
  
  // ─── PAGE 8: ABOUT NOTESTANDARD PLATFORM (PAGE 2) ───
  {
    title: 'About NoteStandard Platform (2/3)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Technical and Performance Optimization:');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('To support users in areas with constrained mobile networks or slow internet connections, NoteStandard has implemented several optimization strategies:', { align: 'justify' });
      
      doc.moveDown(1);
      bullet(doc, 'We separated external libraries (such as the Agora video engine and charting libraries) into lazy-loaded code chunks. This reduced the initial page bundle from 805 KB down to 224 KB (67 KB gzipped), enabling fast page load times.', 'Advanced Code Splitting: ');
      bullet(doc, 'Outbound HTTP/HTTPS and database database engines utilize persistent socket agents. This prevents TCP Port Exhaustion under high concurrency, maintaining system stability.', 'TCP Port Keep-Alive: ');
      bullet(doc, 'Express servers apply Gzip compression to JSON payloads larger than 1 KB, reducing API transfer overhead by up to 80%.', 'API Response Compression: ');
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Vite Code-Splitting Bundle Optimizer Log');
    }
  },
  
  // ─── PAGE 9: ABOUT NOTESTANDARD PLATFORM (PAGE 3) ───
  {
    title: 'About NoteStandard Platform (3/3)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Media Offloading & Storage Architecture:');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('To prevent large files from exhausting server bandwidth, NoteStandard offloads all media attachments, voice notes, and APK installers to cloud storage buckets:', { align: 'justify' });
      
      doc.moveDown(1);
      bullet(doc, 'Chat attachments, media uploads, and document resources are stored directly in Cloudinary and Supabase storage buckets, bypassing application server queues.', 'Direct Storage Uploads: ');
      bullet(doc, 'When a user downloads the Android APK, the server issues a 302 HTTP Redirect to a secure, 1-hour pre-signed Supabase Storage link, reducing direct server bandwidth.', 'Pre-Signed APK Downloads: ');
      bullet(doc, 'Un-hashed public files (such as notification sounds, favicons, and public mockups) are served with long-term 30-day Cache-Control headers, preventing repetitive browser requests.', 'Long-term Public Caching: ');
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Storage Controller & Pre-signed URL Redirect Logs');
    }
  },
  
  // ─── PAGE 10: PLATFORM MODULES WALKTHROUGH (PAGE 1) ───
  {
    title: 'Platform Modules Walkthrough (1/5)',
    render: (doc) => {
      addSectionHeader(doc, '6', 'Platform Modules Walkthrough');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.font('Helvetica-Bold').fillColor(NAVY).text('1. The Chat & Instant Messaging Module');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('NoteStandard’s messaging client is powered by Socket.io, providing full-duplex communication. Features include instant text delivery, attachment transfers, presence tracking, and real-time read receipts. The module handles high concurrency safely by authorizing WebSockets during the handshake phase.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('2. The Collaborative Notes Module');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('The notes editor allows users to generate structured knowledge databases. It supports folder organization, dynamic category tagging, document sharing, and PDF export capabilities. All documents are stored in normalized database tables, ensuring data integrity.', { align: 'justify' });
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Messaging Console & Rich-Text Notes Workspace');
    }
  },
  
  // ─── PAGE 11: PLATFORM MODULES WALKTHROUGH (PAGE 2) ───
  {
    title: 'Platform Modules Walkthrough (2/5)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.font('Helvetica-Bold').fillColor(NAVY).text('3. The Platform Feed Module');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('The Feed serves as a team bulletin board. It allows administrators and team leaders to post announcements, share links, upload images, and moderate team comments. This module helps organizations distribute notices quickly without relying on external email chains.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('4. The Ephemeral Status Module');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('NoteStandard includes a Status Tray at the top of the chat area, displaying 24-hour disappearing photo and video stories. The status viewer is optimized with automatic progress indicators, chronological segments, and video-ended event handlers to sync story playback.', { align: 'justify' });
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Platform Feeds & Status Creator Interface');
    }
  },
  
  // ─── PAGE 12: PLATFORM MODULES WALKTHROUGH (PAGE 3) ───
  {
    title: 'Platform Modules Walkthrough (3/5)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.font('Helvetica-Bold').fillColor(NAVY).text('5. The Agora Call Module');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('NoteStandard integrates real-time calling directly into chat channels using the Agora RTC SDK. Users can start voice or video calls inside their conversation threads. Because calling runs over a peer-to-peer WebRTC connection, call traffic is offloaded from the server, minimizing hosting bandwidth.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('6. Security & Custom Settings Module');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('Each user can access a security settings panel to configure multi-factor parameters, view active login sessions, reset credentials, and configure notifications. These options help users protect their accounts directly from the client interface.', { align: 'justify' });
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Active Call Window & Settings Dashboard');
    }
  },
  
  // ─── PAGE 13: PLATFORM MODULES WALKTHROUGH (PAGE 4) ───
  {
    title: 'Platform Modules Walkthrough (4/5)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.font('Helvetica-Bold').fillColor(NAVY).text('7. User Interface Desktop Scroll & Layout Fixes');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('To ensure the application is usable on low-resolution desktop monitors and laptop screens, the layout was updated to prevent viewport overflow. Flexbox containers are constrained using min-height parameters (`min-h-0`) and custom scrollbars. This guarantees that users can scroll their chat lists and document directories at any browser zoom level without layout breaks.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('8. System Boot & Database Resilience Gates');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('During server startup or database updates, NoteStandard uses a "boot kernel" to manage requests. If the database is busy, the API gateway returns a `SYSTEM_BOOTING` code. The client automatically queues requests and retries them, preventing app crashes during brief maintenance windows.', { align: 'justify' });
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Desktop Responsive Layout & Boot Kernel Log Output');
    }
  },
  
  // ─── PAGE 14: PLATFORM MODULES WALKTHROUGH (PAGE 5) ───
  {
    title: 'Platform Modules Walkthrough (5/5)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Platform Modules & Technical Capabilities:');
      doc.moveDown(0.5);
      
      const headers = ['Module Name', 'Core Technology', 'Operational Status', 'Integration Dependency'];
      const rows = [
        ['Instant Chat', 'Socket.io / Node.js', 'Fully Live', 'Internal Socket Gateway'],
        ['Notes Editor', 'React Draft / PostgreSQL', 'Fully Live', 'Primary Database Pool'],
        ['Feeds Board', 'Express API / Supabase', 'Fully Live', 'Media Storage Bucket'],
        ['Status Trays', 'HTML5 Media / Cloudinary', 'Fully Live', 'CDN Upload Pipeline'],
        ['Voice & Video', 'Agora SDK / WebRTC', 'Fully Live', 'External Agora Engine'],
        ['Account Manager', 'JWT / Bcrypt / Redis', 'Fully Live', 'Redis Token Ledger']
      ];
      
      drawTable(doc, doc.y, headers, rows, [100, 140, 110, 145]);
    }
  },
  
  // ─── PAGE 15: USER JOURNEY (PAGE 1) ───
  {
    title: 'User Journey',
    render: (doc) => {
      addSectionHeader(doc, '7', 'User Journey Map');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('The user experience on NoteStandard is designed to be direct and secure. First-time users register with verified email verification gates, explore their collaborative dashboard, and can subscribe to access advanced productivity and communication features.', { align: 'justify' });
      
      doc.moveDown(2);
      drawUserJourney(doc);
      
      doc.moveDown(2);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('User Journey Step Explanations:');
      doc.moveDown(0.5);
      bullet(doc, 'Registering an account using secure password hashing and form validation.', '1. Register: ');
      bullet(doc, 'Verifying the user’s email via one-time tokens to prevent automated spam signups.', '2. Verify Email: ');
      bullet(doc, 'Logging in securely using JSON Web Token authorization cookies.', '3. Login: ');
      bullet(doc, 'Navigating the notes modules, creating document directories, and joining team feeds.', '4. Explore Platform: ');
      bullet(doc, 'Upgrading to a business tier to unlock Agora calling features and unlimited storage.', '5. Subscribe: ');
    }
  },
  
  // ─── PAGE 16: CURRENT PAYMENT FLOW (PAGE 1) ───
  {
    title: 'Current Payment Flow (1/2)',
    render: (doc) => {
      addSectionHeader(doc, '8', 'Current Payment Flow');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('NoteStandard’s subscription management system uses secure API gateways to process payments. When a user chooses a plan, the client initiates a secure checkout session, and the server relies on real-time webhooks to provision premium workspace features.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('Our payment verification uses double-entry checks: first, when the gateway returns a client-side success response, and second, when the backend receives a cryptographically signed webhook directly from the payment processor. This prevents unauthorized database modifications and duplicate transactions.', { align: 'justify' });
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Subscription Checkout & Receipt Display');
    }
  },
  
  // ─── PAGE 17: CURRENT PAYMENT FLOW (PAGE 2) ───
  {
    title: 'Current Payment Flow (2/2)',
    render: (doc) => {
      doc.y = 80;
      drawCurrentPayment(doc);
      
      doc.y = doc.y + 20;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Current Flow Verification Steps:');
      doc.moveDown(0.5);
      bullet(doc, 'The checkout page opens in a secure frame, keeping card data isolated from NoteStandard.', '1. Card Checkout Isolation: ');
      bullet(doc, 'Webhooks verify transactions even if the user closes their browser before redirection.', '2. Webhook Event Reliability: ');
      bullet(doc, 'The database utilizes strict unique constraints on transaction IDs to prevent double credits.', '3. Idempotent Updates: ');
      bullet(doc, 'Digital receipts containing breakdown data are sent automatically to users.', '4. Automatic Receipt Delivery: ');
    }
  },
  
  // ─── PAGE 18: FUTURE PAYMENT & BANKING INTEGRATION FLOW (PAGE 1) ───
  {
    title: 'Future Banking Integration (1/2)',
    render: (doc) => {
      addSectionHeader(doc, '9', 'Future Banking Integration Flow');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('Through our proposed partnership, NoteStandard intends to integrate Zenith Bank’s digital payment gateways directly into the platform checkout layer. This integration will replace secondary gateways with direct Zenith Bank clearing services.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('By connecting directly with Zenith Bank APIs, NoteStandard can automate fund collections and reconciliation logs. When users purchase license extensions, the platform initiates a direct API call to Zenith Bank, which processes the transaction and returns a settlement webhook, transferring funds directly to our corporate accounts.', { align: 'justify' });
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Proposed Zenith API Checkout Integration (Mockup)');
    }
  },
  
  // ─── PAGE 19: FUTURE PAYMENT & BANKING INTEGRATION FLOW (PAGE 2) ───
  {
    title: 'Future Banking Integration (2/2)',
    render: (doc) => {
      doc.y = 80;
      drawFutureIntegration(doc);
      
      doc.y = doc.y + 20;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Zenith Bank Integration Advantages:');
      doc.moveDown(0.5);
      bullet(doc, 'Removing secondary gateways decreases processing fees per transaction.', '1. Lower Processing Costs: ');
      bullet(doc, 'Settlements are cleared directly into NoteStandard’s corporate operating account, improving cash flow.', '2. Direct Settlements: ');
      bullet(doc, 'Using Zenith Bank’s digital signature tokens ensures secure authentication.', '3. Cryptographic API Keys: ');
      bullet(doc, 'We can design auto-reconciliation scripts to match billing ledgers with bank statements.', '4. Dynamic Statement Auditing: ');
    }
  },
  
  // ─── PAGE 20: MERCHANT COLLECTIONS FLOW (1/2) ───
  {
    title: 'Merchant Collections Flow (1/2)',
    render: (doc) => {
      addSectionHeader(doc, '10', 'Merchant Collections Flow');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('NoteStandard plans to introduce B2B features, allowing professional merchants and corporate accounts to generate client invoices and collect payments directly within their shared document workspaces.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('Under this planned structure, the merchant creates an invoice item within a shared notes node. The customer receives a notification and authorizes the payment through the Zenith Bank merchant collections gateway. Once Zenith Bank captures the funds, they are settled directly to the merchant’s account after platform fee deductions, all within Zenith Bank’s secure network.', { align: 'justify' });
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Merchant Invoice Generator & Payment Window');
    }
  },
  
  // ─── PAGE 21: MERCHANT COLLECTIONS FLOW (2/2) ───
  {
    title: 'Merchant Collections Flow (2/2)',
    render: (doc) => {
      doc.y = 80;
      drawMerchantCollections(doc);
      
      doc.y = doc.y + 20;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Proposed Merchant Capabilities:');
      doc.moveDown(0.5);
      bullet(doc, 'Invoice objects are embedded in collaborative workspace folders, keeping billing in context.', '1. In-Context Invoicing: ');
      bullet(doc, 'Zenith Bank’s collections APIs process card payments and bank transfers.', '2. Multi-channel Payments: ');
      bullet(doc, 'Ledger updates notify both parties instantly when payments clear.', '3. Automated Status Sync: ');
      bullet(doc, 'Escrow settlement terms can be configured to hold funds until work milestones are confirmed.', '4. Flexible Clearing Rules: ');
    }
  },
  
  // ─── PAGE 22: SUBSCRIPTION & BILLING FLOW ───
  {
    title: 'Subscription & Billing Flow',
    render: (doc) => {
      addSectionHeader(doc, '11', 'Subscription & Billing Flow');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('NoteStandard manages subscription lifecycles using database ledgers. Rather than recalculating user permissions on every request, client privileges are governed by token states cached in Redis. When a subscription is renewed or modified:', { align: 'justify' });
      
      doc.moveDown(1.5);
      bullet(doc, 'The checkout gateway triggers a secure webhook event.', 'Step 1: Webhook Receipt — ');
      bullet(doc, 'The server validates the webhook signature using secret signing keys.', 'Step 2: Cryptographic Audit — ');
      bullet(doc, 'The database logs the transaction ID and updates the company’s license record.', 'Step 3: Database Commit — ');
      bullet(doc, 'The backend updates the user session cache in Redis, updating permissions instantly.', 'Step 4: Redis Cache Invalidation — ');
      bullet(doc, 'The client app receives a socket event and updates the workspace view.', 'Step 5: Client Interface Update — ');
      
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Digital Wallet & Internal Ledger Flow:');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('NoteStandard incorporates a digital wallet subsystem providing virtual ledger mappings for all active accounts. This wallet enables users to maintain an internal credit balance, funded directly via Zenith Bank cards or automated bank transfer webhooks. When a collaborative B2B invoice is approved within a workspace node, the transaction clears instantly from the buyer\'s wallet balance, logging a double-entry ledger event and settling funds directly to the merchant\'s corporate Zenith account.', { align: 'justify' });
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Subscription State Machine & Wallet Ledger Tables');
    }
  },
  
  // ─── PAGE 23: SYSTEM ARCHITECTURE (PAGE 1) ───
  {
    title: 'System Architecture (1/2)',
    render: (doc) => {
      addSectionHeader(doc, '12', 'System Architecture');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('NoteStandard is built on a clean service-oriented architecture designed to handle concurrent users with low latency. By separating client interface code, socket routers, and database systems, the platform minimizes single points of failure.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('All API routes operate statelessly, allowing the backend to scale across multiple container nodes behind a load balancer. Real-time notifications and messages run over dedicated Socket.io gateways, while heavy media streams are offloaded directly to Cloudinary and Supabase CDN networks.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Core Architecture Features:');
      doc.moveDown(0.5);
      bullet(doc, 'stateless Node.js services routing HTTP requests and validating auth tokens.', 'REST API Gateway: ');
      bullet(doc, 'handles persistent WebSocket connections to sync notes and messages.', 'Real-Time Engine: ');
      bullet(doc, 'PostgreSQL database utilizing connection pooling to prevent query queuing.', 'Relational Database: ');
    }
  },
  
  // ─── PAGE 24: SYSTEM ARCHITECTURE (PAGE 2) ───
  {
    title: 'System Architecture (2/2)',
    render: (doc) => {
      doc.y = 80;
      drawSystemArchitecture(doc);
    }
  },
  
  // ─── PAGE 25: SECURITY ARCHITECTURE (PAGE 1) ───
  {
    title: 'Security Architecture (1/2)',
    render: (doc) => {
      addSectionHeader(doc, '13', 'Security Architecture');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('The NoteStandard security framework protects user and transaction data at every level of the application stack. All communication with our servers is encrypted in transit using TLS 1.3, and database systems encrypt sensitive values at rest using AES-256.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('User authentication uses JSON Web Tokens (JWT) signed with rotating keys. Sockets and API endpoints require token checks before processing requests. Granular access controls are enforced at the database level, preventing users from accessing unauthorized documentation, messages, or payment data.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Our Security Objectives:');
      doc.moveDown(0.5);
      bullet(doc, 'Prevent unauthorized users from intercepting workspace communications.', '1. Data Confidentiality: ');
      bullet(doc, 'Ensure transaction logs, documentation, and chat histories cannot be altered.', '2. Audit Trail Integrity: ');
      bullet(doc, 'Confirm the identity of users and servers before authorizing API operations.', '3. Session Verification: ');
    }
  },
  
  // ─── PAGE 26: SECURITY ARCHITECTURE (PAGE 2) ───
  {
    title: 'Security Architecture (2/2)',
    render: (doc) => {
      doc.y = 80;
      drawSecurityArchitecture(doc);
      
      doc.y = doc.y + 20;
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY).text('Corporate Security Controls Matrix:');
      doc.moveDown(0.5);
      
      const headers = ['Threat Vector', 'Security Control Measure', 'Implementation Status'];
      const rows = [
        ['Eavesdropping', 'TLS 1.3 Transport Encryption', 'Fully Implemented'],
        ['SQL Injection', 'Query Parameterization & ORM layer', 'Fully Implemented'],
        ['XSS Attacks', 'DOMPurify HTML input sanitization', 'Fully Implemented'],
        ['Session Hijack', 'Stateless JWT with rotated sign keys', 'Fully Implemented'],
        ['Brute Force', 'Express rate-limiters & IP blocks', 'Fully Implemented'],
        ['Database Theft', 'AES-256 encryption at rest', 'Fully Implemented']
      ];
      
      drawTable(doc, doc.y, headers, rows, [140, 215, 140]);
    }
  },
  
  // ─── PAGE 27: COMPLIANCE & GOVERNANCE (PAGE 1) ───
  {
    title: 'Compliance & Governance (1/2)',
    render: (doc) => {
      addSectionHeader(doc, '14', 'Compliance & Governance');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('NoteStandard Technologies operates under a structured governance framework, ensuring compliance with data privacy laws and digital standards. We align our data collection and storage policies with the Nigerian Data Protection Regulation (NDPR) and the General Data Protection Regulation (GDPR).', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('Our platform is designed with modular identity management nodes, preparing us to integrate KYC and AML validation protocols when transaction features are introduced. When Zenith Bank APIs are integrated, NoteStandard will route BVN/NIN verification through Zenith’s secure clearing infrastructure, maintaining compliance with Central Bank standards.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Compliance Objectives:');
      doc.moveDown(0.5);
      bullet(doc, 'Ensuring user data is stored within legal borders, using encryption for all off-platform transfers.', '1. Data Privacy: ');
      bullet(doc, 'Preparing user identity checks to align with financial transaction compliance.', '2. KYC Readiness: ');
      bullet(doc, 'Maintaining detailed access logs to support security audits.', '3. Independent Audits: ');
    }
  },
  
  // ─── PAGE 28: COMPLIANCE & GOVERNANCE (PAGE 2) ───
  {
    title: 'Compliance & Governance (2/2)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY).text('Compliance Readiness Assessment:');
      doc.moveDown(0.5);
      
      const headers = ['Regulation', 'Requirement Details', 'NoteStandard Status'];
      const rows = [
        ['NDPR (Nigeria)', 'Consent logs & secure data storage', 'Fully Compliant'],
        ['GDPR (Europe)', 'Right to erasure & export parameters', 'Fully Compliant'],
        ['KYC Standards', 'Identity verification & BVN checks', 'Ready for API integration'],
        ['AML Directives', 'Transaction logs & alerts', 'Ready for API integration'],
        ['PCI-DSS', 'Card security (handled by Zenith)', 'Gateway dependent']
      ];
      drawTable(doc, doc.y, headers, rows, [110, 245, 140]);
      
      doc.y = doc.y + 10;
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY).text('Enterprise Risk Management (ERM):');
      doc.moveDown(0.5);
      
      const headers2 = ['Risk Area', 'Impact', 'Proactive Mitigation Strategy'];
      const rows2 = [
        ['Cybersecurity', 'High', 'JWT tokens, database parameterization, secure env configs.'],
        ['Downtime', 'Med', 'Redundant cloud servers and database pool monitoring.'],
        ['Compliance', 'Med', 'Data privacy compliance and legal reviews.'],
        ['Fraud', 'High', 'Idempotent ledgers, token audits, webhook signatures.']
      ];
      drawTable(doc, doc.y, headers2, rows2, [90, 60, 345]);
    }
  },
  
  // ─── PAGE 29: TECHNOLOGY STACK ───
  {
    title: 'Technology Stack',
    render: (doc) => {
      addSectionHeader(doc, '15', 'Technology Stack');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('NoteStandard is built on a modern technology stack, combining standard enterprise frameworks with optimized libraries to deliver performance and scalability.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Core Architecture Technologies:');
      doc.moveDown(0.5);
      
      const headers = ['Layer', 'Technology Used', 'Purpose & Optimization'];
      const rows = [
        ['Frontend', 'React v18, TypeScript, Tailwind', 'Single Page Application with 224 KB entry size.'],
        ['API Server', 'Node.js, Express, Socket.io', 'Stateless request routing and Socket connections.'],
        ['Database', 'PostgreSQL (pg-pool)', 'Relational database utilizing connection pooling.'],
        ['Cache', 'Redis Cache Engine', 'Stateless session storage and permission limits.'],
        ['Media/Calls', 'Agora RTC Engine, WebRTC', 'Low-latency peer-to-peer audio and video calls.'],
        ['Storage', 'Supabase, Cloudinary', 'Offloads asset bandwidth from main servers.']
      ];
      
      drawTable(doc, doc.y, headers, rows, [80, 160, 255]);
    }
  },
  
  // ─── PAGE 30: BANKING REQUIREMENTS (PAGE 1) ───
  {
    title: 'Banking Requirements (1/2)',
    render: (doc) => {
      addSectionHeader(doc, '16', 'Banking Requirements');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('To support our corporate scaling and prepare for digital collections, NoteStandard Technologies requires core banking services from Zenith Bank Plc. This relationship will support our daily business operations and payment integrations.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('Our primary requirement is establishing corporate operating accounts to manage payroll, tax holdings, and operating reserves. We also seek to integrate Zenith Bank’s merchant payment gateways, enabling automated subscription billing and settlement reconciliation directly through our platform.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Primary Banking Demands:');
      doc.moveDown(0.5);
      bullet(doc, 'Operating accounts for treasury, tax reserves, and payroll.', '1. Corporate Operating Accounts: ');
      bullet(doc, 'Zenith payment checkout integration in our checkout workspace.', '2. Merchant Gateway Collections: ');
      bullet(doc, 'Daily clearing and settlement of processed subscription payments.', '3. Automated Settlements: ');
      bullet(doc, 'For future deposit matching (subject to regulatory approval).', '4. Virtual Account APIs: ');
    }
  },
  
  // ─── PAGE 31: BANKING REQUIREMENTS (PAGE 2) ───
  {
    title: 'Banking Requirements (2/2)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('Corporate Banking Requirements Summary:');
      doc.moveDown(0.5);
      
      const headers = ['Requirement Group', 'Operational Purpose', 'API Integration Need'];
      const rows = [
        ['Corporate Accounts', 'Treasury management, payroll, and reserves', 'None (Standard Web Banking)'],
        ['Merchant Gateway', 'User card checks and checkout collections', 'High (Zenith Checkout SDK)'],
        ['Webhook Settlements', 'Automate ledger updates when payments clear', 'High (Zenith Webhook API)'],
        ['Virtual Accounts', 'Automated deposit matching and B2B billing', 'Medium (Zenith Virtual Accts)'],
        ['Support Services', 'KYC audits, security reviews, and API support', 'None (Dedicated Manager)']
      ];
      
      drawTable(doc, doc.y, headers, rows, [120, 220, 155]);
    }
  },
  
  // ─── PAGE 32: PARTNERSHIP ROADMAP (PAGE 1) ───
  {
    title: 'Partnership Roadmap (1/2)',
    render: (doc) => {
      addSectionHeader(doc, '17', 'Partnership Roadmap');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('To manage technical risk and ensure security, we propose a phased roadmap for integrating NoteStandard’s software with Zenith Bank’s clearing networks. This approach allows both engineering teams to test interfaces safely before deploying to production.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('We begin with basic corporate account onboarding and payment checkout configuration. We then move to webhook integration for automated accounting. Finally, we explore advanced digital banking tools, such as dynamic virtual accounts, to support our corporate clients.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Integration Timelines:');
      doc.moveDown(0.5);
      bullet(doc, 'KYC verification, corporate account setup, and sandbox gateway access.', 'Phase 1: Setup (Months 1–3) — ');
      bullet(doc, 'Reconciliation script deployment, sandbox testing, and production checkout launch.', 'Phase 2: Automation (Months 4–6) — ');
      bullet(doc, 'Virtual account integration (subject to approvals) and joint B2B marketing.', 'Phase 3: Scaling (Months 7+) — ');
    }
  },
  
  // ─── PAGE 33: PARTNERSHIP ROADMAP (PAGE 2) ───
  {
    title: 'Partnership Roadmap (2/2)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('Phased Partnership Implementation Timeline:');
      doc.moveDown(0.5);
      
      const headers = ['Phase', 'Primary Goal', 'Technical Milestones', 'Target Completion'];
      const rows = [
        ['Phase 1', 'Account Setup & Sandbox', 'KYC checks, API keys, Checkout staging', 'Month 3'],
        ['Phase 2', 'Automated Reconciliation', 'Webhook scripts, ledger audits, Go-Live', 'Month 6'],
        ['Phase 3', 'Advanced Integrations', 'Virtual accounts setup, joint marketing', 'Month 12+']
      ];
      
      drawTable(doc, doc.y, headers, rows, [65, 140, 200, 90]);
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'Proposed Integration Timeline Roadmap Chart');
    }
  },
  
  // ─── PAGE 34: WHY ZENITH BANK ───
  {
    title: 'Why Zenith Bank',
    render: (doc) => {
      addSectionHeader(doc, '18', 'Why Zenith Bank?');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('NoteStandard has selected Zenith Bank Plc as our preferred banking partner due to direct compatibility between our software standards and Zenith’s digital banking capabilities.', { align: 'justify' });
      
      doc.moveDown(1);
      doc.text('Zenith Bank’s infrastructure provides the transaction processing speeds required to support NoteStandard’s real-time messaging and documentation modules. The bank’s compliance with international ISO security standards aligns with our data encryption and access control protocols.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Partnership Synergy:');
      doc.moveDown(0.5);
      bullet(doc, "Zenith Bank's digital APIs match NoteStandard's real-time performance requirements.", '1. Performance Compatibility: ');
      bullet(doc, 'Shared focus on information security, database audits, and encryption.', '2. Technical Security: ');
      bullet(doc, "Zenith Bank's capacity to process high transaction volumes supports our scaling targets.", '3. Scalability: ');
      bullet(doc, "Zenith's experience in supporting tech startups ensures efficient operational support.", '4. Fintech Focus: ');
    }
  },
  
  // ─── PAGE 35: APPENDICES (PAGE 1) ───
  {
    title: 'Appendices (1/2)',
    render: (doc) => {
      addSectionHeader(doc, '19', 'Technical Appendices');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Appendix A: Technology Stack Overview');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('NoteStandard is built on a clean Node.js and React architecture designed to minimize server load. Sockets manage messaging, database pools prevent query queuing, and cloud storage hosts heavy files and native APK downloads. This design keeps the application stable under high user volume.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Appendix B: High-Level API Integration Overview');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('NoteStandard plans to integrate Zenith Bank’s Checkout SDK within our client payment panel. The integration uses a secure frame to prevent card data from reaching our database. The backend uses webhooks to receive transaction updates and update user permissions in Redis.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Appendix C: Data Flow Summary');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor(DARK_TEXT).text('User data is partitioned and encrypted. Payment requests are sent securely to the bank, and settlement logs are reconciled automatically using daily ledger exports.', { align: 'justify' });
    }
  },
  
  // ─── PAGE 36: APPENDICES (PAGE 2) ───
  {
    title: 'Appendices (2/2)',
    render: (doc) => {
      doc.y = 80;
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('Regulatory Compliance Checklist:');
      doc.moveDown(0.5);
      
      const headers = ['Compliance Area', 'Regulatory Target', 'NoteStandard Action'];
      const rows = [
        ['Data Sovereignty', 'NDPR Compliance directives', 'Encrypted local PostgreSQL records'],
        ['User Privacy', 'GDPR delete/export protocols', 'Account erasure buttons in dashboard'],
        ['Secure Sockets', 'TLS 1.2+ transport policies', 'Enforced HTTPS and token headers'],
        ['Reconciliation', 'Idempotent transaction logging', 'Independent ledger tables matching webhooks'],
        ['Audit Logging', 'System access track trails', 'Immutable server security logs']
      ];
      
      drawTable(doc, doc.y, headers, rows, [120, 160, 215]);
      
      doc.moveDown(1);
      drawScreenshotPlaceholder(doc, 'System Security Compliance Logging Panel');
    }
  },
  
  // ─── PAGE 37: GLOSSARY ───
  {
    title: 'Glossary',
    render: (doc) => {
      addSectionHeader(doc, '20', 'Technical Glossary');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5);
      
      bullet(doc, 'A secure real-time audio/video engine establishing low-latency connections.', 'Agora SDK: ');
      bullet(doc, 'The compiled JavaScript, CSS, and HTML assets downloaded by client browsers.', 'Client Bundle: ');
      bullet(doc, 'Splitting application code into smaller chunks that load only when needed.', 'Code Splitting: ');
      bullet(doc, 'Stateless, cryptographically signed tokens used for API and WebSocket authorization.', 'JWT Token: ');
      bullet(doc, 'A cache of open connections reused for queries to prevent CPU overhead.', 'Postgres Connection Pool: ');
      bullet(doc, 'Persistent HTTP/HTTPS agents that prevent TCP connection failures.', 'TCP Keep-Alive: ');
      bullet(doc, 'A lightweight wrapper to run web applications natively on mobile and desktop platforms.', 'Native Wrapper: ');
      bullet(doc, 'Secure web communication protocol providing full-duplex messaging links.', 'Socket.io: ');
      bullet(doc, 'A cloud hosting layer used to store large assets, offloading bandwidth from servers.', 'Supabase Storage: ');
    }
  },
  
  // ─── PAGE 38: CONTACT & CLOSING ───
  {
    title: 'Contact & Closing',
    render: (doc) => {
      addSectionHeader(doc, '21', 'Contact & Closing Information');
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10);
      
      doc.text('We appreciate your time in reviewing this strategic banking partnership proposal. NoteStandard Technologies is committed to establishing a reliable operational relationship with Zenith Bank Plc, combining secure digital collaboration tools with premier commercial banking networks.', { align: 'justify' });
      
      doc.moveDown(1.5);
      doc.text('We look forward to Zenith Bank’s feedback and are ready to schedule a kickoff meeting to discuss the integration roadmap.', { align: 'justify' });
      
      doc.moveDown(2);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Contact Channels:');
      doc.moveDown(0.5);
      bullet(doc, 'partnerships@notesstandard.com', 'Partnership Inquiries: ');
      bullet(doc, 'tech-integration@notesstandard.com', 'Technical API Team: ');
      bullet(doc, 'https://notesstandard.com/partnership', 'Official Partnership Portal: ');
      bullet(doc, 'Lagos, Nigeria', 'Corporate Office: ');
      
      doc.moveDown(2);
      doc.rect(50, doc.y, 495, 60).fill(LIGHT_GREY);
      doc.fillColor(NAVY)
         .font('Helvetica-Bold')
         .fontSize(10)
         .text('NoteStandard Technologies & Zenith Bank Plc', 50, doc.y - 45, { align: 'center', width: 495 });
      doc.fillColor(RED)
         .font('Helvetica-Oblique')
         .fontSize(9)
         .text('Securing Digital Productivity for the Modern Enterprise.', 50, doc.y - 30, { align: 'center', width: 495 });
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// ─── Compile PDF ───
// ─────────────────────────────────────────────────────────────────────────────

console.log(`Compiling ${pages.length} proposal pages...`);

pages.forEach((page, index) => {
  if (index > 0) {
    doc.addPage();
  }
  
  // Render page contents
  page.render(doc);
});

// Dynamic Page Numbering Header/Footer Injection
const totalPages = doc.bufferedPageRange().count;
console.log(`Injecting headers/footers dynamically. Total pages compiled: ${totalPages}`);

for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  
  if (i > 0) {
    // Gracefully handle dynamic extra pages generated by text-wrapping
    let pageTitle = 'Additional Context';
    if (pages[i] && pages[i].title) {
      pageTitle = pages[i].title;
    } else {
      // Find the last valid page title
      for (let j = i - 1; j >= 0; j--) {
        if (pages[j] && pages[j].title) {
          pageTitle = pages[j].title + ' (Cont.)';
          break;
        }
      }
    }
    
    // Save original page margins
    const origMargins = {
      top: doc.page.margins.top,
      bottom: doc.page.margins.bottom,
      left: doc.page.margins.left,
      right: doc.page.margins.right
    };
    
    // Temporarily clear margins so headers/footers never trigger page breaks
    doc.page.margins.top = 0;
    doc.page.margins.bottom = 0;
    doc.page.margins.left = 0;
    doc.page.margins.right = 0;
    
    drawHeader(doc, pageTitle);
    drawFooter(doc, i + 1, totalPages);
    
    // Restore original margins
    doc.page.margins.top = origMargins.top;
    doc.page.margins.bottom = origMargins.bottom;
    doc.page.margins.left = origMargins.left;
    doc.page.margins.right = origMargins.right;
  }
}

// Finalize PDF file
doc.end();

writeStream.on('finish', () => {
  console.log(`PDF compiled successfully! File saved at: ${outputPath}`);
});

writeStream.on('error', (err) => {
  console.error('Error writing PDF file:', err);
});
