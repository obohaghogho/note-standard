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
                            Welcome to <strong>Note Standard</strong>. We believe in a new internet model where user privacy and 
                            sustainable monetization coexist. By using our services, you agree to these Terms & Conditions.
                        </p>

                        <h3 className="text-xl font-semibold text-white mt-6 mb-2">1. Our Core Principles</h3>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                                <div className="text-primary font-bold mb-1">Transparency</div>
                                <div className="text-xs text-gray-400">Know exactly how your data is used.</div>
                            </div>
                            <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                                <div className="text-primary font-bold mb-1">Control</div>
                                <div className="text-xs text-gray-400">Decide which features you opt into.</div>
                            </div>
                        </div>

                        <h3 className="text-xl font-semibold text-white mt-6 mb-2">2. Community & Usage</h3>
                        <ul className="list-disc list-inside space-y-2 text-gray-300">
                            <li>Keep it professional: No abusive, offensive, or illegal content.</li>
                            <li>Respect others: Do not use our sharing features to harass users.</li>
                            <li>Note Standard reserves the right to terminate accounts that violate these guidelines.</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-white mt-6 mb-2">3. Data Monetization & Privacy</h3>
                        <p className="text-gray-400 text-sm mb-3">Our model prioritizes user agency and anonymous value exchange.</p>
                        <ul className="list-disc list-inside space-y-2 text-gray-300">
                            <li><strong>Contextual Ads</strong>: We serve ads based on the <em>content</em> of your session (e.g., current tags), not your <em>profile</em>. No tracking cookies are used.</li>
                            <li><strong>Anonymized Insights</strong>: We may aggregate high-level usage patterns for productivity research. This data is count-based and anonymized.</li>
                            <li><strong>Affiliate Partnerships</strong>: We may recommend tools that integrate with our app. Interactions are user-initiated.</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-white mt-6 mb-2">4. Financial Services & Wallet</h3>
                        <ul className="list-disc list-inside space-y-2 text-gray-300">
                            <li><strong>Custody</strong>: Note Standard provides managed wallets. While secure, we are not a traditional bank.</li>
                            <li><strong>Fees</strong>: Transfers and withdrawals may incur a service fee (flat fee + percentage spread).</li>
                            <li><strong>Pro/Business Discounts</strong>: Upgraded plans enjoy reduced fees and tighter spreads.</li>
                            <li><strong>Finality</strong>: Once a crypto or internal transfer is confirmed, it cannot be reversed.</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-white mt-6 mb-2">5. Affiliate Program</h3>
                        <ul className="list-disc list-inside space-y-2 text-gray-300">
                            <li><strong>Commissions</strong>: You earn a percentage of the revenue generated by users you refer.</li>
                            <li><strong>Payouts</strong>: Earnings are credited to your system wallet in the currency the revenue was generated in.</li>
                        </ul>

                        <div className="mt-8 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                            <p className="text-sm text-gray-300 italic">
                                "Our mission is to provide premium productivity tools while putting you in control of your data and finances."
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                                By checking the agreement box and creating an account, you acknowledge that you have read,
                                understood, and agree to be bound by these Terms & Conditions.
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
