 
import React, { useState, useEffect } from 'react';
import { Sparkles, AlertCircle, FileText, CheckCircle, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';

interface Suggestion {
  type: 'outdated_content' | 'missing_quiz' | 'high_dropoff' | 'weak_concepts';
  priority: 'high' | 'medium' | 'low';
  message: string;
  action: string;
  affected_count?: number;
  affected_nodes?: any[];
  concepts?: string[];
}

export const AiCreatorAssistant = ({ spaceId }: { spaceId?: string }) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecs = async () => {
      try {
        const res = await api.get(`/community/creator/recommendations${spaceId ? `?spaceId=${spaceId}` : ''}`);
        setSuggestions(res.data.recommendations || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecs();
  }, [spaceId]);

  if (loading) return <div className="p-6 flex items-center justify-center text-muted"><Sparkles className="animate-spin mr-2"/> Analyzing your content...</div>;

  if (suggestions.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-card p-8 text-center shadow-sm">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success/10 text-success mb-4">
          <CheckCircle size={24} />
        </div>
        <h3 className="text-lg font-bold text-heading mb-2">Content is looking healthy!</h3>
        <p className="text-muted text-sm">Your Knowledge Graph is stable. No major knowledge gaps or drop-off issues detected right now.</p>
      </div>
    );
  }

  const iconMap = {
    outdated_content: <AlertCircle className="text-danger" size={20}/>,
    missing_quiz: <FileText className="text-warning" size={20}/>,
    high_dropoff: <AlertCircle className="text-danger" size={20}/>,
    weak_concepts: <BrainCircuit className="text-primary" size={20}/>
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={20} className="text-primary" />
        <h3 className="text-lg font-bold text-heading">AI Content Recommendations</h3>
      </div>
      
      {suggestions.map((s, idx) => (
        <div key={idx} className="bg-surface border border-border rounded-xl p-5 shadow-sm flex items-start gap-4">
          <div className="mt-0.5 shrink-0">
            {iconMap[s.type] || <Sparkles className="text-primary" size={20}/>}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${s.priority === 'high' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                {s.priority} Priority
              </span>
            </div>
            <p className="text-sm text-heading font-medium leading-relaxed mb-3">
              {s.message}
            </p>
            <button className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
              {s.action} <ArrowRight size={14}/>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const BrainCircuit = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M9 13a4.5 4.5 0 0 0 3-4"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M12 13h4"/><path d="M12 18h6a2 2 0 0 1 2 2v1"/><path d="M12 8h8"/><path d="M16 8V5a2 2 0 0 1 2-2"/><circle cx="16" cy="13" r=".5"/><circle cx="18" cy="3" r=".5"/><circle cx="20" cy="21" r=".5"/><circle cx="20" cy="8" r=".5"/></svg>
);
