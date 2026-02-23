import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
    { code: 'ar', name: 'Arabic', flag: '🇸🇦', native: 'العربية', dir: 'rtl' },
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
            
            // Prevent layout shift
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
            // Optional: for some apps, a full reload ensures all translations are picked up
            // window.location.reload(); 
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
            y: '100dvh', // Start completely off-screen at the bottom
            opacity: 0,
        },
        visible: { 
            y: 0, 
            opacity: 1,
            transition: { 
                type: 'spring', 
                damping: 30, 
                stiffness: 350,
                mass: 0.8
            }
        },
        exit: {
            y: '100dvh',
            opacity: 0,
            transition: {
                duration: 0.2,
                ease: 'easeIn'
            }
        }
    };

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <div 
                    className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0"
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
                        className="fixed inset-0 bg-black/80 backdrop-blur-md"
                    />

                    {/* Modal Content - Container for Mobile Bottom Sheet and Desktop Center Modal */}
                    <motion.div
                        ref={containerRef}
                        variants={modalVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="relative w-full sm:max-w-[480px] sm:mx-4 bg-[#0a0a0a] border-t sm:border border-white/10 rounded-t-[32px] sm:rounded-[24px] shadow-2xl overflow-hidden z-20 flex flex-col max-h-[92dvh] sm:max-h-[85dvh]"
                    >
                        {/* Interactive Pull Indicator for Mobile */}
                        <div className="sm:hidden w-full flex justify-center pt-4 pb-2 shrink-0 cursor-grab active:cursor-grabbing">
                            <div className="w-14 h-1.5 bg-white/20 rounded-full" />
                        </div>

                        {/* Header Section */}
                        <div className="px-6 py-6 sm:py-7 border-b border-white/5 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center text-primary shadow-inner">
                                    <Globe size={24} />
                                </div>
                                <div className="flex flex-col">
                                    <h2 id="language-modal-title" className="text-xl font-bold text-white tracking-tight leading-none mb-1.5">
                                        {t('common.language')}
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                        <span className="text-[11px] text-gray-500 font-bold uppercase tracking-[0.1em]">
                                            {ALL_LANGUAGES.length} {t('common.available_languages', 'Available')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-90 border border-white/5"
                                aria-label="Close modal"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        {/* Search Control */}
                        <div className="px-6 py-5 shrink-0 bg-white/[0.02]">
                            <div className="relative group">
                                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder={t('common.search_language', 'Search language...')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl h-[56px] pl-12 pr-5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all text-base"
                                />
                            </div>
                        </div>

                        {/* Language List - Optimized for mobile touch and desktop scroll */}
                        <div 
                            className="flex-1 overflow-y-auto px-4 pb-8 pt-2 scroll-smooth custom-scrollbar-visible overscroll-contain"
                            style={{ 
                                scrollbarWidth: 'thin',
                                scrollbarColor: 'rgba(255,255,255,0.2) transparent'
                            }}
                        >
                            <div className="grid gap-2">
                                {filteredLanguages.length > 0 ? (
                                    filteredLanguages.map((lang: any) => {
                                        const isActive = currentLang === lang.code;
                                        return (
                                            <button
                                                key={lang.code}
                                                onClick={() => changeLanguage(lang.code)}
                                                dir={lang.dir || 'ltr'}
                                                className={`
                                                    group w-full flex items-center justify-between px-4 py-4 rounded-2xl transition-all duration-300 relative overflow-hidden
                                                    ${isActive 
                                                        ? 'bg-primary/10 text-white ring-1 ring-primary/40' 
                                                        : 'hover:bg-white/[0.04] text-gray-400 hover:text-gray-100'
                                                    }
                                                `}
                                            >
                                                <div className={`flex items-center gap-4 relative z-10 ${lang.dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                                    <span className="text-3xl filter drop-shadow-lg group-hover:scale-110 transition-transform duration-500">
                                                        {lang.flag}
                                                    </span>
                                                    <div className={lang.dir === 'rtl' ? 'text-right' : 'text-left'}>
                                                        <div className={`font-bold text-base leading-none mb-1.5 ${isActive ? 'text-primary' : 'text-gray-200'}`}>
                                                            {lang.native}
                                                        </div>
                                                        <div className="text-[12px] opacity-40 uppercase tracking-widest leading-none font-bold">
                                                            {lang.name}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {isActive && (
                                                    <motion.div
                                                        initial={{ scale: 0.5, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30 relative z-10"
                                                    >
                                                        <Check size={16} className="text-white stroke-[4]" />
                                                    </motion.div>
                                                )}

                                                {/* Background hover effect */}
                                                {!isActive && (
                                                    <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
                                                )}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="py-16 text-center">
                                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                                            <Search size={24} className="text-gray-600" />
                                        </div>
                                        <p className="text-gray-500 font-medium">No results for "{searchQuery}"</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer / Info Section */}
                        <div className="px-6 py-5 bg-black/60 border-t border-white/5 text-center shrink-0">
                            <p className="text-[10px] text-gray-600 uppercase tracking-[0.3em] font-black">
                                {t('common.auto_save', 'Preference saved automatically')}
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
};


