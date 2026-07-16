 
import React from 'react';
import { Link2, BookOpen, FolderOpen, Users, ArrowRight } from 'lucide-react';

interface RelatedNode {
  id: string;
  type: 'post' | 'wiki' | 'collection' | 'space' | 'creator';
  title: string;
  confidence: number;
  edge_type: string;
}

interface RelatedContentProps {
  nodes: RelatedNode[];
  isLoading?: boolean;
}

const NODE_ICONS: Record<string, React.ReactNode> = {
  post: <Link2 size={14} />,
  wiki: <BookOpen size={14} />,
  collection: <FolderOpen size={14} />,
  creator: <Users size={14} />,
};

const EDGE_LABELS: Record<string, string> = {
  similar_to: 'Similar',
  co_viewed: 'Often read together',
  references: 'Referenced by',
  prerequisite_of: 'Learn first',
  contains: 'Part of',
};

export const RelatedContent: React.FC<RelatedContentProps> = ({ nodes, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-border rounded-xl" />
        ))}
      </div>
    );
  }

  if (!nodes?.length) return null;

  return (
    <div className="bg-elevated border border-border rounded-card p-5 shadow-sm">
      <h3 className="text-sm font-bold text-heading mb-4 flex items-center gap-2">
        <Link2 size={16} className="text-primary" />
        Related Knowledge
      </h3>

      <div className="space-y-2">
        {nodes.map((node) => (
          <div
            key={node.id}
            className="group flex items-center gap-3 p-3 rounded-xl bg-surface border border-border hover:border-primary transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {NODE_ICONS[node.type] ?? <Link2 size={14} />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-heading group-hover:text-primary transition-colors truncate">
                {node.title}
              </div>
              <div className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
                <span className="capitalize">{node.type}</span>
                <span>·</span>
                <span>{EDGE_LABELS[node.edge_type] ?? node.edge_type}</span>
                {node.confidence < 0.95 && (
                  <>
                    <span>·</span>
                    <span className="text-warning">{Math.round(node.confidence * 100)}% match</span>
                  </>
                )}
              </div>
            </div>

            <ArrowRight size={16} className="text-muted group-hover:text-primary shrink-0 transition-colors" />
          </div>
        ))}
      </div>
    </div>
  );
};
