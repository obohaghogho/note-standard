import React from 'react';

interface CompactCardSkeletonProps {
    count?: number;
}

export const CompactCardSkeleton: React.FC<CompactCardSkeletonProps> = ({ count = 4 }) => {
    return (
        <div className="space-y-3 w-full animate-pulse">
            {Array.from({ length: count }).map((_, idx) => (
                <div 
                    key={idx} 
                    className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 space-y-3"
                >
                    <div className="flex items-center justify-between">
                        <div className="h-4 w-28 bg-gray-800 rounded-md" />
                        <div className="h-5 w-16 bg-gray-800 rounded-full" />
                    </div>
                    <div className="space-y-2 pt-1">
                        <div className="h-3 w-3/4 bg-gray-800/70 rounded" />
                        <div className="h-3 w-1/2 bg-gray-800/50 rounded" />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-800/40">
                        <div className="h-3 w-20 bg-gray-800/50 rounded" />
                        <div className="h-7 w-20 bg-gray-800/80 rounded-lg" />
                    </div>
                </div>
            ))}
        </div>
    );
};

export default CompactCardSkeleton;
