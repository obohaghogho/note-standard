import React from 'react';
import { cn } from '../../utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'glass' | 'outline';
    hoverEffect?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ className, variant = 'default', hoverEffect = false, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    'rounded-xl transition-all duration-300',
                    {
                        'bg-card text-card-foreground border border-white/5': variant === 'default',
                        'bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl': variant === 'glass',
                        'bg-transparent border border-white/10': variant === 'outline',
                        'hover:bg-white/10 hover:border-white/20 hover:scale-[1.01] hover:shadow-2xl': hoverEffect,
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
