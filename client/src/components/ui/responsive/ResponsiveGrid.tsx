import React from 'react';

export interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  cols?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  gap?: 'sm' | 'md' | 'lg' | 'none';
  useContainerQueries?: boolean;
  className?: string;
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  cols = { xs: 1, sm: 2, md: 3, lg: 4 },
  gap = 'md',
  useContainerQueries = true,
  className = '',
  style,
  ...rest
}) => {
  const gapClass = {
    none: 'gap-0',
    sm: 'gap-2 md:gap-3',
    md: 'gap-4 md:gap-6',
    lg: 'gap-6 md:gap-8',
  }[gap];

  const gridColsClass = `grid-cols-${cols.xs || 1} sm:grid-cols-${cols.sm || cols.xs || 2} md:grid-cols-${cols.md || cols.sm || 3} lg:grid-cols-${cols.lg || cols.md || 4} xl:grid-cols-${cols.xl || cols.lg || 4}`;

  return (
    <div
      className={`grid ${gridColsClass} ${gapClass} ${
        useContainerQueries ? 'responsive-container-root' : ''
      } ${className}`}
      style={{
        gap: gap !== 'none' ? 'var(--density-gap-base, 16px)' : 0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};
