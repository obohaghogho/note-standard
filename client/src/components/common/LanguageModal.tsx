import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, Globe, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';

// Only including languages that have translation files and are registered in i18n.ts
const ALL_LANGUAGES = [
    { code: 'en', name: 'English', flag: '🇺🇸', native: 'English' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸', native: 'Español' },
    { code: 'fr', name: 'French', flag: '🇫🇷', native: 'Français' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳', native: '中文' },
    { code: 'ro', name: 'Romanian', flag: '🇷🇴', native: 'Română' },
    { code: 'de', name: 'German', flag: '🇩🇪', native: 'Deutsch' },
    { code: 'it', name: 'Italian', flag: '🇮🇹', native: 'Italiano' },
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹', native: 'Português' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵', native: '日本語' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷', native: '한국어' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺', native: 'Русский' },
];

interface LanguageModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LanguageModal: React.FC<LanguageModalProps> = ({ isOpen, onClose }) => {
    const { i18n, t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Get the base language code (e.g., 'en' from 'en-US')
    const currentLang = i18n.language?.split('-')[0] || 'en';

    // Filter languages based on search
    const filteredLanguages = useMemo(() => {
        return ALL_LANGUAGES.filter(lang => 
            lang.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            lang.native.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lang.code.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery]);

    // Close on ESC and handle body scroll
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        
        if (isOpen) {
            window.addEventListener('keydown', handleEsc);
            document.body.style.overflow = 'hidden';
            // Use a simpler approach for scrollbar padding
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            if (scrollbarWidth > 0) {
                document.body.style.paddingRight = `${scrollbarWidth}px`;
            }
        } else {
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }

        return () => {
            window.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        };
    }, [isOpen, onClose]);

    const changeLanguage = async (lng: string) => {
        try {
            await i18n.changeLanguage(lng);
            localStorage.setItem('i18nextLng', lng);
            onClose();
        } catch (error) {
            console.error('Failed to change language:', error);
        }
    };

    // Animation variants
    const overlayVariants: Variants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
    };

    const modalVariants: Variants = {
        hidden: { 
            y: '20%', 
            opacity: 0,
            scale: 0.95,
        },
        visible: { 
            y: 0, 
            opacity: 1,
            scale: 1,
            transition: { 
                type: 'spring', 
                damping: 25, 
                stiffness: 400,
                mass: 0.8
            }
        },
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div 
                    className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="language-modal-title"
                >
                    {/* Backdrop */}
                    <motion.div
                        variants={overlayVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        onClick={onClose}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        ref={containerRef}
                        variants={modalVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        className="relative w-full sm:max-w-[440px] bg-[#0d0d0d] border border-white/10 rounded-t-[24px] sm:rounded-[24px] shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90dvh] sm:max-h-[85dvh]"
                    >
                        {/* Pull Bar for Mobile */}
                        <div className="sm:hidden w-full flex justify-center pt-3 pb-1 shrink-0">
                            <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                    <Globe size={20} />
                                </div>
                                <div className="flex flex-col">
                                    <h2 id="language-modal-title" className="text-lg font-bold text-white leading-tight">
                                        {t('common.language')}
                                    </h2>
                                    <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">
                                        {ALL_LANGUAGES.length} {t('common.available_languages', 'Available')}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all active:scale-95"
                                aria-label="Close modal"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="px-6 py-4 shrink-0">
                            <div className="relative">
                                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder={t('common.search_language', 'Search language...')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl h-[44px] pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all text-sm"
                                />
                            </div>
                        </div>

                        {/* Language List */}
                        <div className="flex-1 overflow-y-auto px-3 pb-6 scroll-smooth custom-scrollbar">
                            <div className="grid gap-1">
                                {filteredLanguages.length > 0 ? (
                                    filteredLanguages.map((lang) => {
                                        const isActive = currentLang === lang.code;
                                        return (
                                            <button
                                                key={lang.code}
                                                onClick={() => changeLanguage(lang.code)}
                                                className={`
                                                    group w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-200
                                                    ${isActive 
                                                        ? 'bg-primary/10 text-white ring-1 ring-primary/30' 
                                                        : 'hover:bg-white/5 text-gray-400 hover:text-gray-200'
                                                    }
                                                `}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xl filter group-hover:scale-110 transition-transform duration-300">
                                                        {lang.flag}
                                                    </span>
                                                    <div className="text-left">
                                                        <div className={`font-semibold text-[14px] ${isActive ? 'text-primary' : 'text-gray-200'}`}>
                                                            {lang.native}
                                                        </div>
                                                        <div className="text-[10px] opacity-40 uppercase tracking-widest leading-none mt-0.5 font-medium">
                                                            {lang.name}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {isActive && (
                                                    <motion.div
                                                        initial={{ scale: 0.5, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20"
                                                    >
                                                        <Check size={12} className="text-white stroke-[3]" />
                                                    </motion.div>
                                                )}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="py-12 text-center text-gray-500">
                                        <p className="text-sm">No languages found</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-[#080808] border-t border-white/5 text-center shrink-0">
                            <p className="text-[9px] text-gray-600 uppercase tracking-[0.2em] font-bold">
                                {t('common.auto_save', 'Auto-saved')}
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

