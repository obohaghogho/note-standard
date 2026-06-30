/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState } from 'react';
import { Shuffle, Brain, Clock, Target, ChevronRight, Zap, RotateCcw } from 'lucide-react';
import { FlashcardDeck } from './FlashcardDeck';

type SessionType = 'mixed' | 'due_only' | 'weak_focus' | 'new_only';

const SESSION_TYPES: { id: SessionType; label: string; emoji: string; description: string }[] = [
  { id: 'mixed',      label: 'Mixed Review',  emoji: '🔀', description: 'Overdue + weak topics + new cards' },
  { id: 'due_only',   label: 'Due Today',     emoji: '📅', description: 'Only cards scheduled for today' },
  { id: 'weak_focus', label: 'Weak Topics',   emoji: '🎯', description: 'Focus on what you struggle with' },
  { id: 'new_only',   label: 'Explore New',   emoji: '✨', description: 'Study cards you haven\'t seen yet' },
];

const TIME_BUDGETS = [
  { minutes: 5,  label: '5 min',  cards: 8 },
  { minutes: 15, label: '15 min', cards: 20 },
  { minutes: 30, label: '30 min', cards: 40 },
];

// Demo flashcard data
const DEMO_CARDS = [
  { id: 'p1', front: 'What is the Virtual DOM?', back: 'A lightweight in-memory copy of the real DOM that React uses to compute minimal updates before applying them to the browser.', difficulty: 'easy' as const, source: 'due' },
  { id: 'p2', front: 'Explain the difference between useMemo and useCallback.', back: 'useMemo caches a computed value. useCallback caches a function reference. Both re-compute when their dependencies change.', difficulty: 'medium' as const, source: 'weak' },
  { id: 'p3', front: 'What is a React Concurrent Feature?', back: 'Features like Suspense and useTransition that allow React to interrupt, pause, and resume rendering to keep the UI responsive.', difficulty: 'hard' as const, source: 'new' },
];

interface PracticeSpace { id: string; name: string; [key: string]: unknown; }

