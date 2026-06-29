/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { CheckCircle, Circle, Lock, ChevronRight, GraduationCap } from 'lucide-react';

interface PathNode {
  id: string;
  title: string;
  node_type: 'post' | 'wiki' | 'quiz' | 'collection';
  is_required: boolean;
  status: 'not_started' | 'in_progress' | 'completed';
  order_index: number;
}

interface LearningPath {
  id: string;
  title: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  nodes: PathNode[];
  completion_pct: number;
}

const LEVEL_CONFIG = {
  beginner:     { emoji: '🌱', color: 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400', label: 'Beginner' },
  intermediate: { emoji: '📘', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400', label: 'Intermediate' },
  advanced:     { emoji: '🎓', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400', label: 'Advanced' },
  expert:       { emoji: '🏆', color: 'text-warning bg-amber-50 dark:bg-amber-900/20', label: 'Expert' },
};

// Demo data until backend is wired up
const DEMO_PATH: LearningPath = {
  id: 'demo',
  title: 'React Mastery Track',
  level: 'intermediate',
  completion_pct: 40,
  nodes: [
    { id: '1', title: 'React Fundamentals', node_type: 'wiki', is_required: true, status: 'completed', order_index: 0 },
    { id: '2', title: 'Hooks Deep Dive', node_type: 'post', is_required: true, status: 'completed', order_index: 1 },
    { id: '3', title: 'State Management Patterns', node_type: 'collection', is_required: true, status: 'in_progress', order_index: 2 },
    { id: '4', title: 'Performance Quiz', node_type: 'quiz', is_required: true, status: 'not_started', order_index: 3 },
    { id: '5', title: 'Advanced Patterns', node_type: 'wiki', is_required: false, status: 'not_started', order_index: 4 },
  ]
};

export const LearningPathDash: React.FC<{ spaceId: string }> = ({ spaceId }) => {
  const path = DEMO_PATH;
  const cfg = LEVEL_CONFIG[path.level];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-elevated border border-border rounded-card p-6 shadow-sm flex items-start justify-between gap-4">
        <div>
          <div className={`inline-flex items-center gap-2 text-sm font-bold px-3 py-1.5 rounded-badge mb-3 ${cfg.color}`}>
            <span>{cfg.emoji}</span> {cfg.label} Track
          </div>
          <h2 className="text-2xl font-extrabold text-heading">{path.title}</h2>
          <p className="text-sm text-muted mt-2">Complete all required nodes to earn your <strong>{cfg.label}</strong> badge in this Space.</p>
        </div>
        <div className="text-center shrink-0">
          <div className="text-4xl font-extrabold text-primary">{path.completion_pct}%</div>
          <div className="text-xs text-muted mt-1">Complete</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-elevated border border-border rounded-card p-5 shadow-sm">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium text-heading">Overall Progress</span>
          <span className="text-muted">{path.nodes.filter(n => n.status === 'completed').length} / {path.nodes.length} nodes</span>
        </div>
        <div className="h-2.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full transition-all duration-700"
            style={{ width: `${path.completion_pct}%` }}
          />
        </div>
      </div>

      {/* Node List */}
      <div className="bg-elevated border border-border rounded-card p-6 shadow-sm">
        <h3 className="font-bold text-heading mb-5 flex items-center gap-2">
          <GraduationCap size={20} className="text-primary" />
          Learning Nodes
        </h3>
        <div className="relative">
          {/* Connector line */}
          <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-border z-0" />

          <div className="space-y-3 relative z-10">
            {path.nodes.map((node) => (
              <PathNodeRow key={node.id} node={node} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const PathNodeRow: React.FC<{ node: PathNode }> = ({ node }) => {
  const isLocked = node.status === 'not_started' && node.order_index > 0;

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
      node.status === 'completed'
        ? 'bg-success/5 border-success/20'
        : node.status === 'in_progress'
        ? 'bg-primary/5 border-primary/30 shadow-sm'
        : 'bg-surface border-border opacity-60'
    }`}>
      {/* Status icon */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
        node.status === 'completed' ? 'bg-success/10 text-success' :
        node.status === 'in_progress' ? 'bg-primary/10 text-primary' :
        'bg-border text-muted'
      }`}>
        {node.status === 'completed' ? <CheckCircle size={20} /> :
         node.status === 'in_progress' ? <Circle size={20} className="fill-primary/30" /> :
         <Circle size={20} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-heading truncate">{node.title}</span>
          {!node.is_required && <span className="text-[10px] bg-elevated border border-border px-1.5 py-0.5 rounded-full text-muted">Optional</span>}
        </div>
        <div className="text-xs text-muted capitalize mt-0.5">{node.node_type}</div>
      </div>

      <button
        disabled={isLocked}
        className={`shrink-0 px-4 py-1.5 rounded-button text-sm font-semibold transition-colors ${
          node.status === 'completed' ? 'bg-success/10 text-success cursor-default' :
          node.status === 'in_progress' ? 'bg-primary text-white hover:bg-primary-hover' :
          'bg-border text-muted cursor-not-allowed'
        }`}
      >
        {node.status === 'completed' ? 'Done' : node.status === 'in_progress' ? 'Continue' : 'Locked'}
      </button>
    </div>
  );
};
