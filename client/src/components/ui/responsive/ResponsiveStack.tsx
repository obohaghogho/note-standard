import React from 'react';

export interface ResponsiveStackProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  direction?: 'row' | 'column' | 'responsive'; // 'responsive' switches column on mobile, row on desktop
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  gap?: 'sm' | 'md' | 'lg' | 'none';
  className?: string;
}

export const ResponsiveStack: React.FC<ResponsiveStackProps> = ({
  children,
  direction = 'responsive',
  align = 'stretch',
  justify = 'start',
  gap = 'md',
  className = '',
  style,
  ...rest
}) => {
  const directionClass = {
    row: 'flex-row',
    column: 'flex-col',
    responsive: 'flex-col sm:flex-row',
  }[direction];

  const alignClass = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch',
  }[align];

  const justifyClass = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
    around: 'justify-around',
  }[justify];

  return (
    <div
      className={`flex ${directionClass} ${alignClass} ${justifyClass} ${className}`}
      style={{
        gap: gap !== 'none' ? 'var(--density-gap-base, 12px)' : 0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};
