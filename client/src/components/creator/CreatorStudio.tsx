 
import React, { useState, useEffect } from 'react';
import { FileEdit, CheckCircle, Clock, Search, Plus } from 'lucide-react';
import { api } from '../../lib/api';

interface Draft {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'outdated';
  content_type: string;
  updated_at: string;
}

export const CreatorStudio = () => {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDrafts = async () => {
      try {
        const res = await api.get('/community/creator/drafts');
        setDrafts(res.data.drafts || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchDrafts();
  }, []);

  const filteredDrafts = drafts.filter(d => filter === 'all' || d.status === filter);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">Creator Studio</h1>
          <p className="text-sm text-muted">Manage your knowledge content across all spaces.</p>
        </div>
        <button className="bg-primary text-white hover:bg-primary-hover px-4 py-2 rounded-button font-bold text-sm flex items-center justify-center gap-2">
          <Plus size={16}/> Create Content
        </button>
      </div>

      <div className="bg-surface border border-border rounded-card overflow-hidden shadow-sm">
        {/* Filters & Search */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex gap-2">
            {['all', 'draft', 'published', 'outdated'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-badge text-xs font-semibold capitalize transition-colors ${
                  filter === f ? 'bg-heading text-surface' : 'bg-elevated border border-border text-muted hover:text-heading'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input 
              type="text" 
              placeholder="Search content..."
              className="pl-9 pr-4 py-2 text-sm bg-elevated border border-border rounded-input focus:outline-none focus:ring-2 focus:ring-primary/50 w-full sm:w-64"
            />
          </div>
        </div>

        {/* List */}
        <div className="divide-y divide-border">
          {loading ? (
            <div className="p-8 text-center text-muted">Loading content...</div>
          ) : filteredDrafts.length === 0 ? (
            <div className="p-12 text-center text-muted">
              No content found. Start creating to build your knowledge base.
            </div>
          ) : (
            filteredDrafts.map(draft => (
              <div key={draft.id} className="p-4 hover:bg-elevated transition-colors flex items-center justify-between group cursor-pointer">
                <div className="flex items-start gap-4">
                  <div className={`mt-1 p-2 rounded-lg ${
                    draft.content_type === 'quiz' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                    draft.content_type === 'flashcard' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    <FileEdit size={18} />
                  </div>
                  <div>
                    <h4 className="font-bold text-heading text-sm group-hover:text-primary transition-colors">
                      {draft.title || 'Untitled Draft'}
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-muted mt-1">
                      <span className="capitalize">{draft.content_type.replace('_', ' ')}</span>
                      <span>•</span>
                      <span>Last updated {new Date(draft.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {draft.status === 'published' && <span className="flex items-center gap-1 text-xs font-bold text-success"><CheckCircle size={14}/> Published</span>}
                  {draft.status === 'draft' && <span className="flex items-center gap-1 text-xs font-bold text-muted"><Clock size={14}/> Draft</span>}
                  {draft.status === 'outdated' && <span className="flex items-center gap-1 text-xs font-bold text-warning"><AlertTriangle size={14}/> Needs Update</span>}
                  
                  <button className="opacity-0 group-hover:opacity-100 text-primary font-bold text-xs hover:underline transition-opacity">
                    Edit
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const AlertTriangle = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
);
