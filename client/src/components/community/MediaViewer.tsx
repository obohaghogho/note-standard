import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface Props {
  urls: string[];
  initialIndex?: number;
  onClose: () => void;
}

export const MediaViewer: React.FC<Props> = ({ urls, initialIndex = 0, onClose }) => {
  const [idx, setIdx] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const touchStartX = useRef<number | null>(null);

  const current = urls[idx];
  const isVideo = /\.(mp4|webm|ogg)$/i.test(current);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, urls.length - 1));
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, urls.length]);

  // Reset zoom on slide change
  useEffect(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, [idx]);

  const zoom = useCallback((factor: number) => {
    setScale(s => Math.max(1, Math.min(4, s * factor)));
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return;
    setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStart.current = null;
  };

  // Touch swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff < 0) setIdx(i => Math.min(i + 1, urls.length - 1));
      else setIdx(i => Math.max(i - 1, 0));
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
        aria-label="Close"
      >
        <X size={22} />
      </button>

      {/* Counter */}
      {urls.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm z-10">
          {idx + 1} / {urls.length}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        <button onClick={() => zoom(1.3)} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors" aria-label="Zoom in">
          <ZoomIn size={18} />
        </button>
        <button onClick={() => zoom(0.75)} disabled={scale <= 1} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-30" aria-label="Zoom out">
          <ZoomOut size={18} />
        </button>
        {scale !== 1 && (
          <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors" aria-label="Reset zoom">
            <RotateCcw size={18} />
          </button>
        )}
      </div>

      {/* Prev / Next */}
      {idx > 0 && (
        <button
          onClick={() => setIdx(i => i - 1)}
          className="absolute left-3 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
          aria-label="Previous"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      {idx < urls.length - 1 && (
        <button
          onClick={() => setIdx(i => i + 1)}
          className="absolute right-3 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
          aria-label="Next"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* Media */}
      <div
        className="max-w-full max-h-full overflow-hidden select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {isVideo ? (
          <video
            key={current}
            src={current}
            controls
            autoPlay
            className="max-h-[85vh] max-w-[90vw] rounded-lg"
          />
        ) : (
          <img
            key={current}
            src={current}
            alt={`Media ${idx + 1}`}
            draggable={false}
            style={{
              maxHeight: '85vh',
              maxWidth: '90vw',
              borderRadius: 8,
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease',
            }}
          />
        )}
      </div>

      {/* Thumbnail strip */}
      {urls.length > 1 && (
        <div className="absolute bottom-4 flex gap-2 items-center">
          {urls.map((u, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all ${i === idx ? 'border-white' : 'border-transparent opacity-60 hover:opacity-90'}`}
            >
              <img src={u} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
