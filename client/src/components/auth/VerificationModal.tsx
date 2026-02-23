import React from 'react';
import { Mail, Phone, ArrowRight, X } from 'lucide-react';
import { Button } from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';

interface VerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    email: string;
    phone: string;
}

export const VerificationModal: React.FC<VerificationModalProps> = ({
    isOpen,
    onClose,
    email,
    phone
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-md"
                    />
                    
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-md bg-[#0d0d0d] border border-white/10 rounded-[28px] shadow-2xl overflow-hidden z-10"
                    >
                        {/* Header */}
                        <div className="p-6 pb-0 flex justify-end">
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-95"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="px-8 pb-8 text-center">
                            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-6 shadow-inner">
                                <Mail size={32} className="animate-bounce" />
                            </div>

                            <h2 className="text-2xl font-bold text-white mb-3">Check your devices</h2>
                            <p className="text-gray-400 mb-8 leading-relaxed">
                                We've sent special verification codes to help keep your account secure. Please check:
                            </p>

                            <div className="space-y-4 mb-8">
                                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 text-left group hover:border-primary/30 transition-all">
                                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
                                        <Mail size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-primary uppercase tracking-widest mb-0.5">Email Inbox</p>
                                        <p className="text-sm text-gray-300 truncate font-medium">{email}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 text-left group hover:border-primary/30 transition-all">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                                        <Phone size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-0.5">Phone Messages</p>
                                        <p className="text-sm text-gray-300 truncate font-medium">{phone}</p>
                                    </div>
                                </div>
                            </div>

                            <Button 
                                onClick={onClose} 
                                fullWidth 
                                className="h-[56px] text-base font-bold rounded-2xl group shadow-lg shadow-primary/20"
                            >
                                <span>I've Received the Codes</span>
                                <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
                            </Button>

                            <p className="mt-6 text-xs text-gray-500 font-medium">
                                Didn't get them? Check your spam folder or wait a few minutes.
                            </p>
                        </div>

                        {/* Visual accent */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-primary" />
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
