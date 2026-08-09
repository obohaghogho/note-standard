/**
 * AI Support Engine — Rule-Based Auto-Response Generator
 * ───────────────────────────────────────────────────────
 * Generates intelligent, context-aware support responses for user
 * feedback reports and follow-up messages. Uses NoteStandard's internal
 * knowledge base — no external LLM API required.
 *
 * Architecture:
 *   report submitted → generateAutoReply(report) → feedback_comments
 *   user follow-up   → generateFollowUpReply(comment, report) → feedback_comments
 */

const logger = require('../utils/logger');

// ─── NoteStandard Knowledge Base ────────────────────────────────────────────
// Category-specific troubleshooting mapped to common issue patterns.

const KNOWLEDGE_BASE = {
  payment: {
    patterns: [
      'deposit', 'card', 'payment', 'charge', 'declined', 'refund',
      'debit', 'credit', 'bank', 'transfer failed', 'transaction failed',
      'paystack', 'fincra', 'funding', 'top up', 'top-up'
    ],
    responses: {
      default: {
        greeting: "Thank you for reporting this payment issue.",
        steps: [
          "Please verify your card details are correct and the card has not expired.",
          "Ensure your bank has not blocked online transactions — you may need to enable online payments via your banking app.",
          "Try using a different card or payment method if available.",
          "Check if the exact error message appears in your transaction history under Dashboard → Transactions.",
          "If the charge was made but funds were not credited, please allow up to 15 minutes for automatic reconciliation."
        ],
        closing: "If this issue persists after trying the steps above, our engineering team will investigate your specific transaction. Please include your transaction reference number if available."
      },
      deposit_failed: {
        greeting: "We understand how frustrating a failed deposit can be.",
        steps: [
          "Verify that your bank account or card has sufficient funds.",
          "Check if your bank sent you an OTP or authentication prompt that may have timed out.",
          "Try clearing your browser cache and attempting the deposit again.",
          "If the funds were debited from your bank but not reflected in your NoteStandard wallet, the system will automatically reverse or credit the amount within 24 hours.",
          "Navigate to Dashboard → Transactions to check if the deposit is showing as 'pending'."
        ],
        closing: "Our payment reconciliation system runs continuously. If the funds don't appear within 24 hours, this report will be escalated to our finance team."
      },
      refund: {
        greeting: "We've received your refund request.",
        steps: [
          "Refunds typically take 3-5 business days to reflect in your bank account.",
          "Check your transaction history for the refund status — it may show as 'processing'.",
          "If you paid via card, the refund will be returned to the same card.",
          "For bank transfer refunds, ensure the bank details on your account are correct."
        ],
        closing: "Our finance team processes refund requests on a priority basis. You'll receive an email confirmation once the refund is initiated."
      }
    }
  },

  wallet: {
    patterns: [
      'wallet', 'balance', 'missing', 'funds', 'incorrect', 'wrong amount',
      'not showing', 'disappeared', 'zero balance', 'currency', 'swap',
      'exchange', 'conversion', 'rate'
    ],
    responses: {
      default: {
        greeting: "Thank you for reporting this wallet issue.",
        steps: [
          "Pull down to refresh your wallet balance — cached data may be showing an outdated amount.",
          "Navigate to Dashboard → Transactions to verify recent activity matches your expected balance.",
          "If you recently performed a swap or transfer, allow a few moments for the ledger to update.",
          "Try logging out and logging back in to force a fresh wallet sync.",
          "Check if the issue affects a specific currency wallet or all wallets."
        ],
        closing: "Your wallet balances are stored securely in our ledger system. If there's a discrepancy, our team will investigate the transaction history and correct any errors."
      },
      swap_issue: {
        greeting: "We've noted your currency swap concern.",
        steps: [
          "Exchange rates fluctuate in real-time — the rate you see at quote time is locked for 30 seconds.",
          "Verify both your source and destination wallet balances after the swap.",
          "Check Dashboard → Transactions for the swap record, which shows the exact rate applied.",
          "If the received amount seems incorrect, compare it against the quoted rate shown in the swap confirmation.",
          "Our swap engine applies a transparent fee (shown before confirmation) which affects the final amount."
        ],
        closing: "If you believe the swap amount is incorrect, please share the transaction ID from your history and our engineering team will audit the exact rate and fee calculation."
      }
    }
  },

  chat: {
    patterns: [
      'chat', 'message', 'send', 'receive', 'offline', 'connect',
      'socket', 'notification', 'read receipt', 'typing', 'voice',
      'call', 'media', 'image', 'file', 'attachment'
    ],
    responses: {
      default: {
        greeting: "We've received your chat-related report.",
        steps: [
          "Check your internet connection — chat requires an active WebSocket connection.",
          "Try refreshing the page or closing and reopening the chat window.",
          "Clear your browser cache and cookies, then log in again.",
          "If messages are stuck as 'sending', check if you're in an area with poor network connectivity.",
          "For media/file upload issues, ensure the file is under 25MB and in a supported format (JPG, PNG, PDF, MP4)."
        ],
        closing: "Our real-time messaging infrastructure is actively monitored. If this is a recurring issue, we'll investigate the connection logs for your account."
      }
    }
  },

  performance: {
    patterns: [
      'slow', 'lag', 'freeze', 'crash', 'loading', 'hang', 'stuck',
      'unresponsive', 'timeout', 'error', 'blank screen', 'white screen',
      'not loading', 'spinning'
    ],
    responses: {
      default: {
        greeting: "We take performance issues seriously — thank you for letting us know.",
        steps: [
          "Try clearing your browser cache and cookies (Settings → Privacy → Clear Browsing Data).",
          "Disable browser extensions that might interfere with the app (ad blockers, VPNs).",
          "Check if the issue occurs on a different browser (Chrome, Firefox, Safari) or device.",
          "Ensure your browser is updated to the latest version.",
          "If on mobile, try switching between WiFi and mobile data to rule out network issues.",
          "Close other resource-heavy tabs or applications that might be consuming memory."
        ],
        closing: "We've captured diagnostic telemetry from your session which will help our engineering team identify the root cause. Performance fixes are treated as high-priority."
      }
    }
  },

  security: {
    patterns: [
      'security', 'hack', 'unauthorized', 'suspicious', 'phishing',
      'password', 'breach', 'stolen', 'compromise', 'two-factor', '2fa',
      'login attempt', 'someone accessed'
    ],
    responses: {
      default: {
        greeting: "⚠️ Security concerns are treated with the highest priority.",
        steps: [
          "Immediately change your password if you suspect unauthorized access.",
          "Enable two-factor authentication (2FA) if you haven't already — go to Settings → Security.",
          "Review your recent login history under Settings → Security → Active Sessions.",
          "Log out of all other devices using Settings → Security → Sign Out All Devices.",
          "Do NOT share your PIN, password, or recovery codes with anyone — NoteStandard staff will never ask for these."
        ],
        closing: "🔒 This report has been flagged as a SECURITY PRIORITY and will be reviewed by our security team within 1 hour. If you believe your account has been compromised, we recommend securing your email account as well."
      }
    }
  },

  bug_report: {
    patterns: [
      'bug', 'broken', 'not working', 'error', 'issue', 'problem',
      'fail', 'crash', 'glitch', 'unexpected'
    ],
    responses: {
      default: {
        greeting: "Thank you for reporting this bug — your feedback helps us improve NoteStandard.",
        steps: [
          "We've captured your device information and session data to help diagnose the issue.",
          "Try refreshing the page or restarting the app to see if the issue resolves.",
          "If this is reproducible, the reproduction steps you provided will help us fix it faster.",
          "Check if the issue occurs consistently or only intermittently."
        ],
        closing: "Our engineering team reviews all bug reports daily. Critical bugs are patched within 24-48 hours, and you'll be notified when a fix is deployed."
      }
    }
  },

  feature_request: {
    patterns: [
      'feature', 'suggest', 'wish', 'would be nice', 'add', 'implement',
      'support for', 'ability to', 'option to', 'please add'
    ],
    responses: {
      default: {
        greeting: "Great idea! We appreciate feature suggestions from our community.",
        steps: [
          "Your feature request has been added to our product backlog for evaluation.",
          "Other users can upvote this request, which helps us prioritize development.",
          "You can track the status of your request in the 'Roadmap' tab.",
          "High-demand features are fast-tracked into our development sprints."
        ],
        closing: "Thank you for helping shape the future of NoteStandard! We'll update this ticket when the feature enters development planning."
      }
    }
  },

  general: {
    patterns: [],
    responses: {
      default: {
        greeting: "Thank you for reaching out to NoteStandard Support.",
        steps: [
          "We've received your message and our support team is reviewing it.",
          "For urgent issues, please indicate the priority level when submitting feedback.",
          "You can track the status of all your reports in the 'My Reports' tab.",
          "Feel free to add follow-up comments with additional details."
        ],
        closing: "Our team typically responds within a few hours during business hours. Critical issues are handled around the clock."
      }
    }
  }
};

