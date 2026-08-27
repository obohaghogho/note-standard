import React from 'react';

interface StickyActionBarProps {
    children: React.ReactNode;
    className?: string;
}

export const StickyActionBar: React.FC<StickyActionBarProps> = ({
    children,
    className = ''
}) => {
    return (
        <div className={`md:hidden fixed bottom-16 left-0 right-0 z-40 bg-gray-950/95 backdrop-blur-xl border-t border-indigo-500/20 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl transition-all animate-slideUp ${className}`}>
            <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
                {children}
            </div>
        </div>
    );
};

export default StickyActionBar;
