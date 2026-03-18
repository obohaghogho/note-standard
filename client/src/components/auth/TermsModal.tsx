import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../common/Button';

interface TermsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAccept?: () => void;
    showAcceptButton?: boolean;
}

export const TermsModal: React.FC<TermsModalProps> = ({
    isOpen,
    onClose,
    onAccept,
    showAcceptButton = false
}) => {
    if (!isOpen) return null;

    const handleAccept = () => {
        if (onAccept) {
            onAccept();
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-3xl max-h-[90dvh] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex-none sticky top-0 z-10 flex items-center justify-between p-6 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-white/10">
                    <h2 className="text-2xl font-bold">TERMS & CONDITIONS</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                        aria-label="Close modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 overflow-y-auto space-y-6">
                    <div className="prose prose-invert max-w-none">
                        
                        <div className="mb-6 text-gray-400 text-sm space-y-1">
                            <p><strong>Operated by:</strong> Jude Oboh</p>
                        </div>

                        <h3 className="text-xl font-semibold text-white mt-6 mb-2">1. Acceptance of Terms</h3>
                        <p className="text-gray-300 mb-2">By accessing or using the Note Standard platform, users agree to comply with the terms outlined here.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">2. Description of Service</h3>
                        <p className="text-gray-300 mb-2">Note Standard provides software-based digital tools and applications designed to support online interactions and digital activities.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">3. User Responsibilities</h3>
                        <p className="text-gray-300 mb-2">Users are responsible for ensuring that their use of the platform complies with all applicable laws and regulations.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">4. Modifications</h3>
                        <p className="text-gray-300 mb-2">We reserve the right to update or modify our services and terms when necessary to maintain the quality and security of the platform.</p>

                        <div className="mt-8 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                            <h3 className="text-lg font-semibold text-white mt-0 mb-2">5. Contact Information</h3>
                            <div className="space-y-1 text-sm text-gray-300">
                                <p><strong>Operated by:</strong> Jude Oboh</p>
                                <p><strong>Email:</strong> admin@notestandard.com</p>
                                <p><strong>Business Address:</strong> 12 udu road delta, Nigeria</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                {showAcceptButton && (
                    <div className="flex-none p-6 bg-[#0a0a0a]/95 backdrop-blur-sm border-t border-white/10">
                        <div className="flex gap-4">
                            <Button variant="secondary" onClick={onClose} fullWidth>
                                Cancel
                            </Button>
                            <Button onClick={handleAccept} fullWidth>
                                Accept Terms
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
