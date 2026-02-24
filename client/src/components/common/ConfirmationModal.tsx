import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return 'text-red-400 border-red-400/20 bg-red-400/10';
      case 'warning':
        return 'text-yellow-400 border-yellow-400/20 bg-yellow-400/10';
      default:
        return 'text-blue-400 border-blue-400/20 bg-blue-400/10';
    }
  };

  const getButtonVariant = () => {
    return variant === 'danger' ? 'danger' : 'primary';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md"
          >
            <Card className="overflow-hidden border border-white/10 bg-gray-900/90 shadow-2xl backdrop-blur-xl">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-full ${getVariantStyles()}`}>
                    <AlertCircle size={24} />
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1 text-gray-400 transition-colors hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>

                <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
                <p className="text-gray-400 leading-relaxed mb-8">{message}</p>

                <div className="flex items-center gap-3 justify-end">
                  <Button
                    variant="ghost"
                    onClick={onClose}
                    disabled={isLoading}
                  >
                    {cancelText}
                  </Button>
                  <Button
                    variant={getButtonVariant() as any}
                    onClick={onConfirm}
                    loading={isLoading}
                  >
                    {confirmText}
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
