/**
 * Mail Service
 * Handles sending email receipts and notifications.
 * Integration point for SendGrid, AWS SES, or Nodemailer.
 */

const logger = require("../utils/logger");

/**
 * Send Payment Receipt
 * @param {string} email - Recipient email
 * @param {Object} transaction - Transaction details
 */
exports.sendPaymentReceipt = async (email, transaction) => {
  try {
    const displayLabel = transaction.display_label || "Digital Assets Purchase";

    // In a real production environment, you would use an email provider here.
    // For now, we log the rich receipt data which can be emitted as a notification.
    const receiptData = {
      to: email,
      subject: `Receipt for your ${displayLabel}`,
      body: `
                Hello, 
                Your payment for ${displayLabel} was successful.
                
                Amount: ${transaction.currency} ${transaction.amount}
                Date: ${new Date(transaction.created_at).toLocaleString()}
                Reference: ${transaction.reference_id || transaction.id}
                
                Thank you for choosing NoteStandard.
            `,
      metadata: {
        category: "digital_assets",
        product_type: "digital_asset",
      },
    };

    logger.info("Payment receipt prepared", { receiptData });

    // TODO: Integrate with Nodemailer/SendGrid
    // Example: await transporter.sendMail(receiptData);

    return true;
  } catch (error) {
    logger.error("Failed to send payment receipt", {
      error: error.message,
      email,
    });
    return false;
  }
};
