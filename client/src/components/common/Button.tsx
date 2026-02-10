import React from 'react';
import { cn } from '../../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    fullWidth?: boolean;
    loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', fullWidth = false, loading = false, children, disabled, ...props }, ref) => {
        return (
            <button
                ref={ref}
                disabled={disabled || loading}
                className={cn(
                    'relative inline-flex items-center justify-center rounded-lg font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2',
                    {
                        // Variants
                        'bg-primary text-white hover:bg-primary/90 focus:ring-primary/50 shadow-lg shadow-primary/20': variant === 'primary',
                        'bg-white/10 text-white hover:bg-white/20 backdrop-blur-md border border-white/10 focus:ring-white/50': variant === 'secondary',
                        'bg-transparent border border-white/20 text-white hover:bg-white/10 hover:border-white/30 focus:ring-white/50': variant === 'outline',
                        'bg-transparent text-white/70 hover:text-white hover:bg-white/5': variant === 'ghost',
                        'bg-red-500/80 text-white hover:bg-red-600/90 focus:ring-red-500/50': variant === 'danger',

                        // Sizes
                        'text-xs px-3 py-1.5': size === 'sm',
                        'text-sm px-4 py-2': size === 'md',
                        'text-base px-6 py-3': size === 'lg',

                        // Width
                        'w-full': fullWidth,

                        // State
                        'opacity-50 cursor-not-allowed': disabled || loading,
                    },
                    className
                )}
                {...props}
            >
                {loading && (
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    </span>
                )}
                <span className={cn('flex items-center justify-center gap-2', { 'opacity-0': loading })}>{children}</span>
            </button>
        );
    }
);

Button.displayName = 'Button';
