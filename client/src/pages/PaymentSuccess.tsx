import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '../components/common/Button';
import toast from 'react-hot-toast';
import walletApi from '../api/walletApi';
import { WalletContext } from '../context/WalletContext';

interface DepositStatus {
    id: string;
    status: string;
    amount: number;
    currency: string;
}

export const PaymentSuccess: React.FC = () => {
    const navigate = useNavigate();
    const walletContext = React.useContext(WalletContext);
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<'loading' | 'success' | 'pending' | 'error'>('loading');
    const [deposit, setDeposit] = useState<DepositStatus | null>(null);

    const reference = searchParams.get('reference');

    useEffect(() => {
        const checkDepositStatus = async () => {
            if (!reference) {
                const storedRef = localStorage.getItem('pendingDepositReference');
                if (!storedRef) {
                    setStatus('error');
                    return;
                }
            }

            const ref = reference || localStorage.getItem('pendingDepositReference');
            if (!ref) {
                setStatus('error');
                return;
            }

            const transactionId = searchParams.get('transaction_id');

            try {
                // Poll using authenticated walletApi instead of raw fetch
                let attempts = 0;
                const maxAttempts = 12; // ~30 seconds total
                let finished = false;

                while (attempts < maxAttempts && !finished) {
                    attempts++;
                    try {
                        const data = await walletApi.proactiveVerifyPayment(ref, transactionId || undefined);
                        setDeposit(data);

                        const upperStatus = (data.status || '').toUpperCase();
                        if (['COMPLETED', 'SUCCESS', 'SUCCESSFUL'].includes(upperStatus)) {
                            setStatus('success');
                            localStorage.removeItem('pendingDepositReference');
                            toast.success('Deposit successful!');
                            if (walletContext) {
                                await walletContext.refresh();
                            }
                            finished = true;
                            // Auto-navigate to wallet after 3 seconds
                            setTimeout(() => navigate('/dashboard/wallet'), 3000);
                        } else if (['FAILED', 'CANCELLED'].includes(upperStatus)) {
                            setStatus('error');
                            localStorage.removeItem('pendingDepositReference');
                            finished = true;
                        } else {
                            // Still pending
                            if (attempts < maxAttempts) {
                                await new Promise(resolve => setTimeout(resolve, 2500));
                            } else {
                                setStatus('pending');
                                finished = true;
                            }
                        }
                    } catch (pollErr) {
                        console.error('Poll attempt error:', pollErr);
                        if (attempts >= maxAttempts) {
                            throw pollErr;
                        }
                        await new Promise(resolve => setTimeout(resolve, 2500));
                    }
                }
            } catch (err) {
                console.error('Status check error:', err);
                setStatus('pending');
            }
        };

        checkDepositStatus();
    }, [reference]);

    const handleGoToWallet = async () => {
        if (walletContext) {
            await walletContext.refresh();
        }
        navigate('/dashboard/wallet');
    };

    return (
        <div className="min-h-[100dvh] bg-[#0a0a0a] flex items-center justify-center p-4 w-full max-w-full overflow-hidden">
            <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
                {status === 'loading' && (
                    <>
                        <Loader2 className="w-16 h-16 text-purple-500 animate-spin mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-white mb-2">Processing Payment</h1>
                        <p className="text-gray-400">Please wait while we confirm your payment...</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-10 h-10 text-green-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
                        {deposit && (
                            <p className="text-gray-400 mb-6">
                                {deposit.amount} {deposit.currency} has been added to your wallet.
                            </p>
                        )}
                        <Button onClick={handleGoToWallet} className="w-full">
                            Go to Wallet <ArrowRight className="ml-2" size={18} />
                        </Button>
                    </>
                )}

                {status === 'pending' && (
                    <>
                        <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Loader2 className="w-10 h-10 text-yellow-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Payment Processing</h1>
                        <p className="text-gray-400 mb-6">
                            Your payment is being processed. Your wallet will be updated shortly.
                        </p>
                        <Button onClick={handleGoToWallet} variant="secondary" className="w-full">
                            Go to Wallet <ArrowRight className="ml-2" size={18} />
                        </Button>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">❌</span>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Something Went Wrong</h1>
                        <p className="text-gray-400 mb-6">
                            We couldn't confirm your payment. If you were charged, please contact support.
                        </p>
                        <Button onClick={handleGoToWallet} variant="secondary" className="w-full">
                            Back to Wallet
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};

export default PaymentSuccess;
