import React, { useState } from 'react';
import { FlashcardDeck } from './FlashcardDeck';
import { AiTutorPanel } from './AiTutorPanel';
import { CheckCircle, BookOpen, Brain, Sparkles, ChevronRight, Clock } from 'lucide-react';

export type StudyStep = 'summary' | 'flashcards' | 'quiz' | 'reflection' | 'complete';

const STEP_ORDER: StudyStep[] = ['summary', 'flashcards', 'quiz', 'reflection', 'complete'];

const STEP_META: Record<StudyStep, { icon: React.ReactNode; label: string; description: string }> = {
  summary:    { icon: <BookOpen size={20}/>,    label: 'Read Summary',    description: 'Understand key concepts' },
  flashcards: { icon: <Brain size={20}/>,       label: 'Flashcards',      description: 'Test your recall' },
  quiz:       { icon: <CheckCircle size={20}/>, label: 'Knowledge Check', description: 'Prove your understanding' },
  reflection: { icon: <Sparkles size={20}/>,    label: 'Reflection',      description: 'Lock in what you learned' },
  complete:   { icon: <CheckCircle size={20}/>, label: 'Complete',        description: 'Session finished!' },
};

const DEMO_FLASHCARDS = [
  { id: '1', front: 'What is the primary purpose of React hooks?', back: 'To allow functional components to use state and lifecycle features previously only available in class components.', hint: 'Think useState, useEffect...', difficulty: 'easy' as const },
  { id: '2', front: 'What does the dependency array in useEffect do?', back: 'Controls when the effect re-runs. Empty array = once on mount. Listed values = re-run when those values change.', difficulty: 'medium' as const },
];

export const StudySession: React.FC<{ space: any; pathNode: any; onComplete: () => void }> = ({ space, pathNode, onComplete }) => {
  const [currentStep, setCurrentStep] = useState<StudyStep>('summary');
  const [completedSteps, setCompletedSteps] = useState<Set<StudyStep>>(new Set());
  const [showTutor, setShowTutor] = useState(false);
  const [sessionStart] = useState(Date.now());

  const stepIndex = STEP_ORDER.indexOf(currentStep);
  const elapsedMinutes = Math.round((Date.now() - sessionStart) / 60000);

  const advanceStep = () => {
    setCompletedSteps(prev => new Set([...prev, currentStep]));
    const next = STEP_ORDER[stepIndex + 1];
    if (next) setCurrentStep(next);
    else onComplete();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'summary':
        return (
          <div className="max-w-3xl mx-auto bg-surface border border-border rounded-card p-8 shadow-sm">
            <h2 className="text-2xl font-extrabold text-heading mb-6">{pathNode?.title || 'Lesson Summary'}</h2>
            <div className="text-body leading-relaxed space-y-4">
              <p>React Hooks are functions that let you "hook into" React state and lifecycle features from function components. Before hooks, these features were only available in class components.</p>
              <p>The most commonly used hooks are <strong>useState</strong>, <strong>useEffect</strong>, <strong>useCallback</strong>, and <strong>useMemo</strong>.</p>
              <div className="bg-primary/5 border-l-4 border-primary p-4 rounded-r-lg">
                <p className="m-0 text-sm"><strong>Key Rule:</strong> Hooks must be called at the top level — never inside loops, conditions, or nested functions.</p>
              </div>
            </div>
            <button onClick={advanceStep} className="mt-8 flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-8 py-3 rounded-button font-semibold transition-colors">
              Continue to Flashcards <ChevronRight size={18}/>
            </button>
          </div>
        );

      case 'flashcards':
        return (
          <FlashcardDeck
            cards={DEMO_FLASHCARDS}
            onRate={(cardId, quality) => { /* Wire to MemoryEngine.recordReview() */ }}
            onComplete={advanceStep}
          />
        );

      case 'quiz':
        return (
          <div className="max-w-2xl mx-auto text-center py-12">
            <div className="text-6xl mb-4">📝</div>
            <h2 className="text-2xl font-bold text-heading mb-2">Knowledge Check</h2>
            <p className="text-muted mb-8">5 questions · ~5 minutes</p>
            <button onClick={advanceStep} className="bg-primary text-white px-8 py-3 rounded-button font-semibold hover:bg-primary-hover">
              Begin Quiz
            </button>
          </div>
        );

      case 'reflection':
        return (
          <div className="max-w-2xl mx-auto bg-surface border border-border rounded-card p-8 shadow-sm text-center">
            <div className="text-5xl mb-4">✨</div>
            <h2 className="text-2xl font-extrabold text-heading mb-4">Session Reflection</h2>
            <p className="text-muted mb-6">What was the most important thing you learned?</p>
            <textarea className="w-full bg-elevated border border-border rounded-input p-4 text-sm focus:ring-2 focus:ring-primary/50 outline-none resize-none" rows={4} placeholder="Write a brief reflection..." />
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTutor(true)} className="flex-1 border border-border text-heading py-3 rounded-button hover:bg-border transition-colors font-medium flex items-center justify-center gap-2">
                <Sparkles size={16}/> Ask AI Tutor
              </button>
              <button onClick={advanceStep} className="flex-1 bg-primary text-white py-3 rounded-button font-bold hover:bg-primary-hover transition-colors">
                Complete Session
              </button>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="max-w-2xl mx-auto text-center bg-gradient-to-br from-success/10 to-blue-50 dark:from-success/5 dark:to-blue-900/10 border border-success/20 rounded-card p-10 shadow-sm">
            <div className="text-7xl mb-4">🏆</div>
            <h2 className="text-3xl font-extrabold text-heading mb-2">Session Complete!</h2>
            <p className="text-muted mb-8">You studied for {elapsedMinutes || 1} minute{elapsedMinutes !== 1 ? 's' : ''}. Great work!</p>
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[['2', 'Cards'], ['5', 'Questions'], [`${elapsedMinutes || '<1'}m`, 'Studied']].map(([v, l]) => (
                <div key={l} className="bg-surface rounded-xl p-4 border border-border">
                  <div className="text-2xl font-extrabold text-primary">{v}</div>
                  <div className="text-xs text-muted mt-1">{l}</div>
                </div>
              ))}
            </div>
            <button onClick={onComplete} className="bg-primary text-white px-10 py-3 rounded-button font-bold hover:bg-primary-hover">
              Return to Path
            </button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-muted">{space.name}</div>
            <h3 className="font-bold text-heading truncate">{pathNode?.title || 'Study Session'}</h3>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-1 text-xs text-muted"><Clock size={14}/> {elapsedMinutes}m</div>
            <div className="hidden sm:flex items-center gap-1.5">
              {STEP_ORDER.filter(s => s !== 'complete').map(step => (
                <div key={step} className={`w-2 h-2 rounded-full transition-colors ${completedSteps.has(step) ? 'bg-success' : step === currentStep ? 'bg-primary' : 'bg-border'}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-muted mb-6">
          {STEP_META[currentStep]?.icon}
          <span className="font-medium text-heading">{STEP_META[currentStep]?.label}</span>
          <span>—</span>
          <span>{STEP_META[currentStep]?.description}</span>
        </div>
        {renderStep()}
      </div>

      {showTutor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-surface border border-border rounded-dialog shadow-xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-heading flex items-center gap-2"><Sparkles size={18}/> AI Tutor</h3>
              <button onClick={() => setShowTutor(false)} className="text-muted hover:text-heading text-lg">✕</button>
            </div>
            <div className="flex-1 overflow-hidden">
              <AiTutorPanel space={space} initialMode="teach" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
