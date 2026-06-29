import React, { useState } from 'react';
import { Sparkles, Send, Bot, User, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';

type TutorMode = 'teach' | 'explain_simple' | 'socratic' | 'diagnose' | 'recommend' | 'schedule' | 'challenge';

const MODES: { id: TutorMode; label: string; emoji: string; description: string }[] = [
  { id: 'teach',          label: 'Explain',    emoji: '📚', description: 'Full explanation' },
  { id: 'explain_simple', label: 'Simplify',   emoji: '🌱', description: 'Beginner-friendly' },
  { id: 'socratic',       label: 'Socratic',   emoji: '🤔', description: 'Guide with questions' },
  { id: 'diagnose',       label: 'Diagnose',   emoji: '🔍', description: 'Find misconceptions' },
  { id: 'recommend',      label: 'Recommend',  emoji: '🗺️', description: 'What to learn next' },
  { id: 'schedule',       label: 'Schedule',   emoji: '📅', description: 'Build study plan' },
  { id: 'challenge',      label: 'Challenge',  emoji: '⚡', description: 'Test your mastery' },
];

export const AiTutorPanel: React.FC<{ space: any; initialMode?: TutorMode }> = ({ space, initialMode = 'teach' }) => {
  const [mode, setMode] = useState<TutorMode>(initialMode);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; content: string }[]>([
    { role: 'ai', content: `I'm in **${MODES.find(m => m.id === initialMode)?.label}** mode. Ask me anything about what you're studying in ${space.name}.` }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isTyping) return;
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);

    try {
      const res = await api.post(`/community/spaces/${space.id}/tutor`, {
        query: userMessage,
        mode,
        conversationHistory: history.slice(-6)
      });
      const answer = res.data.answer;
      setMessages(prev => [...prev, { role: 'ai', content: answer }]);
      setHistory(prev => [...prev, { role: 'user', content: userMessage }, { role: 'assistant', content: answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', content: "I'm temporarily unavailable. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const switchMode = (newMode: TutorMode) => {
    setMode(newMode);
    setMessages([{ role: 'ai', content: `Switched to **${MODES.find(m => m.id === newMode)?.label}** mode. ${
      newMode === 'socratic' ? "I'll guide you with questions instead of giving answers." :
      newMode === 'challenge' ? "Let's test your mastery with progressively harder questions." :
      "How can I help?"
    }` }]);
    setHistory([]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Mode Selector */}
      <div className="p-3 border-b border-border overflow-x-auto no-scrollbar shrink-0">
        <div className="flex gap-2 w-max">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => switchMode(m.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-badge text-xs font-semibold whitespace-nowrap transition-colors ${
                mode === m.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-elevated border border-border text-muted hover:text-heading hover:border-primary/30'
              }`}
              title={m.description}
            >
              <span>{m.emoji}</span> {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-surface border border-border'}`}>
              {msg.role === 'user' ? <User size={14}/> : <Bot size={14}/>}
            </div>
            <div className={`max-w-[82%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${
              msg.role === 'user'
                ? 'bg-primary text-white rounded-tr-none'
                : 'bg-surface border border-border text-body rounded-tl-none'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-surface border border-border flex items-center justify-center shrink-0"><Bot size={14}/></div>
            <div className="bg-surface border border-border rounded-2xl rounded-tl-none p-3 flex items-center gap-1">
              {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 bg-surface border-t border-border shrink-0">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Ask in ${MODES.find(m => m.id === mode)?.label} mode...`}
            className="w-full bg-elevated border border-border rounded-input py-2.5 pl-4 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
          />
          <button type="submit" disabled={!input.trim() || isTyping}
            className="absolute right-2 p-1.5 bg-primary text-white rounded-button hover:bg-primary-hover disabled:opacity-50 transition-colors">
            <Send size={14}/>
          </button>
        </form>
      </div>
    </div>
  );
};
