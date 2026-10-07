import React, { useState, useEffect } from 'react';
import { Sparkles, AlertCircle, FileText, CheckCircle, ArrowRight, Activity, ShieldCheck, Loader2 } from 'lucide-react';
import api from '../../api/axiosInstance';

export interface Suggestion {
  type: 'outdated_content' | 'missing_quiz' | 'high_dropoff' | 'weak_concepts';
  priority: 'high' | 'medium' | 'low';
  message: string;
  action: string;
  affected_count?: number;
  affected_nodes?: Array<{ id?: string; title?: string; node_id?: string; node_type?: string; drop_off_pct?: number }>;
  concepts?: string[];
}

export interface AiCreatorAssistantProps {
  spaceId?: string;
  onAction?: (suggestion: Suggestion) => void | Promise<void>;
}

export const AiCreatorAssistant: React.FC<AiCreatorAssistantProps> = ({ spaceId, onAction }) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingIdx, setProcessingIdx] = useState<number | null>(null);

  useEffect(() => {
    const fetchRecs = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/creator/recommendations${spaceId ? `?spaceId=${spaceId}` : ''}`);
        if (res.data && Array.isArray(res.data.recommendations)) {
          setSuggestions(res.data.recommendations);
        } else {
          setSuggestions([]);
        }
      } catch (err: any) {
        console.error('Error loading content recommendations:', err);
        setError(err.response?.data?.error || 'Unable to load content health insights.');
      } finally {
        setLoading(false);
      }
    };
    fetchRecs();
  }, [spaceId]);

  const handleActionClick = async (suggestion: Suggestion, idx: number) => {
    if (!onAction || processingIdx !== null) return;
    setProcessingIdx(idx);
    try {
      await onAction(suggestion);
    } catch (err) {
      console.error('Error executing recommendation action:', err);
    } finally {
      setProcessingIdx(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-surface border border-border rounded-card flex items-center justify-center text-xs font-semibold text-muted gap-2 shadow-sm">
        <Loader2 className="animate-spin text-primary" size={18} />
        <span>Analyzing content health and knowledge graph connections...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-card text-xs flex items-center gap-2">
        <AlertCircle size={16} className="shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-card p-6 text-center space-y-2 shadow-sm">
        <div className="inline-flex items-center justify-center p-3 rounded-full bg-emerald-500/10 text-emerald-500 mx-auto">
          <CheckCircle size={24} />
        </div>
        <h3 className="text-sm font-bold text-heading">Content Health is Optimal</h3>
        <p className="text-xs text-muted max-w-md mx-auto">
          Your Knowledge Graph and learning content are stable. No outdated sets, missing quizzes, or high reader drop-off issues detected.
        </p>
      </div>
    );
  }

  const iconMap: Record<string, React.ReactNode> = {
    outdated_content: <AlertCircle className="text-red-500 shrink-0" size={18} />,
    missing_quiz: <FileText className="text-amber-500 shrink-0" size={18} />,
    high_dropoff: <Activity className="text-red-500 shrink-0" size={18} />,
    weak_concepts: <Sparkles className="text-primary shrink-0" size={18} />
  };

  return (
    <div className="bg-surface border border-border rounded-card p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-heading">AI Content Health & Actionable Insights</h3>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
          <ShieldCheck size={12} /> Database Analysis
        </span>
      </div>

      <div className="space-y-3">
        {suggestions.map((s, idx) => (
          <div key={idx} className="p-4 bg-elevated border border-border rounded-xl space-y-2 text-xs flex items-start gap-3">
            <div className="mt-0.5">
              {iconMap[s.type] || <Sparkles className="text-primary shrink-0" size={18} />}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${
                  s.priority === 'high' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                }`}>
                  {s.priority} Priority
                </span>
                <span className="text-[10px] text-muted capitalize">{s.type.replace('_', ' ')}</span>
              </div>
              <p className="text-xs font-semibold text-heading leading-relaxed">
                {s.message}
              </p>
              {s.action && (
                <div className="pt-1">
                  <button
                    disabled={processingIdx !== null}
                    onClick={() => handleActionClick(s, idx)}
                    className="text-xs font-bold text-primary hover:underline disabled:opacity-50 inline-flex items-center gap-1 transition-all"
                  >
                    {processingIdx === idx ? (
                      <>
                        <Loader2 className="animate-spin text-primary" size={13} />
                        <span>Processing Action...</span>
                      </>
                    ) : (
                      <>
                        <span>{s.action}</span>
                        <ArrowRight size={13} />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default AiCreatorAssistant;
