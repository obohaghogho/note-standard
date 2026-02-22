import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
];

export const LanguageSelector = () => {
    const { i18n, t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const currentLanguage = languages.find((lang) => lang.code === i18n.language) || languages[0];

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
        setIsOpen(false);
        // Persist to local storage is handled by i18next-browser-languagedetector plugin
    };

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-3 md:py-2 rounded-lg hover:bg-white/10 transition-colors text-sm text-gray-300 hover:text-white"
                title={t('common.language')}
            >
                <Globe size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="text-[11px] xs:text-sm font-medium uppercase md:capitalize">
                    {currentLanguage.code === 'zh' ? '中文' : currentLanguage.code.toUpperCase()}
                </span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Mobile backdrop to close on tap anywhere else */}
                        <div className="fixed inset-0 z-40 md:hidden bg-black/20" onClick={() => setIsOpen(false)} />
                        
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="absolute right-0 md:right-0 mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 backdrop-blur-xl ring-1 ring-black/50"
                        >
                        <div className="p-1">
                            {languages.map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => changeLanguage(lang.code)}
                                    className="w-full flex items-center justify-between px-4 py-2 text-sm text-left text-gray-300 hover:bg-white/10 hover:text-white rounded-lg transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-base">{lang.flag}</span>
                                        <span>{lang.name}</span>
                                    </div>
                                    {i18n.language === lang.code && (
                                        <Check size={14} className="text-primary" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};
