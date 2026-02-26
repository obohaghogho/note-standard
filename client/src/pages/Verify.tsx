import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { API_URL } from '../lib/api';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

export const Verify = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('Verifying your account...');

    const email = searchParams.get('email');
    const token = searchParams.get('token');

    useEffect(() => {
        if (!email || !token) {
            setStatus('error');
            setMessage('Invalid verification link.');
            return;
        }

        const verifyAccount = async () => {
            try {
                const response = await fetch(`${API_URL}/api/auth/verify-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Verification failed');
                }

                setStatus('success');
                setMessage('Account verified successfully! Redirecting...');

                // Sign in if possible or redirect to login
                toast.success('Email verified! Please sign in.');
                setTimeout(() => navigate('/login'), 2000);

            } catch (err: any) {
                console.error(err);
                setStatus('error');
                setMessage(err.message || 'Verification failed. The link may have expired.');
            }
        };

        verifyAccount();
    }, [email, token, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050505] p-4">
            <Card className="w-full max-w-md p-8 text-center bg-white/[0.02] border-white/10 backdrop-blur-xl">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center"
                >
                    {status === 'loading' && (
                        <>
                            <Loader2 size={48} className="text-primary animate-spin mb-6" />
                            <h2 className="text-2xl font-bold text-white mb-2">Verifying...</h2>
                        </>
                    )}

                    {status === 'success' && (
                        <>
                            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 mb-6">
                                <CheckCircle2 size={40} />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Success!</h2>
                        </>
                    )}

                    {status === 'error' && (
                        <>
                            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mb-6">
                                <XCircle size={40} />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Verification Failed</h2>
                        </>
                    )}

                    <p className="text-gray-400 mb-8">{message}</p>

                    {status !== 'loading' && (
                        <Button 
                            onClick={() => navigate('/login')} 
                            fullWidth
                            className="h-12 font-bold"
                        >
                            <span>Go to Login</span>
                            <ArrowRight size={18} className="ml-2" />
                        </Button>
                    )}
                </motion.div>
            </Card>
        </div>
    );
};
