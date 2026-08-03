import React, { useState, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void> | void;
    children: React.ReactNode;
    disabled?: boolean;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
    onRefresh,
    children,
    disabled = false
}) => {
    const [startY, setStartY] = useState<number | null>(null);
    const [pullDistance, setPullDistance] = useState<number>(0);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const PULL_THRESHOLD = 70;

    const handleTouchStart = (e: React.TouchEvent) => {
        if (disabled || refreshing) return;
        // Only trigger if container is scrolled to top
        if (containerRef.current && containerRef.current.scrollTop === 0) {
            setStartY(e.touches[0].clientY);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (startY === null || disabled || refreshing) return;
        const currentY = e.touches[0].clientY;
        const distance = currentY - startY;
        if (distance > 0) {
            setPullDistance(Math.min(distance * 0.5, PULL_THRESHOLD + 20));
        }
    };

    const handleTouchEnd = async () => {
        if (startY === null || disabled || refreshing) return;
        if (pullDistance >= PULL_THRESHOLD) {
            setRefreshing(true);
            try {
                await onRefresh();
            } finally {
                setRefreshing(false);
            }
        }
        setStartY(null);
        setPullDistance(0);
    };

    return (
        <div 
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative w-full h-full flex flex-col flex-1 overflow-y-auto"
        >
            {(pullDistance > 0 || refreshing) && (
                <div 
                    className="w-full flex items-center justify-center py-2 text-indigo-400 text-xs gap-2 transition-all"
                    style={{ height: `${refreshing ? 48 : pullDistance}px`, opacity: pullDistance / PULL_THRESHOLD }}
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    <span>{refreshing ? 'Refreshing data...' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
                </div>
            )}
            {children}
        </div>
    );
};

export default PullToRefresh;
