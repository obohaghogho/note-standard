const transactionService = require("../services/transactionService");
const supabase = require("../config/database");
const PDFDocument = require("pdfkit");
const mathUtils = require("../utils/mathUtils");

/**
 * Transaction Controller
 * Handles user transaction reporting.
 */
exports.getHistory = async (req, res) => {
  try {
    const { page, limit, type, currency, status, search } = req.query;
    const history = await transactionService.getHistory(req.user.id, {
      page,
      limit,
      type,
      currency,
      status,
      search
    });
    res.json(history);
  } catch (err) {
    console.error("Wallet transactions route crash:", err);
    res.status(500).json({
      error: "Failed to fetch transactions",
      message: err.message,
    });
  }
};

/**
 * Generate and download a PDF receipt
 */
exports.downloadReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: tx, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error || !tx) {
      return res.status(404).json({ error: "Transaction not found or unauthorized" });
    }

    const doc = new PDFDocument({ margin: 50 });
    const filename = `Receipt_${tx.id.substring(0, 8)}.pdf`;

    res.setHeader("Content-disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-type", "application/pdf");

    doc.pipe(res);

    // Header
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("Transaction Receipt", { align: "center" });
    doc.moveDown();

    // Boxed Content
    doc.rect(50, 100, 500, 300).stroke();

    let currentY = 120;
    const drawRow = (label, value) => {
      doc.fontSize(12).font("Helvetica-Bold").text(label, 70, currentY);
      doc.font("Helvetica").text(value, 200, currentY, { width: 320, align: "right" });
      currentY += 25;
    };

    const date = new Date(tx.created_at).toLocaleString();
    const typeLabel = tx.display_label || tx.type.replace(/_/g, " ").toUpperCase();
    const amount = `${tx.type.includes('IN') || tx.type === 'DEPOSIT' ? '+' : '-'}${mathUtils.formatForCurrency(tx.amount || tx.amount_from, tx.currency || tx.from_currency)} ${tx.currency || tx.from_currency || 'USD'}`;

    drawRow("Receipt ID:", tx.id);
    drawRow("Date:", date);
    drawRow("Type:", typeLabel);
    drawRow("Status:", tx.status.toUpperCase());
    
    // Line separator
    doc.moveTo(70, currentY).lineTo(530, currentY).stroke();
    currentY += 15;

    drawRow("Amount:", amount);
    if (tx.fee > 0) {
        drawRow("Fee:", `${mathUtils.formatForCurrency(tx.fee, tx.currency || tx.from_currency)} ${tx.currency || tx.from_currency}`);
    }
    
    // Additional metadata if available (like exchange rate/recipient)
    if (tx.exchange_rate) {
        drawRow("Exchange Rate:", `1 ${tx.from_currency} = ${tx.exchange_rate} ${tx.to_currency}`);
    }

    doc.end();

  } catch (err) {
    console.error("Receipt generation crash:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate receipt" });
    }
  }
};
