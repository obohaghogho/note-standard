const supabase = require('../../config/database');
const logger = require('../../utils/logger');

/**
 * Fraud Engine for Financial Ledger
 * Evaluates behavioral heuristics and transactional velocity to score inbound webhooks.
 * Fraud Score scale: 0 (Safe) to 100 (Critical Fraud)
 */
class FraudEngine {
    
    /**
     * Evaluate an inbound webhook parsed payload against the active database.
     * @param {Object} parsedData - The parsed data from GreyEmailService
     * @returns {Promise<{ score: number, action: 'allow' | 'review' | 'block', reasons: string[] }>}
     */
    static async evaluateTransaction(parsedData) {
        let score = 0;
        const reasons = [];
        
        try {
            const senderName = parsedData.sender || parsedData.sender_fingerprint || 'Unknown';
            const amount = Number(parsedData.amount || parsedData.normalized_amount) || 0;
            const currency = parsedData.currency || parsedData.normalized_currency || 'UNKNOWN';
            const region = parsedData.region || parsedData.provider_region || 'UNKNOWN';

            // 1. Evaluate Sender Velocity (Multiple deposits in short time)
            // Query audit_logs or webhook_events for same sender
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            
            const { data: recentEvents, error: eventErr } = await supabase
                .from('webhook_events')
                .select('id, status')
                .gte('created_at', twentyFourHoursAgo)
                .limit(50);
                
            // Note: Currently webhook_events doesn't store 'sender' natively, 
            // but we can query reconciliation_queue which stores parsed_data->>sender.
            const { data: senderVelocity, error: velErr } = await supabase
                .from('reconciliation_queue')
                .select('id, status')
                .gte('created_at', twentyFourHoursAgo)
                .filter('parsed_data->>sender', 'eq', senderName);
                
            if (!velErr && senderVelocity && senderVelocity.length > 5) {
                score += 30;
                reasons.push(`High velocity: ${senderVelocity.length} unmatched/pending transactions from this sender in 24h`);
            }

            // 2. Evaluate Multiple Failed Reference Attempts
            // Did this specific sender or reference fail parsing multiple times?
            if (!velErr && senderVelocity) {
                const failedAttempts = senderVelocity.filter(v => v.status === 'rejected' || v.status === 'pending');
                if (failedAttempts.length >= 3) {
                    score += 40;
                    reasons.push(`Suspicious behavior: Multiple rejected/pending references from sender`);
                }
            }

            // 3. Amount Frequency (Repeated exact duplicate amounts)
            if (senderVelocity && senderVelocity.length > 2) {
                 const sameAmountCount = senderVelocity.filter(v => 
                     v.status === 'pending' && 
                     v.parsed_data && 
                     Number(v.parsed_data.amount || v.parsed_data.normalized_amount) === amount
                 ).length;
                 
                 if (sameAmountCount >= 2) {
                     score += 20;
                     reasons.push('Repeated exact amounts deposited within short window from same sender');
                 }
            }

            // 4. CROSS-REGION & MULTI-CURRENCY ANOMALY DETECTION
            if (senderVelocity && senderVelocity.length > 1) {
                 // Measure how many different regions this sender has triggered from
                 const regions = new Set(senderVelocity.map(v => v.parsed_data?.region || v.parsed_data?.provider_region).filter(Boolean));
                 if (regions.size > 1 && !regions.has(region)) {
                     score += 35;
                     reasons.push(`Cross-region spoofing detected. Sender triggered from multiple global regions (${Array.from(regions).join(',')}, ${region})`);
                 }
                 
                 // Measure currency swapping velocity
                 const currencies = new Set(senderVelocity.map(v => v.parsed_data?.currency || v.parsed_data?.normalized_currency).filter(Boolean));
                 if (currencies.size > 1 && !currencies.has(currency)) {
                     score += 25;
                     reasons.push(`Multi-currency anomaly. Sender actively mutating deposit currencies rapidly.`);
                 }
            }

            // 5. Basic Parsed Confidence (If parsed confidence is low, slightly elevate risk)
            const inboundConfidence = parsedData.confidence_score !== undefined ? parsedData.confidence_score : parsedData.confidence;
            if (inboundConfidence && inboundConfidence < 60) {
                score += 15;
                reasons.push(`Parsed confidence is below trusted threshold (${inboundConfidence})`);
            }

            // Combine and ascertain threshold limit
            score = Math.min(score, 100);
            
            let action = 'allow';
            if (score >= 40 && score < 75) action = 'review';
            if (score >= 75) action = 'block';
            
            logger.info(`[FraudEngine] Evaluated transaction from ${senderName}. Score: ${score}`, { action, reasons });
            
            return { score, action, reasons };

        } catch (err) {
            logger.error('[FraudEngine] Evaluation failed. Defaulting to review mode for safety.', err);
            // Default to 'review' if fraud engine goes down (fail closed)
            return { score: 50, action: 'review', reasons: ['Fraud Engine Internal Error'] };
        }
    /**
     * Evaluate a withdrawal attempt against behavioral heuristics.
     * @param {string} userId - UUID of the user
     * @param {Object} data - { amount, currency, destination, ip, deviceId }
     * @returns {Promise<{ score: number, action: 'allow' | 'review' | 'block', reasons: string[] }>}
     */
    static async evaluateWithdrawalRisk(userId, data) {
        let score = 0;
        const reasons = [];
        const { amount, currency, ip, deviceId } = data;

        try {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            // 1. Velocity Check (24h Total Volume)
            const { data: recentWithdrawals } = await supabase
                .from('ledger_entries')
                .select('amount')
                .eq('user_id', userId)
                .eq('status', 'COMPLETED')
                .like('reference', 'wdr_%')
                .gte('created_at', twentyFourHoursAgo);

            const totalVolume = Math.abs(recentWithdrawals?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0);
            if (totalVolume > 5000) { // $5000 threshold for review
                score += 40;
                reasons.push(`High 24h volume: ${totalVolume} ${currency} exceeded risk threshold`);
            }

            // 2. Withdrawal Timing (Deposit-to-Withdraw window)
            // Rule: "Rapid Recycling" - Heavily penalize withdrawals within 1 hour of deposit
            const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
            const { data: recentDeposits } = await supabase
                .from('ledger_entries')
                .select('amount, created_at')
                .eq('user_id', userId)
                .eq('status', 'COMPLETED')
                .in('type', ['DEPOSIT', 'TRANSFER_IN'])
                .gte('created_at', oneHourAgo);

            if (recentDeposits && recentDeposits.length > 0) {
                const totalRecentDeposit = recentDeposits.reduce((sum, d) => sum + Number(d.amount), 0);
                if (totalRecentDeposit >= Number(amount) * 0.5) { // If deposit covers >50% of withdrawal
                    score += 50;
                    reasons.push('Rapid recycling detected: Withdrawal attempted within 1 hour of significant deposit.');
                }
            }

            // 3. Geolocation & Device Anomalies
            const { data: lastTx } = await supabase
                .from('payout_requests')
                .select('ip_address, device_fingerprint')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (lastTx) {
                if (lastTx.ip_address && lastTx.ip_address !== ip) {
                    score += 20;
                    reasons.push('IP mismatch: Different IP used from last successful payout');
                }
                if (lastTx.device_fingerprint && lastTx.device_fingerprint !== deviceId) {
                    score += 25;
                    reasons.push('Device anomaly: Payout requested from a new or unrecognized device fingerprint');
                }
            }
            
            // 4. Account Takeover (ATO) Signals
            // Rule: Check for recent security changes (Password, 2FA, Email) in last 24h
            const { data: recentSecurityLogs } = await supabase
                .from('audit_logs')
                .select('created_at')
                .eq('user_id', userId)
                .in('action', ['password_change', '2fa_enabled', '2fa_disabled', 'email_change'])
                .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

            if (recentSecurityLogs && recentSecurityLogs.length > 0) {
                score += 40;
                reasons.push('ATO Signal: Recent security setting changes (Password/2FA) detected within 24h.');
            }

            score = Math.min(score, 100);
            
            let action = 'allow';
            if (score >= 60 && score < 80) action = 'review';
            if (score >= 80) action = 'block';

            return { score, action, reasons };

        } catch (err) {
            logger.error('[FraudEngine] Withdrawal evaluation failed.', err);
            return { score: 70, action: 'review', reasons: ['Fraud Engine Internal Error'] };
        }
    }
}

module.exports = FraudEngine;
