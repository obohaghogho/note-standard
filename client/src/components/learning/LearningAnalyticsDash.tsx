import React from 'react';
import { Flame, Brain, Clock, Target, TrendingUp, Award } from 'lucide-react';

interface Stats {
  cards_due: number;
  retention_pct: number;
  current_streak: number;
  total_reviewed: number;
  estimated_minutes: number;
}

interface Achievement {
  id: string;
  title: string;
  icon: string;
  category: string;
  earned_at: string;
}

export const LearningAnalyticsDash: React.FC<{ stats: Stats; achievements: Achievement[] }> = ({ stats, achievements }) => {
  return (
    <div className="space-y-6">
      {/* Today's Review Card — the headline metric */}
      <div className="bg-gradient-to-br from-primary to-blue-700 text-white rounded-card p-6 shadow-lg">
        <h2 className="text-lg font-bold mb-1 opacity-90">Today's Review</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <StatPill label="Cards Due"     value={String(stats.cards_due)}       highlight />
          <StatPill label="Retention"     value={`${stats.retention_pct}%`} />
          <StatPill label="Streak"        value={`${stats.current_streak}d`} />
          <StatPill label="~Time Needed"  value={`${stats.estimated_minutes}m`} />
        </div>
        <button className="mt-5 w-full sm:w-auto bg-white/20 hover:bg-white/30 transition-colors px-6 py-2.5 rounded-button font-bold text-sm">
          Start Review Session →
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Performance Metrics */}
        <div className="bg-elevated border border-border rounded-card p-6 shadow-sm">
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-primary"/> Performance</h3>
          <div className="space-y-4">
            <Metric label="Retention Rate" value={stats.retention_pct} suffix="%" color="success" />
            <Metric label="Cards Reviewed" value={Math.min(stats.total_reviewed, 100)} suffix={`/${stats.total_reviewed} total`} color="primary" />
            <Metric label="Study Streak"   value={Math.min(stats.current_streak, 100)} suffix={`${stats.current_streak} days`} color="warning" />
          </div>
        </div>

        {/* Achievements */}
        <div className="bg-elevated border border-border rounded-card p-6 shadow-sm">
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2"><Award size={18} className="text-warning"/> Achievements</h3>
          {achievements.length === 0 ? (
            <div className="text-center py-6 text-muted text-sm">
              <div className="text-4xl mb-2">🏅</div>
              Complete your first lesson to earn achievements!
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {achievements.slice(0, 6).map(a => (
                <div key={a.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-surface border border-border">
                  <span className="text-2xl">{a.icon}</span>
                  <div>
                    <div className="text-xs font-bold text-heading">{a.title}</div>
                    <div className="text-[10px] text-muted">{new Date(a.earned_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Demo Achievements — preview of what can be unlocked */}
      <div className="bg-elevated border border-border rounded-card p-6 shadow-sm">
        <h3 className="font-bold text-heading mb-4">Upcoming Milestones</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { emoji: '🔥', label: '7-Day Streak', progress: Math.min(stats.current_streak / 7 * 100, 100) },
            { emoji: '🃏', label: '100 Cards Reviewed', progress: Math.min(stats.total_reviewed, 100) },
            { emoji: '📖', label: 'First Wiki Edit', progress: 0 },
            { emoji: '🏆', label: 'Path Complete', progress: 40 },
          ].map(m => (
            <div key={m.label} className="p-3 rounded-xl bg-surface border border-border">
              <div className="text-2xl mb-2">{m.emoji}</div>
              <div className="text-xs font-medium text-heading mb-2">{m.label}</div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${m.progress}%` }}/>
              </div>
              <div className="text-[10px] text-muted mt-1">{Math.round(m.progress)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const StatPill = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div className="bg-white/10 rounded-xl p-3 text-center">
    <div className={`text-2xl font-extrabold ${highlight ? 'text-white' : 'text-white/90'}`}>{value}</div>
    <div className="text-xs text-white/70 mt-0.5">{label}</div>
  </div>
);

const Metric = ({ label, value, suffix, color }: { label: string; value: number; suffix: string; color: string }) => {
  const colors: Record<string, string> = { success: 'bg-success', primary: 'bg-primary', warning: 'bg-warning' };
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted">{label}</span>
        <span className="font-bold text-heading">{suffix}</span>
      </div>
      <div className="h-2 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors[color] ?? 'bg-primary'} transition-all duration-700`} style={{ width: `${value}%` }}/>
      </div>
    </div>
  );
};
