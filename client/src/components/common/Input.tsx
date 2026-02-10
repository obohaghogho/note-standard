import React from 'react';
import { cn } from '../../utils/cn';
import type { LucideIcon } from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: LucideIcon;
    fullWidth?: boolean;
    showPasswordToggle?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, icon: Icon, fullWidth = true, showPasswordToggle = false, type, id, name, ...props }, ref) => {
        const [showPassword, setShowPassword] = React.useState(false);
        const generatedId = React.useId();
        const isPasswordField = type === 'password';
        const inputType = isPasswordField && showPassword ? 'text' : type;

        // Generate a unique id if not provided
        const inputId = id || `input-${generatedId}`;
        const inputName = name || inputId;

        return (
            <div className={cn('flex flex-col gap-1.5', { 'w-full': fullWidth })}>
                {label && (
                    <label htmlFor={inputId} className="text-sm font-medium text-gray-300 ml-1">
                        {label}
                    </label>
                )}
                <div className="relative">
                    {Icon && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Icon size={18} />
                        </div>
                    )}
                    <input
                        ref={ref}
                        id={inputId}
                        name={inputName}
                        type={inputType}
                        className={cn(
                            'flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200',
                            {
                                'pl-10': Icon,
                                'pr-10': isPasswordField && showPasswordToggle,
                                'border-red-500/50 focus:ring-red-500/50': error,
                            },
                            className
                        )}
                        {...props}
                    />
                    {isPasswordField && showPasswordToggle && (
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors focus:outline-none"
                            tabIndex={-1}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    )}
                </div>
                {error && (
                    <span className="text-xs text-red-400 ml-1">{error}</span>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';
