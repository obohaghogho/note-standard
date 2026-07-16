const math = require("./mathUtils");

/**
 * Settlement Calendar Utility
 * Provides deterministic logic for operational finality windows (e.g. Fiat T+1).
 */
class SettlementCalendar {
    /**
     * Determine if a given date is a business day.
     * (Standard: Monday-Friday, excluding weekends).
     */
    isBusinessDay(date) {
        const day = date.getUTCDay();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
    }

    /**
     * Calculate the timestamp for the next Nth business day.
     */
    getNextBusinessDay(fromDate, offset = 1) {
        let result = new Date(fromDate);
        let daysAdded = 0;

        while (daysAdded < offset) {
            result.setUTCDate(result.getUTCDate() + 1);
            if (this.isBusinessDay(result)) {
                daysAdded++;
            }
        }

        // Standardize to end of business day (23:59:59.999 UTC) for conservative finality
        result.setUTCHours(23, 59, 59, 999);
        return result;
    }

    /**
     * Compute Confidence for Fiat Rails based on age.
     * Rule: 0.95 after next_business_day(calendar).
     */
    getFiatConfidence(createdAt) {
        const createdDate = new Date(createdAt);
        const settlementThreshold = this.getNextBusinessDay(createdDate, 1);
        const now = new Date();

        if (now >= settlementThreshold) {
            return 0.9500;
        }

        return 0.0000;
    }

    /**
     * Compute Confidence for Crypto Rails based on confirmations.
     * Rule: min(1.0, confirmations / 6).
     */
    getCryptoConfidence(confirmations) {
        const conf = parseInt(confirmations) || 0;
        const confidence = Math.min(1.0, conf / 6);
        return parseFloat(confidence.toFixed(4));
    }
}

module.exports = new SettlementCalendar();