// ─── Follow-Up Response Templates ───────────────────────────────────────────

const FOLLOW_UP_TEMPLATES = {
  gratitude: {
    patterns: ['thank', 'thanks', 'appreciate', 'helpful', 'great', 'awesome', 'resolved', 'fixed', 'working now'],
    response: "You're welcome! We're glad we could help. If you encounter any other issues, don't hesitate to reach out. Your feedback helps us improve NoteStandard for everyone. 🎉"
  },
  still_broken: {
    patterns: ['still', 'not fixed', 'still happening', 'same issue', 'same problem', 'didn\'t work', 'not working', 'again', 'keeps happening'],
    response: "We're sorry the issue is persisting. We've escalated this to our senior engineering team for a deeper investigation. Could you please provide:\n\n1. The exact time the issue last occurred\n2. Any error messages you see on screen\n3. Which browser/device you're using\n\nThis additional context will help us pinpoint the root cause faster."
  },
  urgency: {
    patterns: ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'money', 'stuck', 'can\'t access', 'locked out'],
    response: "We understand the urgency of your situation. This has been escalated to our priority response queue. Our team is actively investigating and will provide an update shortly. If this involves a financial transaction, rest assured that all funds are secured in our ledger system."
  },
  question: {
    patterns: ['how', 'where', 'when', 'what', 'can i', 'is it possible', 'how do i', 'how to'],
    response: "Great question! Here are some resources that might help:\n\n• **Dashboard Guide**: Navigate to Settings → Help for in-app guidance\n• **Transaction History**: Dashboard → Transactions shows all your activity\n• **Wallet Management**: Dashboard → Wallet for balance and transfer options\n• **Security Settings**: Settings → Security for password and 2FA management\n\nIf your question isn't covered above, please provide more details and our team will get back to you with a specific answer."
  },
  additional_info: {
    patterns: ['here is', 'attached', 'screenshot', 'video', 'i tried', 'i did', 'update', 'more info', 'additional'],
    response: "Thank you for providing additional details — this is very helpful for our investigation. We've updated your report with this new information. Our engineering team will factor this into their diagnosis. We'll keep you posted on progress."
  }
};

