'use strict';

/**
 * ScoredMatchingEngine.js
 * =======================
 * Multi-tier Scored Webhook & Transfer Matching Engine.
 * Match Priorities:
 *  - Priority 1 (Score 100): Exact Deposit Reference match (`NS-...`)
 *  - Priority 2 (Score 90): Provider Transaction ID match
 *  - Priority 3 (Score 80): Bank Reference / Narration match
 *  - Priority 4 (Score 70): Sender Account / Sender Name match
 *  - Priority 5 (Score 60): Expected Amount match
 *  - Priority 6 (Score 50): Date Window match (+/- 48 hours)
 */
class ScoredMatchingEngine {
  constructor(options = {}) {
    this.depositRefService = options.depositRefService;
  }

  /**
   * Evaluate match candidate against incoming webhook payload
   */
  async matchDeposit(webhookPayload, activeReferences = []) {
    const {
      reference,
      providerTxId,
      bankReference,
      senderName,
      senderAccount,
      amount,
      currency,
      receivedAt = new Date()
    } = webhookPayload;

    let bestMatch = null;
    let highestScore = 0;
    let matchReasons = [];

    // Helper to test a reference candidate
    const evaluateCandidate = (candidate) => {
      let score = 0;
      const reasons = [];

      // Currency check (Mandatory)
      if (candidate.currency && currency && candidate.currency.toUpperCase() !== currency.toUpperCase()) {
        return { score: 0, reasons: ['Currency mismatch'] };
      }

      // Priority 1: Exact Reference Match (NS-...)
      if (reference && candidate.reference && candidate.reference.toUpperCase() === String(reference).toUpperCase()) {
        score += 100;
        reasons.push('Matched Reference');
      } else if (
        bankReference &&
        candidate.reference &&
        String(bankReference).toUpperCase().includes(candidate.reference.toUpperCase())
      ) {
        score += 85;
        reasons.push('Matched Reference in Narration');
      }

      // Priority 2: Provider Transaction ID
      if (providerTxId && candidate.provider_tx_id && candidate.provider_tx_id === providerTxId) {
        score += 90;
        reasons.push('Matched Provider Tx ID');
      }

      // Priority 3: Bank Reference
      if (bankReference && candidate.bank_reference && candidate.bank_reference === bankReference) {
        score += 80;
        reasons.push('Matched Bank Reference');
      }

      // Priority 4: Sender Account / Name Match
      if (senderAccount && candidate.sender_account && candidate.sender_account === senderAccount) {
        score += 70;
        reasons.push('Matched Sender Account');
      }

      // Priority 5: Amount Match
      if (amount && candidate.expected_amount) {
        const diff = Math.abs(parseFloat(amount) - parseFloat(candidate.expected_amount));
        if (diff === 0) {
          score += 60;
          reasons.push('Matched Exact Amount');
        } else if (candidate.amount_validation_mode === 'ALLOW_OVERPAYMENT' && parseFloat(amount) >= parseFloat(candidate.expected_amount)) {
          score += 50;
          reasons.push('Matched Overpayment Amount');
        } else if (candidate.amount_validation_mode === 'ALLOW_PARTIAL' && parseFloat(amount) <= parseFloat(candidate.expected_amount)) {
          score += 50;
          reasons.push('Matched Partial Amount');
        } else if (candidate.amount_validation_mode === 'OPEN_AMOUNT') {
          score += 40;
          reasons.push('Matched Open Amount');
        }
      }

      // Priority 6: Date Window Match (Within 72 Hours)
      if (candidate.created_at) {
        const timeDiffMs = Math.abs(new Date(receivedAt) - new Date(candidate.created_at));
        if (timeDiffMs <= 72 * 3600 * 1000) {
          score += 20;
          reasons.push('Matched Date Window');
        }
      }

      return { score, reasons };
    };

    // 1. Direct Lookup if explicit reference provided
    if (reference && this.depositRefService) {
      const explicitRef = await this.depositRefService.findReference(reference);
      if (explicitRef && (explicitRef.status === 'AWAITING_PAYMENT' || explicitRef.status === 'CREATED')) {
        const evalRes = evaluateCandidate(explicitRef);
        if (evalRes.score > highestScore) {
          highestScore = evalRes.score;
          matchReasons = evalRes.reasons;
          bestMatch = explicitRef;
        }
      }
    }

    // 2. Evaluate array of active references
    for (const ref of activeReferences) {
      if (ref.status === 'AWAITING_PAYMENT' || ref.status === 'CREATED') {
        const evalRes = evaluateCandidate(ref);
        if (evalRes.score > highestScore) {
          highestScore = evalRes.score;
          matchReasons = evalRes.reasons;
          bestMatch = ref;
        }
      }
    }

    return {
      isMatched: highestScore >= 60,
      confidenceScore: highestScore,
      matchReasons,
      matchedReference: bestMatch
    };
  }
}

module.exports = ScoredMatchingEngine;
