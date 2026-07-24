import React from 'react';

export interface ResponsiveCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  interactive?: boolean;
  glass?: boolean;
  className?: string;
}

export const ResponsiveCard: React.FC<ResponsiveCardProps> = ({
  children,
  interactive = false,
  glass = true,
  className = '',
  style,
  ...rest
}) => {
  return (
    <div
      className={`responsive-container-root rounded-2xl md:rounded-3xl border border-white/10 ${
        glass ? 'bg-gray-900/50 backdrop-blur-xl' : 'bg-gray-900'
      } ${
        interactive ? 'hover:border-white/20 transition-all duration-200 cursor-pointer active:scale-[0.99]' : ''
      } ${className}`}
      style={{
        padding: 'var(--density-padding-base, 16px)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};
