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
];

interface LanguageModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LanguageModal: React.FC<LanguageModalProps> = ({ isOpen, onClose }) => {
    const { i18n, t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

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
            document.body.style.paddingRight = 'var(--scrollbar-width, 0px)'; // Prevent layout shift
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
            y: '100%', 
            opacity: 0,
        },
        visible: { 
            y: 0, 
            opacity: 1,
            transition: { type: 'spring', damping: 25, stiffness: 300 }
        },
        desktopVisible: {
            y: 0,
            scale: 1,
            opacity: 1,
            transition: { type: 'spring', damping: 25, stiffness: 300 }
        },
        desktopHidden: {
            y: 20,
            scale: 0.95,
            opacity: 0,
            transition: { duration: 0.2 }
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div 
                    className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center pointer-events-none"
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
                        className="fixed inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
                    />

                    {/* Modal Content */}
                    <motion.div
                        ref={containerRef}
                        variants={modalVariants}
                        initial="hidden"
                        animate={window.innerWidth >= 640 ? "desktopVisible" : "visible"}
                        exit={window.innerWidth >= 640 ? "desktopHidden" : "hidden"}
                        className="relative w-full sm:max-w-md bg-[#121212] sm:bg-[#1a1a1a]/95 border-t sm:border border-white/10 rounded-t-[24px] sm:rounded-[20px] shadow-2xl overflow-hidden z-10 flex flex-col max-h-[85dvh] sm:max-h-[80dvh] pointer-events-auto"
                    >
                        {/* Pull Bar for Mobile */}
                        <div className="sm:hidden w-full flex justify-center pt-3 pb-1">
                            <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="px-6 pt-4 pb-4 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
                                    <Globe size={22} />
                                </div>
                                <div className="flex flex-col">
                                    <h2 id="language-modal-title" className="text-xl font-bold text-white tracking-tight">
                                        {t('common.language')}
                                    </h2>
                                    <span className="text-xs text-gray-400 font-medium">
                                        {ALL_LANGUAGES.length} {t('common.available_languages', 'Available Languages')}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-90"
                                aria-label="Close modal"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="px-6 py-4">
                            <div className="relative group">
                                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder={t('common.search_language', 'Search language...')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl h-[48px] pl-11 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all text-sm"
                                />
                            </div>
                        </div>

                        {/* Language List */}
                        <div className="flex-1 overflow-y-auto px-4 pb-6 scroll-smooth overscroll-contain no-scrollbar">
                            <div className="grid gap-1.5">
                                {filteredLanguages.length > 0 ? (
                                    filteredLanguages.map((lang) => {
                                        const isActive = i18n.language === lang.code;
                                        return (
                                            <button
                                                key={lang.code}
                                                onClick={() => changeLanguage(lang.code)}
                                                className={`
                                                    group w-full flex items-center justify-between p-3.5 rounded-2xl transition-all duration-200
                                                    ${isActive 
                                                        ? 'bg-primary/15 text-white ring-1 ring-primary/40' 
                                                        : 'hover:bg-white/5 text-gray-400 hover:text-gray-200'
                                                    }
                                                `}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <span className="text-2xl filter group-hover:drop-shadow-sm transition-all duration-300">
                                                        {lang.flag}
                                                    </span>
                                                    <div className="text-left">
                                                        <div className={`font-semibold text-sm ${isActive ? 'text-primary' : ''}`}>
                                                            {lang.native}
                                                        </div>
                                                        <div className="text-[11px] opacity-50 uppercase tracking-widest leading-none mt-1">
                                                            {lang.name}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {isActive && (
                                                    <motion.div
                                                        layoutId="active-check-new"
                                                        initial={{ scale: 0.5, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                                                    >
                                                        <Check size={12} className="text-white stroke-[3]" />
                                                    </motion.div>
                                                )}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="py-12 text-center text-gray-500">
                                        <p className="text-sm">No languages found matching "{searchQuery}"</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Hint */}
                        <div className="px-6 py-4 bg-white/5 border-t border-white/5 text-center">
                            <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold">
                                {t('common.auto_save', 'Changes are saved automatically')}
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
