import React from 'react';
import { cn } from '../../utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'glass' | 'glass-premium' | 'outline';
    hoverEffect?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ className, variant = 'default', hoverEffect = false, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    'rounded-2xl transition-all duration-300',
                    {
                        'bg-card text-card-foreground border border-white/5': variant === 'default',
                        'bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl': variant === 'glass',
                        'bg-[#0a0a0a]/60 backdrop-blur-3xl border border-white/5 border-t-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]': variant === 'glass-premium',
                        'bg-transparent border border-white/10': variant === 'outline',
                        'hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-2xl': hoverEffect,
                    },
                    className
                )}
                {...props}
            >
                {children}
            </div>
        );
    }
);

Card.displayName = 'Card';
