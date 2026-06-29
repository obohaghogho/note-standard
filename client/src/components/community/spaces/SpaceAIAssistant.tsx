import React, { useState } from 'react';
import { Sparkles, Send, Bot, User, RefreshCw } from 'lucide-react';
import { api } from '../../../lib/api'; // Assuming a generic API wrapper exists

interface SpaceInfo {
  id: string;
  name: string;
  manifest?: { features?: { ai?: boolean } };
}

export const SpaceAIAssistant: React.FC<{ space: SpaceInfo }> = ({ space }) => {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', content: string}[]>([
    { role: 'ai', content: `Hello! I'm the AI assistant for ${space.name}. I can help you search discussions, summarize guides, and find experts. What would you like to know?` }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);

    try {
      // Direct call to the Phase 2A endpoint built earlier
      const res = await api.post(`/community/spaces/${space.id}/ask`, { query: userMessage });
      setMessages(prev => [...prev, { role: 'ai', content: res.data.answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', content: 'Sorry, I am currently unavailable. Please try again later.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const suggestedQuestions = [
    "What are the best beginner guides here?",
    "Summarize the recent announcements.",
    "Who are the top experts for React?"
  ];

  return (
    <div className="max-w-4xl mx-auto h-[70vh] flex flex-col bg-elevated border border-border rounded-card shadow-sm overflow-hidden">
      
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white shadow-inner">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="font-bold text-heading">{space.name} AI</h2>
            <p className="text-xs text-muted flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success"></span> Online • Powered by Groq
            </p>
          </div>
        </div>
        <button className="text-muted hover:text-heading transition-colors" title="Clear Context">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-background custom-scrollbar">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-surface border border-border text-heading'}`}>
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-surface border border-border text-body rounded-tl-none'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-3">
             <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 text-heading">
                <Bot size={16} />
             </div>
             <div className="bg-surface border border-border rounded-2xl rounded-tl-none p-4 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: '300ms' }}></span>
             </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-surface border-t border-border shrink-0">
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {suggestedQuestions.map((q, i) => (
              <button 
                key={i} 
                onClick={() => { setInput(q); }}
                className="text-xs bg-elevated border border-border px-3 py-1.5 rounded-full text-muted hover:text-primary hover:border-primary transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleSend} className="relative flex items-center">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the Space AI..." 
            className="w-full bg-elevated border border-border rounded-input py-3 pl-4 pr-12 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isTyping}
            className="absolute right-2 p-2 bg-primary text-white rounded-button hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </form>
      </div>

    </div>
  );
};
