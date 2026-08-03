import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxHeight?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    maxHeight = 'max-h-[85vh]'
}) => {
    // Lock body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Keyboard ESC listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm transition-opacity duration-200">
            {/* Backdrop click */}
            <div 
                className="absolute inset-0" 
                onClick={onClose} 
                aria-hidden="true"
            />

            {/* Modal / Sheet Container */}
            <div className={`relative w-full sm:max-w-lg bg-[#0F1220] border-t sm:border border-indigo-500/20 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col ${maxHeight} animate-slideUp z-10 text-gray-100`}>
                
                {/* Mobile Drag Handle */}
                <div className="sm:hidden w-full flex items-center justify-center pt-2.5 pb-1">
                    <div className="w-12 h-1.5 bg-gray-700 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/50">
                    <div className="font-semibold text-base sm:text-lg text-white">
                        {title}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="Close dialog"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="px-4 py-3 border-t border-gray-800 bg-gray-950/60 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BottomSheet;
