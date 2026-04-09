const sgMail = require("@sendgrid/mail");
const logger = require("../utils/logger");

/**
 * SendGrid Email Service
 *
 * Handles transactional emails via SendGrid API for:
 * - Deposit submission confirmations
 * - Deposit approval/rejection notifications
 * - Grey payment instructions
 * - Payment expiration notifications
 * - Payment success receipts
 */
class SendGridEmailService {
  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY;
    if (this.apiKey) {
      sgMail.setApiKey(this.apiKey);
    }
    this.from = process.env.EMAIL_FROM || "noreply@notestandard.com";
    this.senderName = "Note Standard";
  }

  /**
   * Send an email via SendGrid
   * @param {Object} params
   * @param {string} params.to - Recipient email
   * @param {string} params.subject - Subject line
   * @param {string} params.htmlContent - HTML body
   * @returns {Promise<boolean>} Success status
   */
  async sendEmail({ to, subject, htmlContent }) {
    if (!this.apiKey) {
      logger.warn("[SendGridEmailService] API Key missing. Skipping email.");
      return false;
    }

    const msg = {
      to,
      from: {
        email: this.from,
        name: this.senderName,
      },
      subject,
      html: htmlContent,
    };

    try {
      await sgMail.send(msg);
      logger.info(`[SendGridEmailService] Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      logger.error(
        `[SendGridEmailService] Failed to send email to ${to}:`,
        error.response?.body || error.message
      );
      return false;
    }
  }

  // ─── Email Templates (Migrated from Brevo) ────────────────────

  async sendDepositSubmittedEmail(email, { amount, currency, reference }) {
    const subject = "Deposit Received - Pending Review";
    const htmlContent = this._wrapTemplate(`
      <h2 style="color: #8b5cf6; margin-bottom: 16px;">💰 Deposit Received</h2>
      <p>We have received your deposit request:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Amount</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${currency} ${amount}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Reference</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-weight: 600;">${reference}</td></tr>
        <tr><td style="padding: 8px; color: #6b7280;">Status</td>
            <td style="padding: 8px; color: #f59e0b; font-weight: 600;">⏳ Pending Review</td></tr>
      </table>
      <p>Our team is currently reviewing your payment. This typically takes <strong>1-24 hours</strong>.</p>
    `);
    return this.sendEmail({ to: email, subject, htmlContent });
  }

  async sendDepositApprovedEmail(email, { amount, currency }) {
    const subject = "✅ Deposit Approved - Wallet Credited";
    const htmlContent = this._wrapTemplate(`
      <h2 style="color: #10b981; margin-bottom: 16px;">✅ Deposit Approved!</h2>
      <p>Your deposit of <strong>${currency} ${amount}</strong> has been approved.</p>
      <p>Your wallet has been credited successfully. You can now use your funds in the app.</p>
      <div style="margin-top: 24px;">
        <a href="${process.env.CLIENT_URL || "https://notestandard.com"}/dashboard/wallet"
           style="display: inline-block; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
           View Wallet
        </a>
      </div>
    `);
    return this.sendEmail({ to: email, subject, htmlContent });
  }

  async sendDepositRejectedEmail(email, { amount, currency, reason }) {
    const subject = "Deposit Rejected";
    const htmlContent = this._wrapTemplate(`
      <h2 style="color: #ef4444; margin-bottom: 16px;">❌ Deposit Rejected</h2>
      <p>Unfortunately, your deposit of <strong>${currency} ${amount}</strong> was rejected.</p>
      <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <strong>Reason:</strong> ${reason || "Invalid proof or payment not received."}
      </div>
      <p>If you believe this is a mistake, please contact our support team.</p>
    `);
    return this.sendEmail({ to: email, subject, htmlContent });
  }

  async sendGreyPaymentInstructions(
    email,
    { amount, currency, reference, bankDetails, expiresAt }
  ) {
    const expiryDate = new Date(expiresAt);
    const expiryFormatted = expiryDate.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const subject = `Bank Transfer Instructions - ${reference}`;
    const htmlContent = this._wrapTemplate(`
      <h2 style="color: #8b5cf6; margin-bottom: 16px;">🏦 Bank Transfer Instructions</h2>
      <p>Please transfer the exact amount below to complete your payment:</p>
      
      <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Bank Name</td>
              <td style="padding: 10px 0; font-weight: 600;">${bankDetails.bank_name}</td></tr>
          <tr><td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Account Name</td>
              <td style="padding: 10px 0; font-weight: 600;">${bankDetails.account_name}</td></tr>
          <tr><td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Account Number</td>
              <td style="padding: 10px 0; font-weight: 600; font-family: monospace; font-size: 18px;">${bankDetails.account_number}</td></tr>
          ${bankDetails.swift_code ? `<tr><td style="padding: 10px 0; color: #6b7280; font-size: 14px;">SWIFT Code</td>
              <td style="padding: 10px 0; font-weight: 600;">${bankDetails.swift_code}</td></tr>` : ""}
          ${bankDetails.iban ? `<tr><td style="padding: 10px 0; color: #6b7280; font-size: 14px;">IBAN</td>
              <td style="padding: 10px 0; font-weight: 600;">${bankDetails.iban}</td></tr>` : ""}
        </table>
      </div>
      
      <div style="background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white; border-radius: 12px; padding: 20px; margin: 16px 0; text-align: center;">
        <div style="font-size: 14px; opacity: 0.9;">Amount to Transfer</div>
        <div style="font-size: 28px; font-weight: 700; margin: 8px 0;">${currency} ${amount}</div>
        <div style="font-size: 14px; opacity: 0.9; margin-top: 8px;">Reference (include in narration/memo)</div>
        <div style="font-size: 22px; font-weight: 600; font-family: monospace; background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 8px; display: inline-block; margin-top: 4px;">${reference}</div>
      </div>
      
      <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <strong>⚠️ Important:</strong>
        <ul style="margin: 8px 0 0 0; padding-left: 20px;">
          <li>Transfer the <strong>exact amount</strong> shown above</li>
          <li>Include <strong>${reference}</strong> in the transfer narration/memo</li>
          <li>This payment link expires on <strong>${expiryFormatted}</strong></li>
        </ul>
      </div>
    `);
    return this.sendEmail({ to: email, subject, htmlContent });
  }

  async sendPaymentExpiredNotification(email, { amount, currency, reference }) {
    const subject = "Payment Expired";
    const htmlContent = this._wrapTemplate(`
      <h2 style="color: #f59e0b; margin-bottom: 16px;">⏰ Payment Expired</h2>
      <p>Your pending bank transfer of <strong>${currency} ${amount}</strong> (Ref: <code>${reference}</code>) has expired.</p>
      <p>If you already made the transfer, please contact our support team with your transaction receipt.</p>
      <p>If you still want to make this payment, please initiate a new deposit from your dashboard.</p>
      <div style="margin-top: 24px;">
        <a href="${process.env.CLIENT_URL || "https://notestandard.com"}/dashboard/wallet"
           style="display: inline-block; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
           New Deposit
        </a>
      </div>
    `);
    return this.sendEmail({ to: email, subject, htmlContent });
  }

  async sendPaymentAutoConfirmedEmail(
    email,
    { amount, currency, reference, verifiedVia }
  ) {
    const subject = "✅ Payment Confirmed Automatically";
    const htmlContent = this._wrapTemplate(`
      <h2 style="color: #10b981; margin-bottom: 16px;">✅ Payment Confirmed</h2>
      <p>Your bank transfer has been verified and your wallet has been credited:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Amount</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${currency} ${amount}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Reference</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-family: monospace;">${reference}</td></tr>
        <tr><td style="padding: 8px; color: #6b7280;">Verified Via</td>
            <td style="padding: 8px; color: #10b981; font-weight: 600;">${verifiedVia || "Automatic"}</td></tr>
      </table>
      <div style="margin-top: 24px;">
        <a href="${process.env.CLIENT_URL || "https://notestandard.com"}/dashboard/wallet"
           style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
           View Wallet
        </a>
      </div>
    `);
    return this.sendEmail({ to: email, subject, htmlContent });
  }

  _wrapTemplate(body) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table role="presentation" style="width: 100%; background-color: #f3f4f6;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" style="width: 100%; max-width: 560px; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #1e1b4b, #312e81); padding: 24px 32px;">
                  <span style="color: white; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">📝 Note Standard</span>
                </td>
              </tr>
              <!-- Content -->
              <tr>
                <td style="padding: 32px;">
                  ${body}
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e5e7eb; text-align: center;">
                  <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                    © ${new Date().getFullYear()} Note Standard. All rights reserved.
                  </p>
                  <p style="margin: 4px 0 0; color: #9ca3af; font-size: 12px;">
                    This is an automated message. Please do not reply directly.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
  }
}

module.exports = new SendGridEmailService();