export const PracticeMode: React.FC<{ space: PracticeSpace }> = ({ space }) => {
  const [phase, setPhase] = useState<'config' | 'session' | 'results'>('config');
  const [sessionType, setSessionType] = useState<SessionType>('mixed');
  const [timeBudget, setTimeBudget] = useState(TIME_BUDGETS[1]);
  const [cards] = useState(DEMO_CARDS); // In production, fetched from PracticeModeService
  const [ratings, setRatings] = useState<{ id: string; quality: number }[]>([]);
  const [sessionStart] = useState(Date.now());

  const breakdown = {
    due: cards.filter(c => c.source === 'due').length,
    weak: cards.filter(c => c.source === 'weak').length,
    new: cards.filter(c => c.source === 'new').length,
  };

  const handleRate = (cardId: string, quality: number) => {
    setRatings(prev => [...prev, { id: cardId, quality }]);
  };

  const handleComplete = () => {
    setPhase('results');
  };

  if (phase === 'config') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center pb-2">
          <h2 className="text-2xl font-extrabold text-heading flex items-center justify-center gap-2">
            <Shuffle className="text-primary"/> Practice Session
          </h2>
          <p className="text-muted mt-1">Build a custom review session across all your knowledge.</p>
        </div>

        {/* Session Type */}
        <div className="bg-elevated border border-border rounded-card p-5 shadow-sm">
          <h3 className="font-bold text-heading mb-3">Session Type</h3>
          <div className="grid grid-cols-2 gap-3">
            {SESSION_TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => setSessionType(t.id)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  sessionType === t.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-surface hover:border-primary/30'
                }`}
              >
                <div className="text-2xl mb-1">{t.emoji}</div>
                <div className="font-bold text-sm text-heading">{t.label}</div>
                <div className="text-xs text-muted mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Time Budget */}
        <div className="bg-elevated border border-border rounded-card p-5 shadow-sm">
          <h3 className="font-bold text-heading mb-3 flex items-center gap-2"><Clock size={18}/> Available Time</h3>
          <div className="flex gap-3">
            {TIME_BUDGETS.map(b => (
              <button
                key={b.minutes}
                onClick={() => setTimeBudget(b)}
                className={`flex-1 py-3 rounded-button font-bold text-sm border-2 transition-all ${
                  timeBudget.minutes === b.minutes
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-surface text-heading hover:border-primary/50'
                }`}
              >
                {b.label}
                <div className="text-xs font-normal opacity-70">~{b.cards} cards</div>
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="bg-elevated border border-border rounded-card p-5 shadow-sm">
          <h3 className="font-bold text-heading mb-3 flex items-center gap-2"><Target size={18}/> Session Preview</h3>
          <div className="flex gap-4">
            <PreviewPill label="Due" count={breakdown.due} color="text-danger" />
            <PreviewPill label="Weak" count={breakdown.weak} color="text-warning" />
            <PreviewPill label="New" count={breakdown.new} color="text-success" />
          </div>
          <p className="text-xs text-muted mt-3">
            Estimated time: ~{Math.ceil(cards.length * 0.65)} minutes at average pace
          </p>
        </div>

        <button
          onClick={() => setPhase('session')}
          disabled={cards.length === 0}
          className="w-full bg-primary hover:bg-primary-hover text-white py-4 rounded-button font-bold text-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <Zap size={20}/> Start Session ({cards.length} cards)
        </button>
      </div>
    );
  }

  if (phase === 'session') {
    return (
      <div className="py-4">
        <FlashcardDeck cards={cards} onRate={handleRate} onComplete={handleComplete} />
      </div>
    );
  }

  // Results
  const elapsed = Math.round((Date.now() - sessionStart) / 60000);
  const avgQuality = ratings.length
    ? Math.round(ratings.reduce((s, r) => s + r.quality, 0) / ratings.length)
    : 0;
  const accuracy = Math.round((ratings.filter(r => r.quality >= 3).length / Math.max(ratings.length, 1)) * 100);

  return (
    <div className="max-w-2xl mx-auto text-center space-y-6">
      <div className="bg-gradient-to-br from-primary/10 to-purple-50 dark:from-primary/5 dark:to-purple-900/10 border border-primary/20 rounded-card p-10 shadow-sm">
        <div className="text-7xl mb-4">🧠</div>
        <h2 className="text-3xl font-extrabold text-heading mb-1">Practice Complete!</h2>
        <p className="text-muted mb-8">{elapsed || 1} minute{elapsed !== 1 ? 's' : ''} of focused review</p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <ResultStat value={String(ratings.length)} label="Cards Reviewed" />
          <ResultStat value={`${accuracy}%`} label="Accuracy" highlight={accuracy >= 80} />
          <ResultStat value={`${elapsed || '<1'}m`} label="Time Spent" />
        </div>

        <div className="flex gap-3">
          <button onClick={() => setPhase('config')} className="flex-1 border border-border bg-surface text-heading py-3 rounded-button font-medium hover:bg-border flex items-center justify-center gap-2">
            <RotateCcw size={16}/> New Session
          </button>
          <button onClick={() => setPhase('config')} className="flex-1 bg-primary text-white py-3 rounded-button font-bold hover:bg-primary-hover">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const PreviewPill = ({ label, count, color }: { label: string; count: number; color: string }) => (
  <div className="flex-1 text-center bg-surface border border-border rounded-xl p-3">
    <div className={`text-xl font-extrabold ${color}`}>{count}</div>
    <div className="text-xs text-muted mt-0.5">{label}</div>
  </div>
);

const ResultStat = ({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) => (
  <div className="bg-surface rounded-xl p-4 border border-border">
    <div className={`text-2xl font-extrabold ${highlight ? 'text-success' : 'text-primary'}`}>{value}</div>
    <div className="text-xs text-muted mt-1">{label}</div>
  </div>
);
