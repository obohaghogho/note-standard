import React from 'react';
import { Send, Download, ArrowRightLeft, ArrowUpRight, CreditCard } from 'lucide-react';
import { motion } from 'framer-motion';

interface ActionsGridProps {
    onSend: () => void;
    onReceive: () => void;
    onSwap: () => void;
    onWithdraw: () => void;
    onDeposit: () => void;
}

export const ActionsGrid: React.FC<ActionsGridProps> = ({ onSend, onReceive, onSwap, onWithdraw, onDeposit }) => {
    const actions = [
        { label: 'Send', icon: Send, onClick: onSend, color: 'bg-blue-500', delay: 0 },
        { label: 'Receive', icon: Download, onClick: onReceive, color: 'bg-green-500', delay: 0.1 },
        { label: 'Swap', icon: ArrowRightLeft, onClick: onSwap, color: 'bg-purple-500', delay: 0.2 },
        { label: 'Withdraw', icon: ArrowUpRight, onClick: onWithdraw, color: 'bg-orange-500', delay: 0.3 },
        { label: 'Deposit', icon: CreditCard, onClick: onDeposit, color: 'bg-pink-500', delay: 0.4 },
    ];

    return (
        <div className="flex flex-wrap justify-center gap-3 sm:gap-6 w-full">


            {actions.map((action) => (
                <motion.button
                    key={action.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: action.delay }}
                    onClick={action.onClick}
                    className="flex flex-col items-center gap-2 group"
                >
                    <div className={`p-3 sm:p-4 rounded-xl ${action.color} bg-opacity-10 text-white group-hover:scale-105 transition-transform duration-200 relative overflow-hidden shadow-lg border border-white/5`}>
                         <div className={`absolute inset-0 ${action.color} opacity-20`} />
                        <action.icon size={22} className="relative z-10" />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{action.label}</span>
                </motion.button>
            ))}
        </div>
    );
};
