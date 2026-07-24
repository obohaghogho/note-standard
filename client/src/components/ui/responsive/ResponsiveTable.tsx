import React from 'react';
import { useBreakpoint } from '../../../hooks/useBreakpoint';

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  mobileTitle?: boolean;
}

export interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  emptyState?: React.ReactNode;
  className?: string;
}

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor,
  emptyState = <div className="p-8 text-center text-gray-500 text-sm">No records found.</div>,
  className = '',
}: ResponsiveTableProps<T>) {
  const { isMobile } = useBreakpoint();

  if (data.length === 0) {
    return <div className="w-full bg-gray-900/40 rounded-2xl border border-white/5">{emptyState}</div>;
  }

  // Mobile View: Stacked Cards
  if (isMobile) {
    return (
      <div className={`space-y-3 ${className}`}>
        {data.map((item) => {
          const key = keyExtractor(item);
          const titleCol = columns.find(c => c.mobileTitle) || columns[0];
          const otherCols = columns.filter(c => c !== titleCol);

          return (
            <div key={key} className="bg-gray-900/60 p-4 rounded-2xl border border-white/10 space-y-2">
              {titleCol && (
                <div className="font-bold text-white text-sm border-b border-white/5 pb-2">
                  {titleCol.render(item)}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                {otherCols.map((col) => (
                  <div key={col.key} className="space-y-0.5 min-w-0">
                    <span className="text-[10px] text-gray-500 uppercase font-semibold block truncate">
                      {col.header}
                    </span>
                    <div className="text-gray-300 font-medium truncate">{col.render(item)}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Desktop / Tablet View: Tabular Table
  return (
    <div className={`w-full overflow-x-auto rounded-2xl border border-white/10 bg-gray-900/50 backdrop-blur-xl ${className}`}>
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02]">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {data.map((item) => (
            <tr key={keyExtractor(item)} className="hover:bg-white/[0.02] transition-colors">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-gray-300">
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
