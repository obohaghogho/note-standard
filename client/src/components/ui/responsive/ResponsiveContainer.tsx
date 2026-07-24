import React from 'react';

export interface ResponsiveContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  useContainerQueries?: boolean;
  withSafeAreaPadding?: boolean;
  className?: string;
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  maxWidth = 'xl',
  useContainerQueries = true,
  withSafeAreaPadding = true,
  className = '',
  style,
  ...rest
}) => {
  const maxWidthClasses = {
    sm: 'max-w-screen-sm',
    md: 'max-w-screen-md',
    lg: 'max-w-screen-lg',
    xl: 'max-w-screen-xl',
    '2xl': 'max-w-screen-2xl',
    full: 'max-w-full',
  }[maxWidth];

  return (
    <div
      className={`w-full mx-auto px-4 sm:px-6 lg:px-8 ${maxWidthClasses} ${
        useContainerQueries ? 'responsive-container-root' : ''
      } ${className}`}
      style={{
        paddingBottom: withSafeAreaPadding ? 'var(--safe-bottom, 0px)' : undefined,
        paddingTop: withSafeAreaPadding ? 'var(--safe-top, 0px)' : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};