class AISupportEngine {
  /**
   * Generate an auto-reply for a newly created feedback report.
   * @param {Object} report - The created report object
   * @returns {Object} - { content: string, metadata: object }
   */
  generateAutoReply(report) {
    try {
      const category = (report.category_id || report.categoryId || 'general').toLowerCase();
      const description = (report.description || report.comment || '').toLowerCase();
      const priority = (report.priority || 'medium').toLowerCase();

      // Find the best matching category from knowledge base
      const kbCategory = this._findBestCategory(category, description);
      const kbEntry = KNOWLEDGE_BASE[kbCategory] || KNOWLEDGE_BASE.general;

      // Find the best sub-response within the category
      const subResponse = this._findBestSubResponse(kbEntry, description);

      // Build the response
      const content = this._buildResponse(subResponse, priority, report.title);

      logger.info(`[AISupportEngine] Generated auto-reply for report ${report.id} (category: ${kbCategory})`);

      return {
        content,
        metadata: {
          engine: 'notestandard_ai_support_v1',
          category: kbCategory,
          priority,
          generatedAt: new Date().toISOString(),
          isAutoReply: true,
        }
      };
    } catch (err) {
      logger.error(`[AISupportEngine] generateAutoReply failed: ${err.message}`);
      return {
        content: this._getFallbackResponse(),
        metadata: { engine: 'notestandard_ai_support_v1', fallback: true }
      };
    }
  }

