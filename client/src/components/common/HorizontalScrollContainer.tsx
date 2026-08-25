import React, { useRef, useState, useEffect, ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalScrollContainerProps {
    children: ReactNode;
    className?: string;
    showArrows?: boolean;
    activeItemKey?: string;
}

export const HorizontalScrollContainer: React.FC<HorizontalScrollContainerProps> = ({
    children,
    className = '',
    showArrows = true,
    activeItemKey
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [isMouseDown, setIsMouseDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeftState, setScrollLeftState] = useState(0);

    const updateScrollButtons = () => {
        const el = containerRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    };

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        updateScrollButtons();

        const handleScroll = () => updateScrollButtons();
        el.addEventListener('scroll', handleScroll, { passive: true });
        
        const observer = new ResizeObserver(() => updateScrollButtons());
        observer.observe(el);

        return () => {
            el.removeEventListener('scroll', handleScroll);
            observer.disconnect();
        };
    }, [children]);

    // Scroll active item into view when key changes
    useEffect(() => {
        if (!activeItemKey || !containerRef.current) return;
        const activeElement = containerRef.current.querySelector('[data-active="true"]');
        if (activeElement) {
            activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [activeItemKey]);

    // Convert mouse wheel vertical scroll to horizontal scroll
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        const el = containerRef.current;
        if (!el) return;
        if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
            el.scrollLeft += e.deltaY;
        }
    };

    // Mouse Drag-to-Scroll handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = containerRef.current;
        if (!el) return;
        setIsMouseDown(true);
        setStartX(e.pageX - el.offsetLeft);
        setScrollLeftState(el.scrollLeft);
    };

    const handleMouseLeave = () => {
        setIsMouseDown(false);
    };

    const handleMouseUp = () => {
        setIsMouseDown(false);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isMouseDown) return;
        const el = containerRef.current;
        if (!el) return;
        const x = e.pageX - el.offsetLeft;
        const walk = (x - startX) * 1.5;
        el.scrollLeft = scrollLeftState - walk;
    };

    const scrollBy = (amount: number) => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollBy({ left: amount, behavior: 'smooth' });
    };

    return (
        <div className="relative group/scroll-wrapper w-full my-1">
            {/* Left Chevron Button */}
            {showArrows && canScrollLeft && (
                <button
                    type="button"
                    onClick={() => scrollBy(-180)}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-gray-900/90 border border-purple-500/40 text-purple-300 flex items-center justify-center shadow-lg hover:bg-purple-600 hover:text-white transition-all backdrop-blur-md"
                    aria-label="Scroll Left"
                >
                    <ChevronLeft size={16} />
                </button>
            )}

            {/* Scroll Container */}
            <div
                ref={containerRef}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                className={`flex gap-2 overflow-x-auto pb-2 pt-1 scroll-smooth select-none cursor-grab active:cursor-grabbing custom-scrollbar ${className}`}
                style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(168, 85, 247, 0.4) rgba(31, 41, 55, 0.3)'
                }}
            >
                {children}
            </div>

            {/* Right Chevron Button */}
            {showArrows && canScrollRight && (
                <button
                    type="button"
                    onClick={() => scrollBy(180)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-gray-900/90 border border-purple-500/40 text-purple-300 flex items-center justify-center shadow-lg hover:bg-purple-600 hover:text-white transition-all backdrop-blur-md"
                    aria-label="Scroll Right"
                >
                    <ChevronRight size={16} />
                </button>
            )}
        </div>
    );
};
