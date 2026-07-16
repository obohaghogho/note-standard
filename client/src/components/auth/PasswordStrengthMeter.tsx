import React from 'react';
import { cn } from '../../utils/cn';

interface PasswordStrengthMeterProps {
    password: string;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password }) => {
    const getStrength = (pwd: string) => {
        let strength = 0;
        if (pwd.length >= 8) strength++;
        if (/[A-Z]/.test(pwd)) strength++;
        if (/[0-9]/.test(pwd)) strength++;
        if (/[^A-Za-z0-9]/.test(pwd)) strength++;
        return strength;
    };

    const strength = getStrength(password);
    
    const getColor = () => {
        if (strength === 0) return 'bg-gray-700';
        if (strength <= 1) return 'bg-red-500';
        if (strength <= 2) return 'bg-yellow-500';
        if (strength <= 3) return 'bg-blue-500';
        return 'bg-green-500';
    };

    const getLabel = () => {
        if (password.length === 0) return '';
        if (strength <= 1) return 'Weak';
        if (strength <= 2) return 'Fair';
        if (strength <= 3) return 'Good';
        return 'Strong';
    };

    return (
        <div className="mt-2 space-y-2">
            <div className="flex justify-between items-center">
                <div className="flex gap-1 w-full max-w-[200px]">
                    {[1, 2, 3, 4].map((level) => (
                        <div
                            key={level}
                            className={cn(
                                "h-1 flex-1 rounded-full transition-all duration-300",
                                level <= strength ? getColor() : "bg-gray-800"
                            )}
                        />
                    ))}
                </div>
                <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    strength <= 1 ? "text-red-400" : 
                    strength <= 2 ? "text-yellow-400" :
                    strength <= 3 ? "text-blue-400" : "text-green-400"
                )}>
                    {getLabel()}
                </span>
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Requirement met={password.length >= 8} label="8+ characters" />
                <Requirement met={/[A-Z]/.test(password)} label="Uppercase" />
                <Requirement met={/[0-9]/.test(password)} label="Number" />
                <Requirement met={/[^A-Za-z0-9]/.test(password)} label="Special char" />
            </div>
        </div>
    );
};

const Requirement = ({ met, label }: { met: boolean; label: string }) => (
    <div className="flex items-center gap-1.5">
        <div className={cn(
            "w-1 h-1 rounded-full",
            met ? "bg-green-500" : "bg-gray-600"
        )} />
        <span className={cn(
            "text-[10px] transition-colors",
            met ? "text-gray-300" : "text-gray-500"
        )}>
            {label}
        </span>
    </div>
);
