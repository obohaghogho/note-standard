/**
 * Invoice Service
 * Generates PDF invoices for Digital Assets Purchases
 */

const PDFDocument = require("pdfkit");
const path = require("path");
const logger = require("../utils/logger");

/**
 * Generate Invoice PDF
 * @param {Object} transaction - Transaction data from Supabase
 * @param {Object} user - User profile data
 */
exports.generateInvoice = async (transaction, user) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      let buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // 1. Header & Branding
      doc.fontSize(24).text("NoteStandard", { align: "left" });
      doc.fontSize(10).text("Digital Assets Solutions", { align: "left" });
      doc.moveDown();

      doc.fontSize(18).text("INVOICE", { align: "right" });
      doc.fontSize(10).text(
        `Invoice #: ${transaction.id.substring(0, 8).toUpperCase()}`,
        { align: "right" },
      );
      doc.text(
        `Date: ${new Date(transaction.created_at).toLocaleDateString()}`,
        { align: "right" },
      );
      doc.moveDown(2);

      // 2. Client & Provider Info
      const startY = doc.y;
      doc.fontSize(12).text("Billed To:", { underline: true });
      doc.fontSize(10).text(
        user.full_name || user.username || "Valued Customer",
      );
      doc.text(user.email);

      doc.y = startY;
      doc.fontSize(12).text("Provider:", { align: "right", underline: true });
      doc.fontSize(10).text("NoteStandard Payments", { align: "right" });
      doc.text("support@notestandard.com", { align: "right" });
      doc.moveDown(3);

      // 3. Invoice Table
      doc.fontSize(12).text("Description", 50, doc.y, { width: 300 });
      doc.text("Quantity", 350, doc.y, { width: 50, align: "right" });
      doc.text("Price", 400, doc.y, { width: 100, align: "right" });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      // Item Row
      const itemY = doc.y;
      doc.fontSize(10).text("Digital Assets Purchase", 50, itemY, {
        width: 300,
      });
      doc.text("1", 350, itemY, { width: 50, align: "right" });
      doc.text(
        `${transaction.currency} ${transaction.amount.toLocaleString()}`,
        400,
        itemY,
        { width: 100, align: "right" },
      );
      doc.moveDown(1.5);

      if (transaction.internal_coin && transaction.internal_amount) {
        doc.fontSize(8).fillColor("gray").text(
          `(Internal Reference: ${transaction.internal_amount} ${transaction.internal_coin})`,
          50,
          doc.y,
        );
        doc.fillColor("black");
        doc.moveDown();
      }

      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      // 4. Totals
      doc.fontSize(12).text("Total Amount:", 300, doc.y, { continued: true });
      doc.text(
        ` ${transaction.currency} ${transaction.amount.toLocaleString()}`,
        { align: "right", bold: true },
      );
      doc.moveDown(2);

      // 5. Payment Details
      doc.fontSize(10).text(`Status: ${transaction.status.toUpperCase()}`, {
        bold: true,
      });
      doc.text(`Reference: ${transaction.reference_id || transaction.id}`);
      doc.text(`Provider: ${transaction.provider || "NoteStandard Internal"}`);
      doc.moveDown(3);

      // 6. Footer
      doc.fontSize(8).fillColor("gray").text(
        "Thank you for choosing NoteStandard for your digital asset needs.",
        { align: "center" },
      );
      doc.text(
        "This is a computer-generated invoice and requires no signature.",
        { align: "center" },
      );

      doc.end();
    } catch (error) {
      logger.error("Failed to generate PDF invoice", {
        error: error.message,
        transactionId: transaction.id,
      });
      reject(error);
    }
  });
};
