import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Bookmark, AlertTriangle, CheckCircle } from 'lucide-react';

interface Flashcard {
  id: string;
  front: string;
  back: string;
  hint?: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface FlashcardDeckProps {
  cards: Flashcard[];
  onRate: (cardId: string, quality: number) => void; // SM-2 quality 0–5
  onComplete: () => void;
}

const QUALITY_LABELS = [
  { q: 1, label: 'Again', color: 'bg-danger text-white', key: '1' },
  { q: 2, label: 'Hard',  color: 'bg-warning text-white', key: '2' },
  { q: 4, label: 'Good',  color: 'bg-success text-white', key: '3' },
  { q: 5, label: 'Easy',  color: 'bg-blue-500 text-white', key: '4' },
];

export const FlashcardDeck: React.FC<FlashcardDeckProps> = ({ cards, onRate, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<'left'|'right'|'up'|'down'|null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  const currentCard = cards[currentIndex];
  const isLastCard = currentIndex === cards.length - 1;

  // ── Keyboard navigation (desktop) ──────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.code) {
        case 'Space':     e.preventDefault(); setIsFlipped(f => !f); break;
        case 'ArrowRight': if (isFlipped) handleRate(5); break;
        case 'ArrowLeft':  if (isFlipped) handleRate(1); break;
        case 'ArrowUp':    if (isFlipped) handleRate(2); break;
        case 'Digit1': if (isFlipped) handleRate(1); break;
        case 'Digit2': if (isFlipped) handleRate(2); break;
        case 'Digit3': if (isFlipped) handleRate(4); break;
        case 'Digit4': if (isFlipped) handleRate(5); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFlipped, currentIndex]);

  // ── Touch / Swipe (mobile) ─────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setSwipeOffset(dx);
      setSwipeDirection(dx > 0 ? 'right' : 'left');
    } else {
      setSwipeDirection(dy > 0 ? 'down' : 'up');
    }
  };

  const onTouchEnd = () => {
    const threshold = 80;
    if (Math.abs(swipeOffset) > threshold && isFlipped) {
      handleRate(swipeDirection === 'right' ? 5 : 1);
    } else if (swipeDirection === 'up' && isFlipped) {
      handleRate(2); // Difficult
    } else if (!isFlipped) {
      setIsFlipped(true);
    }
    setSwipeOffset(0);
    setSwipeDirection(null);
    touchStartRef.current = null;
  };

  const handleRate = useCallback((quality: number) => {
    if (isAnimating) return;
    onRate(currentCard.id, quality);
    setIsAnimating(true);

    setTimeout(() => {
      if (isLastCard) {
        onComplete();
      } else {
        setCurrentIndex(i => i + 1);
        setIsFlipped(false);
        setIsAnimating(false);
      }
    }, 300);
  }, [isAnimating, isLastCard, currentCard, onComplete, onRate]);

  if (!currentCard) return null;

  const swipeHintColor = swipeDirection === 'right'
    ? 'border-success/50 shadow-success/20'
    : swipeDirection === 'left'
    ? 'border-danger/50 shadow-danger/20'
    : 'border-border';

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto select-none">
      {/* Progress */}
      <div className="w-full flex items-center gap-3">
        <span className="text-sm font-medium text-muted">{currentIndex + 1} / {cards.length}</span>
        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${((currentIndex) / cards.length) * 100}%` }}
          />
        </div>
        <span className="text-xs font-medium text-muted capitalize">{currentCard.difficulty}</span>
      </div>

      {/* Card */}
      <div
        className={`w-full cursor-pointer transition-all duration-300 ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
        onClick={() => !isMobile && setIsFlipped(f => !f)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${swipeOffset}px) rotate(${swipeOffset * 0.03}deg)` }}
      >
        <div className={`relative bg-surface border-2 ${swipeHintColor} rounded-card shadow-lg p-8 min-h-64 flex flex-col items-center justify-center text-center gap-4 transition-shadow duration-200`}>
          {/* Swipe indicator */}
          {swipeOffset > 60 && <div className="absolute top-4 left-4 text-success font-bold text-sm flex items-center gap-1"><CheckCircle size={18}/> Correct</div>}
          {swipeOffset < -60 && <div className="absolute top-4 right-4 text-danger font-bold text-sm flex items-center gap-1">Again <RotateCcw size={18}/></div>}

          <div className={`absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full ${isFlipped ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
            {isFlipped ? 'Answer' : 'Question'}
          </div>

          <p className={`text-xl font-semibold transition-all duration-300 ${isFlipped ? 'text-success' : 'text-heading'} leading-relaxed`}>
            {isFlipped ? currentCard.back : currentCard.front}
          </p>

          {!isFlipped && currentCard.hint && (
            <p className="text-sm text-muted italic">{currentCard.hint}</p>
          )}

          {!isFlipped && (
            <button onClick={(e) => { e.stopPropagation(); setIsFlipped(true); }}
              className="mt-4 text-sm text-primary font-medium hover:underline">
              {isMobile ? 'Tap to reveal' : 'Press Space to flip'}
            </button>
          )}
        </div>
      </div>

      {/* Rating buttons (shown after flip) */}
      {isFlipped && (
        <div className="flex gap-3 w-full animate-fade-in">
          {QUALITY_LABELS.map(({ q, label, color, key }) => (
            <button key={q} onClick={() => handleRate(q)}
              className={`flex-1 py-3 rounded-button font-bold text-sm ${color} hover:opacity-90 transition-opacity shadow-sm`}>
              {label}
              {!isMobile && <span className="block text-xs font-normal opacity-70">[{key}]</span>}
            </button>
          ))}
        </div>
      )}

      {/* Desktop hints */}
      {!isMobile && (
        <p className="text-xs text-muted text-center">
          <kbd className="bg-elevated border border-border rounded px-1.5 py-0.5 mx-0.5">Space</kbd> flip
          · <kbd className="bg-elevated border border-border rounded px-1.5 py-0.5 mx-0.5">1–4</kbd> rate
          · <kbd className="bg-elevated border border-border rounded px-1.5 py-0.5 mx-0.5">←→</kbd> again/easy
        </p>
      )}
    </div>
  );
};
