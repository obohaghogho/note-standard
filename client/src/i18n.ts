import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import zh from './locales/zh.json';
import ro from './locales/ro.json';
import de from './locales/de.json';
import it from './locales/it.json';
import pt from './locales/pt.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ru from './locales/ru.json';
import ar from './locales/ar.json';

const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'zh', 'ro', 'de', 'it', 'pt', 'ja', 'ko', 'ru', 'ar'];

// Country Code to Supported Language Mapping
const COUNTRY_TO_LANG_MAP: Record<string, string> = {
    // French speaking countries
    FR: 'fr', BE: 'fr', MC: 'fr', CD: 'fr', CI: 'fr', SN: 'fr', CM: 'fr', BF: 'fr', NE: 'fr', MG: 'fr', ML: 'fr', GA: 'fr', CG: 'fr',
    // Spanish speaking countries
    ES: 'es', MX: 'es', CO: 'es', AR: 'es', PE: 'es', CL: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es',
    // German speaking countries
    DE: 'de', AT: 'de', CH: 'de', LI: 'de', LU: 'de',
    // Chinese speaking countries
    CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh',
    // Japanese speaking countries
    JP: 'ja',
    // Korean speaking countries
    KR: 'ko',
    // Portuguese speaking countries
    BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt',
    // Italian speaking countries
    IT: 'it', SM: 'it', VA: 'it',
    // Russian speaking countries
    RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
    // Arabic speaking countries
    SA: 'ar', AE: 'ar', EG: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar', IQ: 'ar', JO: 'ar', KW: 'ar', QA: 'ar', OM: 'ar', BH: 'ar', LY: 'ar', SD: 'ar', YE: 'ar',
    // Romanian speaking countries
    RO: 'ro', MD: 'ro'
};

/**
 * Detect initial language based on:
 * 1. Saved localStorage choice (user manual preference)
 * 2. Browser Geographic Locale (navigator.language)
 * 3. Default fallback to 'en'
 */
const detectInitialLanguage = (): string => {
    if (typeof window === 'undefined') return 'en';
    
    // 1. If user previously manually picked a language, use that
    const saved = localStorage.getItem('i18nextLng');
    if (saved && SUPPORTED_LANGUAGES.includes(saved.split('-')[0])) {
        return saved.split('-')[0];
    }

    // 2. Detect from browser geographic locale (e.g. fr-FR -> fr)
    const browserLocales = navigator.languages ? [...navigator.languages] : [navigator.language];
    for (const locale of browserLocales) {
        if (!locale) continue;
        const code = locale.split('-')[0].toLowerCase();
        if (SUPPORTED_LANGUAGES.includes(code)) {
            return code;
        }
    }

    return 'en';
};

const initialLang = detectInitialLanguage();

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            es: { translation: es },
            fr: { translation: fr },
            zh: { translation: zh },
            ro: { translation: ro },
            de: { translation: de },
            it: { translation: it },
            pt: { translation: pt },
            ja: { translation: ja },
            ko: { translation: ko },
            ru: { translation: ru },
            ar: { translation: ar },
        },
        fallbackLng: 'en',
        lng: initialLang,
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'i18nextLng',
        },
    });

// 3. Async Location (GeoIP) Detection for first-time access
if (typeof window !== 'undefined' && !localStorage.getItem('i18nextLng')) {
    fetch('https://ipapi.co/json/')
        .then(res => res.json())
        .then(data => {
            if (data && data.country_code) {
                const countryCode = data.country_code.toUpperCase();
                const matchedLang = COUNTRY_TO_LANG_MAP[countryCode];
                if (matchedLang && matchedLang !== i18n.language && !localStorage.getItem('i18nextLng')) {
                    i18n.changeLanguage(matchedLang);
                }
            }
        })
        .catch(() => {
            // Silently fall back to navigator / default if GeoIP request fails
        });
}

// Automatically set document direction (RTL/LTR) and lang attribute when active language changes
i18n.on('languageChanged', (lng: string) => {
    if (typeof document !== 'undefined') {
        const lang = (lng || 'en').split('-')[0];
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;
    }
});

export default i18n;
