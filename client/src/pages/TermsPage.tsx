import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card } from '../components/common/Card';

export const TermsPage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-[100dvh] bg-[#0a0a0a] p-4 md:p-8 relative overflow-hidden w-full max-w-full">
            {/* Background gradients */}
            <div className="absolute top-0 right-1/4 w-full max-w-[1000px] h-[600px] bg-primary/10 rounded-full blur-[120px] -z-10" />
            <div className="absolute bottom-0 left-1/4 w-full max-w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-[100px] -z-10" />

            <div className="max-w-4xl mx-auto">
                <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </button>

                <Card variant="glass" className="p-8 md:p-12">
                    <h1 className="text-4xl font-bold mb-4">TERMS & CONDITIONS</h1>
                    
                    <div className="mb-8 text-gray-400 text-sm space-y-1">
                        <p><strong>Effective Date:</strong> 04/03/2026</p>
                        <p><strong>Company Name:</strong> aghogho plyboard enterprise</p>
                        <p><strong>App Name:</strong> notestandard</p>
                    </div>

                    <div className="space-y-8 text-gray-300">
                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">1. Introduction</h2>
                            <p className="mb-2">Welcome to notestandard (“Platform”).</p>
                            <p className="mb-2">We provide a financial technology platform that enables users to access payment processing and digital asset services through licensed third-party providers.</p>
                            <p className="mb-2">By using this Platform, you agree to these Terms & Conditions.</p>
                            <p>If you do not agree, do not use the Platform.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">2. Nature of Our Services</h2>
                            <p className="mb-4">notestandard is a technology platform.</p>
                            
                            <h3 className="text-lg font-medium text-white mb-2">We:</h3>
                            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                                <li>Facilitate payment processing through third-party licensed payment providers including Paystack and Flutterwave.</li>
                                <li>Facilitate cryptocurrency services through NOWPayments.</li>
                                <li>Provide a user interface to manage transaction records and balances.</li>
                            </ul>

                            <h3 className="text-lg font-medium text-white mb-2">We DO NOT:</h3>
                            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                                <li>Operate as a bank.</li>
                                <li>Provide banking services.</li>
                                <li>Hold customer deposits as a financial institution.</li>
                                <li>Directly custody cryptocurrency private keys.</li>
                                <li>Offer investment advisory or guaranteed returns.</li>
                            </ul>
                            <p className="font-semibold text-primary">All financial transactions are processed and executed by third-party providers.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">3. Third-Party Payment Processing</h2>
                            <p className="mb-2">All fiat transactions (card payments, bank transfers, payouts) are processed by regulated third-party providers.</p>
                            <p className="mb-2">By using the Platform, you also agree to comply with the terms of:</p>
                            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                                <li>Paystack</li>
                                <li>Flutterwave</li>
                            </ul>
                            <p>We are not responsible for delays, chargebacks, reversals, compliance reviews, or restrictions imposed by these providers.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">4. Cryptocurrency Services</h2>
                            <p className="mb-4">Cryptocurrency transactions, storage, and processing are powered by NOWPayments.</p>
                            
                            <h3 className="text-lg font-medium text-white mb-2">We do not:</h3>
                            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                                <li>Control private keys</li>
                                <li>Directly store cryptocurrency assets</li>
                                <li>Guarantee blockchain confirmation times</li>
                            </ul>

                            <h3 className="text-lg font-medium text-white mb-2">All crypto transactions are subject to:</h3>
                            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                                <li>Blockchain network conditions</li>
                                <li>Fees</li>
                                <li>Volatility</li>
                            </ul>
                            <p className="font-semibold text-red-400">Cryptocurrency transactions are irreversible once confirmed.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">5. No Financial Advice</h2>
                            <p className="mb-2">The Platform does not provide financial, investment, tax, or legal advice.</p>
                            <p>Cryptocurrency prices are volatile. You assume full responsibility for any financial loss.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">6. User Responsibilities</h2>
                            <p className="mb-2">By using this Platform, you agree:</p>
                            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                                <li>To provide accurate personal information</li>
                                <li>Not to use the Platform for fraud, money laundering, or illegal activities</li>
                                <li>Not to misuse payment systems</li>
                                <li>To comply with applicable laws</li>
                            </ul>
                            <p>We reserve the right to suspend accounts involved in suspicious activity.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">7. KYC & Compliance</h2>
                            <p className="mb-2">We may request identity verification in compliance with Anti-Money Laundering (AML) regulations.</p>
                            <p className="mb-2">Failure to provide required documentation may result in:</p>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li>Account suspension</li>
                                <li>Transaction delays</li>
                                <li>Permanent restrictions</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">8. Fees</h2>
                            <p className="mb-2">Transaction fees may apply for:</p>
                            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                                <li>Deposits</li>
                                <li>Withdrawals</li>
                                <li>Swaps</li>
                                <li>Network processing</li>
                            </ul>
                            <p className="mb-2">All applicable fees will be displayed before transaction confirmation.</p>
                            <p>We reserve the right to adjust fees with notice.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">9. Internal Wallet Ledger</h2>
                            <p className="mb-2">Displayed balances reflect transaction records based on confirmations received from third-party providers.</p>
                            <p>Balances shown are ledger representations and do not constitute a bank deposit.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">10. Limitation of Liability</h2>
                            <p className="mb-2">We are not liable for:</p>
                            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                                <li>Loss caused by third-party payment providers</li>
                                <li>Blockchain network failures</li>
                                <li>Delays in transaction confirmations</li>
                                <li>Price volatility losses</li>
                                <li>Government regulatory actions</li>
                            </ul>
                            <p>Our maximum liability is limited to the fees paid to us in the 30 days preceding the claim.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">11. Suspension & Termination</h2>
                            <p className="mb-2">We may suspend or terminate accounts if:</p>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li>Fraud is suspected</li>
                                <li>Chargebacks are excessive</li>
                                <li>Legal requests are received</li>
                                <li>Terms are violated</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">12. Risk Disclosure</h2>
                            <p className="mb-2">Cryptocurrency transactions involve significant risk including:</p>
                            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                                <li>Price volatility</li>
                                <li>Loss of funds</li>
                                <li>Irreversible blockchain transactions</li>
                            </ul>
                            <p className="font-semibold text-white">By using this Platform, you acknowledge and accept these risks.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">13. Intellectual Property</h2>
                            <p className="mb-2">All branding, software, and content on this Platform are owned by aghogho plyboard enterprise.</p>
                            <p>Unauthorized reproduction is prohibited.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">14. Changes to Terms</h2>
                            <p className="mb-2">We may update these Terms at any time.</p>
                            <p>Continued use of the Platform constitutes acceptance of updated Terms.</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">15. Governing Law</h2>
                            <p>These Terms shall be governed by the laws of the Federal Republic of Nigeria.</p>
                        </div>

                        <div className="pt-8 border-t border-white/10">
                            <h2 className="text-2xl font-semibold text-white mb-4">16. Contact Information</h2>
                            <div className="space-y-2">
                                <p><strong>Company Name:</strong> aghogho plyboard enterprise</p>
                                <p><strong>Email:</strong> admin@notestandard.com</p>
                                <p><strong>Business Address:</strong> 12 udu road delta,nigeria</p>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};
