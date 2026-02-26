const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send Verification Email
 * @param {string} email - Recipient email
 * @param {string} fullName - Recipient name
 * @param {string} token - Verification token (OTP)
 * @param {string} clientUrl - Base URL for the link
 */
exports.sendVerificationEmail = async (email, fullName, token, clientUrl) => {
  try {
    const verificationLink = `${clientUrl}/verify?email=${
      encodeURIComponent(email)
    }&token=${token}`;

    const mailOptions = {
      from: `"Note Standard" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: "Verify your Note Standard account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #6366f1;">Welcome to Note Standard, ${fullName}!</h2>
          <p>Thank you for signing up. To complete your registration and secure your account, please verify your email address.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${verificationLink}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email Address</a>
          </div>
          <p>Alternatively, you can enter this code in the app:</p>
          <h1 style="letter-spacing: 5px; color: #333; text-align: center;">${token}</h1>
          <p style="font-size: 12px; color: #777;">This link and code will expire in 15 minutes.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 10px; color: #999;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info("Verification email sent", {
      messageId: info.messageId,
      email,
    });
    return true;
  } catch (error) {
    logger.error("Failed to send verification email", {
      error: error.message,
      email,
    });
    return false;
  }
};

/**
 * Send Payment Receipt
 * @param {string} email - Recipient email
 * @param {Object} transaction - Transaction details
 */
exports.sendPaymentReceipt = async (email, transaction) => {
  try {
    const displayLabel = transaction.display_label || "Digital Assets Purchase";

    const mailOptions = {
      from: `"Note Standard" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: `Receipt for your ${displayLabel}`,
      text: `
        Hello, 
        Your payment for ${displayLabel} was successful.
        
        Amount: ${transaction.currency} ${transaction.amount}
        Date: ${new Date(transaction.created_at).toLocaleString()}
        Reference: ${transaction.reference_id || transaction.id}
        
        Thank you for choosing NoteStandard.
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info("Payment receipt sent", {
      email,
      reference: transaction.reference_id,
    });

    return true;
  } catch (error) {
    logger.error("Failed to send payment receipt", {
      error: error.message,
      email,
    });
    return false;
  }
};

/**
 * Send Password Reset Email
 * @param {string} email - Recipient email
 * @param {string} resetLink - Full URL with token for password reset
 */
exports.sendPasswordResetEmail = async (email, resetLink) => {
  try {
    const mailOptions = {
      from: `"Note Standard" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: "Reset your Note Standard password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #6366f1;">Password Reset Request</h2>
          <p>We received a request to reset the password for your Note Standard account.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${resetLink}" style="background-color: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p style="font-size: 12px; color: #777;">This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 10px; color: #999;">Note Standard — Secure Account Recovery</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info("Password reset email sent", {
      messageId: info.messageId,
      email,
    });
    return true;
  } catch (error) {
    logger.error("Failed to send password reset email", {
      error: error.message,
      email,
    });
    return false;
  }
};
