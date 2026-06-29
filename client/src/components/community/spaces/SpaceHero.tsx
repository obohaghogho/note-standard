import React from 'react';
import { Users, Shield, Zap, BookOpen, Share2, Plus } from 'lucide-react';

interface SpaceHeroProps {
  space: any;
}

export const SpaceHero: React.FC<SpaceHeroProps> = ({ space }) => {
  // Calculate aggregate score
  const aggregateScore = Math.round(
    (space.health_score + space.quality_score + space.mod_score + space.response_score + space.safety_score) / 5
  );

  return (
    <div className="relative w-full bg-surface border-b border-border pb-6">
      {/* Banner */}
      <div className="h-48 md:h-64 w-full relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-900">
        {space.banner_url && (
          <img src={space.banner_url} alt="Banner" className="w-full h-full object-cover mix-blend-overlay opacity-60" />
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative -mt-16 sm:-mt-24 flex flex-col sm:flex-row gap-6 items-start sm:items-end">
        {/* Avatar */}
        <div className="relative rounded-2xl border-4 border-surface bg-elevated overflow-hidden w-24 h-24 sm:w-36 sm:h-36 shadow-lg shrink-0">
          <img src={space.avatar_url || `https://ui-avatars.com/api/?name=${space.name}`} alt={space.name} className="w-full h-full object-cover" />
        </div>

        {/* Info */}
        <div className="flex-1 pb-2">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-heading">{space.name}</h1>
            {aggregateScore >= 95 && (
              <span className="bg-success/10 text-success text-xs font-bold px-2 py-1 rounded-badge flex items-center gap-1">
                <Shield size={12} /> Elite Space
              </span>
            )}
          </div>
          <p className="text-muted text-sm max-w-2xl leading-relaxed">{space.description}</p>
          
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-body font-medium">
            <div className="flex items-center gap-1">
              <Users size={16} className="text-muted" />
              <span>{space.member_count.toLocaleString()} members</span>
              <span className="text-success ml-1 text-xs bg-success/10 px-1.5 rounded-full">{space.online_count} online</span>
            </div>
            <div className="flex items-center gap-1 text-primary">
              <BookOpen size={16} />
              <span>{space.category}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 w-full sm:w-auto mt-4 sm:mt-0 pb-2">
          <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded-button font-semibold transition-colors shadow-sm">
            Join Space
          </button>
          <button className="p-2.5 bg-elevated border border-border text-heading rounded-button hover:bg-border transition-colors">
            <Share2 size={18} />
          </button>
        </div>
      </div>

      {/* Reputation Score Metrics */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="bg-elevated border border-border rounded-card p-4 flex flex-wrap gap-x-8 gap-y-4 shadow-sm items-center justify-between lg:justify-start overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-3 pr-8 border-r border-border shrink-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-inner">
              {aggregateScore}
            </div>
            <div className="text-sm">
              <div className="font-bold text-heading">Trust Score</div>
              <div className="text-muted text-xs">Overall Quality</div>
            </div>
          </div>

          <MetricScore label="Community Health" score={space.health_score} />
          <MetricScore label="Knowledge Quality" score={space.quality_score} />
          <MetricScore label="Mod Activity" score={space.mod_score} />
          <MetricScore label="Spam Safety" score={space.safety_score} />
        </div>
      </div>
    </div>
  );
};

const MetricScore = ({ label, score }: { label: string; score: number }) => {
  let colorClass = 'text-success';
  if (score < 80) colorClass = 'text-warning';
  if (score < 50) colorClass = 'text-danger';

  return (
    <div className="flex flex-col shrink-0">
      <span className="text-xs text-muted mb-1 font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
          <div className={`h-full ${colorClass.replace('text-', 'bg-')}`} style={{ width: `${score}%` }} />
        </div>
        <span className={`text-sm font-bold ${colorClass}`}>{score}</span>
      </div>
    </div>
  );
};
