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
                            <p><strong>Effective Date:</strong> 04/03/2026</p>
                            <p><strong>Company Name:</strong> aghogho plyboard enterprise</p>
                            <p><strong>App Name:</strong> notestandard</p>
                        </div>

                        <h3 className="text-xl font-semibold text-white mt-6 mb-2">1. Introduction</h3>
                        <p className="text-gray-300 mb-2">Welcome to notestandard (“Platform”).</p>
                        <p className="text-gray-300 mb-2">We provide a financial technology platform that enables users to access payment processing and digital asset services through licensed third-party providers.</p>
                        <p className="text-gray-300 mb-2">By using this Platform, you agree to these Terms & Conditions.</p>
                        <p className="text-gray-300">If you do not agree, do not use the Platform.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">2. Nature of Our Services</h3>
                        <p className="text-gray-300 mb-4">notestandard is a technology platform.</p>
                        
                        <div className="text-md font-medium text-white mb-2">We:</div>
                        <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                            <li>Facilitate payment processing through third-party licensed payment providers including Paystack and Flutterwave.</li>
                            <li>Facilitate cryptocurrency services through NOWPayments.</li>
                            <li>Provide a user interface to manage transaction records and balances.</li>
                        </ul>

                        <div className="text-md font-medium text-white mb-2">We DO NOT:</div>
                        <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                            <li>Operate as a bank.</li>
                            <li>Provide banking services.</li>
                            <li>Hold customer deposits as a financial institution.</li>
                            <li>Directly custody cryptocurrency private keys.</li>
                            <li>Offer investment advisory or guaranteed returns.</li>
                        </ul>
                        <p className="font-semibold text-primary">All financial transactions are processed and executed by third-party providers.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">3. Third-Party Payment Processing</h3>
                        <p className="text-gray-300 mb-2">All fiat transactions (card payments, bank transfers, payouts) are processed by regulated third-party providers.</p>
                        <p className="text-gray-300 mb-2">By using the Platform, you also agree to comply with the terms of:</p>
                        <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                            <li>Paystack</li>
                            <li>Flutterwave</li>
                        </ul>
                        <p className="text-gray-300">We are not responsible for delays, chargebacks, reversals, compliance reviews, or restrictions imposed by these providers.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">4. Cryptocurrency Services</h3>
                        <p className="text-gray-300 mb-4">Cryptocurrency transactions, storage, and processing are powered by NOWPayments.</p>
                        
                        <div className="text-md font-medium text-white mb-2">We do not:</div>
                        <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                            <li>Control private keys</li>
                            <li>Directly store cryptocurrency assets</li>
                            <li>Guarantee blockchain confirmation times</li>
                        </ul>

                        <div className="text-md font-medium text-white mb-2">All crypto transactions are subject to:</div>
                        <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                            <li>Blockchain network conditions</li>
                            <li>Fees</li>
                            <li>Volatility</li>
                        </ul>
                        <p className="font-semibold text-red-400">Cryptocurrency transactions are irreversible once confirmed.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">5. No Financial Advice</h3>
                        <p className="text-gray-300 mb-2">The Platform does not provide financial, investment, tax, or legal advice.</p>
                        <p className="text-gray-300">Cryptocurrency prices are volatile. You assume full responsibility for any financial loss.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">6. User Responsibilities</h3>
                        <p className="text-gray-300 mb-2">By using this Platform, you agree:</p>
                        <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                            <li>To provide accurate personal information</li>
                            <li>Not to use the Platform for fraud, money laundering, or illegal activities</li>
                            <li>Not to misuse payment systems</li>
                            <li>To comply with applicable laws</li>
                        </ul>
                        <p className="text-gray-300">We reserve the right to suspend accounts involved in suspicious activity.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">7. KYC & Compliance</h3>
                        <p className="text-gray-300 mb-2">We may request identity verification in compliance with Anti-Money Laundering (AML) regulations.</p>
                        <p className="text-gray-300 mb-2">Failure to provide required documentation may result in:</p>
                        <ul className="list-disc list-inside space-y-2 text-gray-300">
                            <li>Account suspension</li>
                            <li>Transaction delays</li>
                            <li>Permanent restrictions</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">8. Fees</h3>
                        <p className="text-gray-300 mb-2">Transaction fees may apply for:</p>
                        <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                            <li>Deposits</li>
                            <li>Withdrawals</li>
                            <li>Swaps</li>
                            <li>Network processing</li>
                        </ul>
                        <p className="text-gray-300 mb-2">All applicable fees will be displayed before transaction confirmation.</p>
                        <p className="text-gray-300">We reserve the right to adjust fees with notice.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">9. Internal Wallet Ledger</h3>
                        <p className="text-gray-300 mb-2">Displayed balances reflect transaction records based on confirmations received from third-party providers.</p>
                        <p className="text-gray-300">Balances shown are ledger representations and do not constitute a bank deposit.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">10. Limitation of Liability</h3>
                        <p className="text-gray-300 mb-2">We are not liable for:</p>
                        <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                            <li>Loss caused by third-party payment providers</li>
                            <li>Blockchain network failures</li>
                            <li>Delays in transaction confirmations</li>
                            <li>Price volatility losses</li>
                            <li>Government regulatory actions</li>
                        </ul>
                        <p className="text-gray-300">Our maximum liability is limited to the fees paid to us in the 30 days preceding the claim.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">11. Suspension & Termination</h3>
                        <p className="text-gray-300 mb-2">We may suspend or terminate accounts if:</p>
                        <ul className="list-disc list-inside space-y-2 text-gray-300">
                            <li>Fraud is suspected</li>
                            <li>Chargebacks are excessive</li>
                            <li>Legal requests are received</li>
                            <li>Terms are violated</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">12. Risk Disclosure</h3>
                        <p className="text-gray-300 mb-2">Cryptocurrency transactions involve significant risk including:</p>
                        <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                            <li>Price volatility</li>
                            <li>Loss of funds</li>
                            <li>Irreversible blockchain transactions</li>
                        </ul>
                        <p className="font-semibold text-white">By using this Platform, you acknowledge and accept these risks.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">13. Intellectual Property</h3>
                        <p className="text-gray-300 mb-2">All branding, software, and content on this Platform are owned by aghogho plyboard enterprise.</p>
                        <p className="text-gray-300">Unauthorized reproduction is prohibited.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">14. Changes to Terms</h3>
                        <p className="text-gray-300 mb-2">We may update these Terms at any time.</p>
                        <p className="text-gray-300">Continued use of the Platform constitutes acceptance of updated Terms.</p>

                        <h3 className="text-xl font-semibold text-white mt-8 mb-2">15. Governing Law</h3>
                        <p className="text-gray-300">These Terms shall be governed by the laws of the Federal Republic of Nigeria.</p>

                        <div className="mt-8 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                            <h3 className="text-lg font-semibold text-white mt-0 mb-2">16. Contact Information</h3>
                            <div className="space-y-1 text-sm text-gray-300">
                                <p><strong>Company Name:</strong> aghogho plyboard enterprise</p>
                                <p><strong>Email:</strong> admin@notestandard.com</p>
                                <p><strong>Business Address:</strong> 12 udu road delta,nigeria</p>
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
