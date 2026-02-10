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
            <div className="relative w-full max-w-3xl max-h-[90vh] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-white/10">
                    <h2 className="text-2xl font-bold">Terms & Conditions</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                        aria-label="Close modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] space-y-6">
                    <div className="prose prose-invert max-w-none">
                        <p className="text-gray-300 leading-relaxed">
                            By signing up, you agree to the following:
                        </p>

                        <h3 className="text-xl font-semibold text-white mt-6 mb-3">Community Guidelines</h3>
                        <ul className="list-disc list-inside space-y-2 text-gray-300">
                            <li>No abusive, offensive, or harmful language/behavior is allowed.</li>
                            <li>Violations may result in suspension or banning.</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-white mt-6 mb-3">Data Usage Consent</h3>
                        <ul className="list-disc list-inside space-y-2 text-gray-300">
                            <li>Your anonymized, aggregated data may be used to improve services and generate revenue (e.g., ads, analytics).</li>
                            <li>Personal data (email, name) will NOT be sold but may be used for targeted features.</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-white mt-6 mb-3">Account Responsibilities</h3>
                        <ul className="list-disc list-inside space-y-2 text-gray-300">
                            <li>Secure your login credentials; you're accountable for account activity.</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-white mt-6 mb-3">Termination Rights</h3>
                        <ul className="list-disc list-inside space-y-2 text-gray-300">
                            <li>We reserve the right to remove accounts violating these terms.</li>
                        </ul>

                        <div className="mt-8 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                            <p className="text-sm text-gray-300">
                                By checking the agreement box and creating an account, you acknowledge that you have read,
                                understood, and agree to be bound by these Terms & Conditions and our Privacy Policy.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                {showAcceptButton && (
                    <div className="sticky bottom-0 p-6 bg-[#0a0a0a]/95 backdrop-blur-sm border-t border-white/10">
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
