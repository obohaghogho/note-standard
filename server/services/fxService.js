/**
 * FX Service
 * Handles live currency exchange rates with caching
 */

const axios = require('axios');
const supabase = require('../config/supabase');

// Cache configuration: 1 hour TTL
const CACHE_TTL = 3600 * 1000;
const rateCache = new Map();

// Fallback rates (Mock data for safety if API is down)
const FALLBACK_RATES = {
    'USD': 1.0,
    'EUR': 0.92,
    'GBP': 0.79,
    'NGN': 1550,
    'BTC': 0.000015,
    'ETH': 0.00028
};

/**
 * Get exchange rate for a currency pair
 */
async function getRate(from, to) {
    if (from === to) return 1.0;

    try {
        // Try to get from centralized cache (or DB)
        const cacheKey = `${from}_${to}`;
        const cached = rateCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            return cached.rate;
        }

        // Fetch from API if not in cache or expired
        // Base currency is always USD for simplicity in this implementation
        const rates = await fetchRatesFromAPI(from);
        const rate = rates[to];

        if (!rate) {
            console.warn(`[FXService] Rate not found for ${from}->${to}, using fallback`);
            return FALLBACK_RATES[to] / FALLBACK_RATES[from];
        }

        // Cache the result
        rateCache.set(cacheKey, { rate, timestamp: Date.now() });
        
        // Also cache the inverse
        rateCache.set(`${to}_${from}`, { rate: 1 / rate, timestamp: Date.now() });

        return rate;
    } catch (error) {
        console.error(`[FXService] Error fetching rate ${from}->${to}:`, error.message);
        // Absolute fallback to mock data
        return (FALLBACK_RATES[to] || 1) / (FALLBACK_RATES[from] || 1);
    }
}

/**
 * Fetch rates from External API
 * Note: Requires EXCHANGERATE_API_KEY in environment
 */
async function fetchRatesFromAPI(base) {
    const apiKey = process.env.EXCHANGERATE_API_KEY;
    
    // If no API key, use fallback immediately to avoid slow timeouts in dev
    if (!apiKey) {
        return FALLBACK_RATES;
    }

    try {
        const response = await axios.get(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/${base}`);
        
        if (response.data && response.data.result === 'success') {
            return response.data.conversion_rates;
        }
        
        throw new Error(response.data['error-type'] || 'API failure');
    } catch (error) {
        console.error('[FXService] API call failed:', error.message);
        throw error;
    }
}

/**
 * Convert an amount from one currency to another
 */
async function convert(amount, from, to) {
    const rate = await getRate(from, to);
    return amount * rate;
}

/**
 * Get all rates for a specific base currency
 */
async function getAllRates(base) {
    try {
        return await fetchRatesFromAPI(base);
    } catch (error) {
        return FALLBACK_RATES;
    }
}

module.exports = {
    getRate,
    convert,
    getAllRates
};
