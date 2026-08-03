import React from 'react';
import { Virtuoso } from 'react-virtuoso';
import EmptyStateCard from './EmptyStateCard';
import CompactCardSkeleton from './CompactCardSkeleton';

interface ResponsiveTableWrapperProps<T> {
    headers: Array<{ key: string; label: string; className?: string }>;
    data: T[];
    renderRow: (item: T, index: number) => React.ReactNode;
    renderCard: (item: T, index: number) => React.ReactNode;
    keyExtractor: (item: T, index: number) => string;
    loading?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
    onEmptyAction?: () => void;
    emptyActionLabel?: string;
    virtualizeThreshold?: number;
    className?: string;
}

export function ResponsiveTableWrapper<T>({
    headers,
    data,
    renderRow,
    renderCard,
    keyExtractor,
    loading = false,
    emptyTitle = 'No data available',
    emptyDescription = 'There are no records to display at this time.',
    onEmptyAction,
    emptyActionLabel,
    virtualizeThreshold = 100,
    className = ''
}: ResponsiveTableWrapperProps<T>) {

    if (loading) {
        return (
            <div className="w-full">
                {/* Desktop skeleton */}
                <div className="hidden lg:block w-full overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                    <div className="space-y-3 animate-pulse">
                        <div className="h-6 bg-gray-800 rounded w-full" />
                        <div className="h-10 bg-gray-800/60 rounded w-full" />
                        <div className="h-10 bg-gray-800/60 rounded w-full" />
                        <div className="h-10 bg-gray-800/60 rounded w-full" />
                    </div>
                </div>
                {/* Mobile skeleton */}
                <div className="lg:hidden">
                    <CompactCardSkeleton count={4} />
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <EmptyStateCard
                title={emptyTitle}
                description={emptyDescription}
                actionLabel={emptyActionLabel}
                onAction={onEmptyAction}
            />
        );
    }

    const shouldVirtualize = data.length >= virtualizeThreshold;

    return (
        <div className={`w-full ${className}`}>
            {/* Desktop Table View (lg: 1024px+) */}
            <div className="hidden lg:block w-full overflow-x-auto rounded-xl border border-gray-800 bg-gray-950/60 shadow-xl">
                <table className="w-full text-left text-sm text-gray-300 border-collapse">
                    <thead>
                        <tr className="border-b border-gray-800 bg-gray-900/70 text-xs uppercase tracking-wider text-gray-400 font-semibold">
                            {headers.map((h) => (
                                <th key={h.key} className={`px-4 py-3.5 ${h.className || ''}`}>
                                    {h.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                        {data.map((item, index) => (
                            <React.Fragment key={keyExtractor(item, index)}>
                                {renderRow(item, index)}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile / Tablet Cards View (<1024px) */}
            <div className="lg:hidden w-full">
                {shouldVirtualize ? (
                    <div className="w-full min-h-[400px]">
                        <Virtuoso
                            style={{ height: '70vh', width: '100%' }}
                            totalCount={data.length}
                            itemContent={(index) => (
                                <div className="pb-3 px-0.5">
                                    {renderCard(data[index], index)}
                                </div>
                            )}
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 max-h-none gap-3">
                        {data.map((item, index) => (
                            <div key={keyExtractor(item, index)} className="w-full">
                                {renderCard(item, index)}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default ResponsiveTableWrapper;
