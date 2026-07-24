import React, { useEffect } from 'react';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import { X } from 'lucide-react';

export interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const ResponsiveModal: React.FC<ResponsiveModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
  className = '',
}) => {
  const { isMobile } = useBreakpoint();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      {/* Backdrop click dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal / Bottom Sheet Container */}
      <div
        className={`relative z-10 w-full bg-gray-900 border border-white/10 shadow-2xl flex flex-col overflow-hidden ${
          isMobile
            ? 'mt-auto rounded-t-3xl max-h-[90vh] animate-in slide-in-from-bottom duration-300'
            : `rounded-3xl ${maxWidthClass} max-h-[85vh] animate-in zoom-in-95 duration-200`
        } ${className}`}
        style={{
          paddingBottom: isMobile ? 'calc(var(--safe-bottom, 0px) + 16px)' : undefined,
        }}
      >
        {/* Mobile Drag Handle */}
        {isMobile && (
          <div className="w-full flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 rounded-full bg-white/20" />
          </div>
        )}

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/10">
            <h3 className="font-bold text-white text-base md:text-lg truncate">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded-full bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};
