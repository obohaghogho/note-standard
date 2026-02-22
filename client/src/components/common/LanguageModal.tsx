import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸', native: 'English' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸', native: 'Español' },
    { code: 'fr', name: 'French', flag: '🇫🇷', native: 'Français' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳', native: '中文' },
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

    // Close on ESC
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEsc);
            // Disable body scroll when modal is open
            document.body.style.overflow = 'hidden';
        }
        return () => {
            window.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    // Focus management
    const firstButtonRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => firstButtonRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="language-modal-title"
                >
                    {/* Glassmorphism Overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-md bg-[#1a1a1a]/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[80vh]"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-primary/20 text-primary">
                                    <Globe size={24} />
                                </div>
                                <div>
                                    <h2 id="language-modal-title" className="text-xl font-bold text-white">
                                        {t('common.language')}
                                    </h2>
                                    <p className="text-xs text-gray-400">Select your preferred language</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                aria-label="Close modal"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Language List */}
                        <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
                            <div className="grid gap-1">
                                {languages.map((lang, index) => {
                                    const isActive = i18n.language === lang.code;
                                    return (
                                        <button
                                            key={lang.code}
                                            ref={index === 0 ? firstButtonRef : null}
                                            onClick={() => changeLanguage(lang.code)}
                                            className={`
                                                group w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-200
                                                ${isActive 
                                                    ? 'bg-primary/20 text-white ring-1 ring-primary/50' 
                                                    : 'hover:bg-white/5 text-gray-400 hover:text-white'
                                                }
                                            `}
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className="text-2xl grayscale group-hover:grayscale-0 transition-all duration-300">
                                                    {lang.flag}
                                                </span>
                                                <div className="text-left">
                                                    <div className="font-semibold text-sm">
                                                        {lang.native}
                                                    </div>
                                                    <div className="text-[10px] opacity-50 uppercase tracking-wider">
                                                        {lang.name}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {isActive && (
                                                <motion.div
                                                    layoutId="active-check"
                                                    initial={{ scale: 0.5, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    className="w-6 h-6 rounded-full bg-primary flex items-center justify-center"
                                                >
                                                    <Check size={14} className="text-white" />
                                                </motion.div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-white/5 border-t border-white/5 text-center px-6">
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">
                                Changes are saved automatically
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
