import React from 'react';

export interface ResponsiveChartProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  aspectRatio?: number; // e.g. 16/9 = 1.77
  minHeight?: number;
  maxHeight?: number;
  className?: string;
}

export const ResponsiveChart: React.FC<ResponsiveChartProps> = ({
  children,
  aspectRatio = 16 / 9,
  minHeight = 220,
  maxHeight = 450,
  className = '',
  style,
  ...rest
}) => {
  return (
    <div
      className={`w-full relative overflow-hidden rounded-2xl bg-gray-900/40 p-4 border border-white/5 ${className}`}
      style={{
        minHeight: `${minHeight}px`,
        maxHeight: `${maxHeight}px`,
        aspectRatio: `${aspectRatio}`,
        ...style,
      }}
      {...rest}
    >
      <div className="w-full h-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
};
