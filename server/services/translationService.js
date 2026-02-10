const translate = require('google-translate-api-x');

// Cache translations in memory to reduce API calls (LRU-like could be added locally or use Redis in prod)
const translationCache = new Map();

/**
 * Detects language of the text
 * @param {string} text 
 * @returns {Promise<string>} language code
 */
exports.detectLanguage = async (text) => {
    try {
        if (!text || text.trim().length === 0) return 'en';
        const res = await translate(text, { to: 'en' }); // Target doesn't matter for detection
        return res.from.language.iso;
    } catch (error) {
        console.error('Language detection failed:', error);
        return 'en'; // Fallback
    }
};

/**
 * Translates text to target language
 * @param {string} text 
 * @param {string} targetLang 
 * @param {string} sourceLang (Optional optimization)
 * @returns {Promise<string>} translated text
 */
exports.translateText = async (text, targetLang, sourceLang = null) => {
    try {
        if (!text) return '';
        if (sourceLang === targetLang) return text;

        const cacheKey = `${text}_${targetLang}`;
        if (translationCache.has(cacheKey)) {
            return translationCache.get(cacheKey);
        }

        // Options for translation
        const options = { to: targetLang };
        if (sourceLang) {
            options.from = sourceLang;
        }

        const res = await translate(text, options);
        const translatedText = res.text;

        // Cache result (simple memory cache, clear periodically if needed)
        if (translationCache.size > 1000) translationCache.clear(); // Simple eviction
        translationCache.set(cacheKey, translatedText);

        return translatedText;
    } catch (error) {
        console.error('Translation failed:', error);
        throw new Error('Translation service unavailable');
    }
};