  /**
   * Generate a follow-up reply when a user posts a comment.
   * @param {string} commentContent - The user's follow-up message
   * @param {Object} report - The parent report
   * @returns {Object|null} - { content, metadata } or null if no response needed
   */
  generateFollowUpReply(commentContent, report) {
    try {
      const content = (commentContent || '').toLowerCase().trim();
      if (!content || content.length < 3) return null;

      // Match against follow-up templates
      for (const [templateKey, template] of Object.entries(FOLLOW_UP_TEMPLATES)) {
        const matchScore = template.patterns.filter(p => content.includes(p)).length;
        if (matchScore > 0) {
          logger.info(`[AISupportEngine] Follow-up matched template: ${templateKey} (score: ${matchScore})`);
          return {
            content: template.response,
            metadata: {
              engine: 'notestandard_ai_support_v1',
              template: templateKey,
              matchScore,
              generatedAt: new Date().toISOString(),
              isAutoReply: true,
            }
          };
        }
      }

      // Generic follow-up if no template matched
      return {
        content: "Thank you for your follow-up message. Our support team has been notified and will review your update. We aim to respond to all follow-ups within a few hours. If this is urgent, please update the priority level of your report.",
        metadata: {
          engine: 'notestandard_ai_support_v1',
          template: 'generic_followup',
          generatedAt: new Date().toISOString(),
          isAutoReply: true,
        }
      };
    } catch (err) {
      logger.error(`[AISupportEngine] generateFollowUpReply failed: ${err.message}`);
      return null;
    }
  }

  // ─── Internal Helpers ──────────────────────────────────────────────────

  /**
   * Find the best matching knowledge base category based on
   * the report's category ID and description keywords.
   */
  _findBestCategory(categoryId, description) {
    // Direct category match first
    if (KNOWLEDGE_BASE[categoryId]) return categoryId;

    // Fall back to pattern matching in description
    let bestMatch = 'general';
    let bestScore = 0;

    for (const [cat, kb] of Object.entries(KNOWLEDGE_BASE)) {
      if (!kb.patterns) continue;
      const score = kb.patterns.filter(p => description.includes(p)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cat;
      }
    }

    return bestMatch;
  }

  /**
   * Find the best sub-response within a category.
   * E.g., for payment → "deposit_failed" vs "refund" vs "default"
   */
  _findBestSubResponse(kbEntry, description) {
    const responses = kbEntry.responses || {};

    for (const [key, resp] of Object.entries(responses)) {
      if (key === 'default') continue;

      // Check if the sub-response key matches the description
      const subPatterns = key.split('_');
      const matches = subPatterns.filter(p => description.includes(p)).length;
      if (matches > 0) return resp;
    }

    return responses.default || KNOWLEDGE_BASE.general.responses.default;
  }

  /**
   * Build a formatted response string from a response template.
   */
  _buildResponse(template, priority, title) {
    const parts = [];

    // Greeting
    parts.push(template.greeting);
    parts.push('');

    // Priority acknowledgment
    if (priority === 'critical') {
      parts.push('🚨 **Priority: CRITICAL** — This report has been flagged for immediate attention.');
      parts.push('');
    } else if (priority === 'high') {
      parts.push('⚡ **Priority: HIGH** — This report is being fast-tracked to our engineering team.');
      parts.push('');
    }

    // Troubleshooting steps
    if (template.steps && template.steps.length > 0) {
      parts.push('Here are some things you can try while we investigate:');
      parts.push('');
      template.steps.forEach((step, idx) => {
        parts.push(`${idx + 1}. ${step}`);
      });
      parts.push('');
    }

    // Closing
    parts.push(template.closing);

    // Signature
    parts.push('');
    parts.push('— NoteStandard Support AI 🤖');

    return parts.join('\n');
  }

  /**
   * Fallback response when everything fails.
   */
  _getFallbackResponse() {
    return [
      "Thank you for contacting NoteStandard Support.",
      "",
      "We've received your report and our team is reviewing it. We aim to respond to all reports within a few hours during business hours.",
      "",
      "In the meantime, you can:",
      "1. Check our FAQ section for common solutions",
      "2. Add more details or screenshots to this report",
      "3. Update the priority level if this is urgent",
      "",
      "— NoteStandard Support AI 🤖"
    ].join('\n');
  }
}

module.exports = new AISupportEngine();
