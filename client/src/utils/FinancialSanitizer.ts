/**
 * Financial Sanitizer (Hardened v5.4)
 * Mandatory Quarantine Gate for all incoming financial data.
 * Ensures absolute Zero-NaN policy at the system boundary.
 */

export const FinancialSanitizer = {
  /**
   * Cleans a raw financial value. Rejects NaN, Infinity, and invalid types.
   */
  sanitize(val: any, fallback: number = 0): number {
    if (val === null || val === undefined) return fallback;
    
    let num: number;
    if (typeof val === 'number') {
      num = val;
    } else if (typeof val === 'string') {
      // Remove any non-numeric characters except decimal point and minus sign
      const cleaned = val.replace(/[^0-9.-]/g, '');
      num = parseFloat(cleaned);
    } else {
      return fallback;
    }

    if (isNaN(num) || !isFinite(num)) {
      console.warn(`[FinancialSanitizer] Invalid financial input detected: ${val}. Normalizing to ${fallback}.`);
      return fallback;
    }

    return num;
  },

  /**
   * Recursively scans an object/array and sanitizes potential financial fields
   */
  quarantine(data: any): any {
    if (!data || typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map(item => this.quarantine(item));
    }

    const sanitized: any = {};
    const financialKeys = [
      'balance', 'available_balance', 'amount', 'rate', 'price', 
      'fee', 'total', 'exchange_rate', 'amount_from', 'amount_to',
      'valuation', 'holdings', 'locked'
    ];

    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const value = data[key];
        
        if (financialKeys.includes(key.toLowerCase()) || key.toLowerCase().endsWith('_amount')) {
          sanitized[key] = this.sanitize(value);
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.quarantine(value);
        } else {
          sanitized[key] = value;
        }
      }
    }

    return sanitized;
  }
};

export default FinancialSanitizer;
