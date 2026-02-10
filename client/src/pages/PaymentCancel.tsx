import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '../components/common/Button';

export const PaymentCancel: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const reference = searchParams.get('reference');

    const handleRetry = () => {
        // Clear any stored reference and go back to wallet
        localStorage.removeItem('pendingDepositReference');
        navigate('/wallet');
    };

    const handleGoBack = () => {
        localStorage.removeItem('pendingDepositReference');
        navigate('/wallet');
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
                <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <XCircle className="w-10 h-10 text-gray-400" />
                </div>
                
                <h1 className="text-2xl font-bold text-white mb-2">Payment Cancelled</h1>
                <p className="text-gray-400 mb-6">
                    Your payment was cancelled. No charges were made to your account.
                </p>

                <div className="space-y-3">
                    <Button onClick={handleRetry} className="w-full">
                        <RefreshCw className="mr-2" size={18} />
                        Try Again
                    </Button>
                    <Button onClick={handleGoBack} variant="ghost" className="w-full">
                        <ArrowLeft className="mr-2" size={18} />
                        Back to Wallet
                    </Button>
                </div>

                {reference && (
                    <p className="text-xs text-gray-500 mt-4">
                        Reference: {reference}
                    </p>
                )}
            </div>
        </div>
    );
};

export default PaymentCancel;
