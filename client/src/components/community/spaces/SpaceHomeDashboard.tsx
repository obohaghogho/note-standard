 
import React from 'react';
import { Megaphone, Pin, TrendingUp, Award, Book, ArrowRight, Sparkles } from 'lucide-react';

interface SpaceHomeDashboardProps {
  space: any;
  onNavigateTab: (tab: string) => void;
}

export const SpaceHomeDashboard: React.FC<SpaceHomeDashboardProps> = ({ space, onNavigateTab }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Content Column */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Quick Actions */}
        <div className="bg-elevated border border-border rounded-card p-5 shadow-sm">
          <h3 className="text-sm font-bold text-heading mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button onClick={() => onNavigateTab('discussions')} className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-surface border border-border hover:border-primary hover:text-primary transition-colors">
              <span className="text-xl">+</span>
              <span className="text-xs font-medium">New Post</span>
            </button>
            {space.manifest?.features?.ai && (
              <button onClick={() => onNavigateTab('ai')} className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-surface border border-border hover:border-purple-500 hover:text-purple-500 transition-colors">
                <Sparkles size={20} />
                <span className="text-xs font-medium">Ask AI</span>
              </button>
            )}
            <button onClick={() => onNavigateTab('knowledge')} className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-surface border border-border hover:border-blue-500 hover:text-blue-500 transition-colors">
              <Book size={20} />
              <span className="text-xs font-medium">Library</span>
            </button>
            <button onClick={() => onNavigateTab('discussions')} className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-surface border border-border hover:border-green-500 hover:text-green-500 transition-colors">
              <TrendingUp size={20} />
              <span className="text-xs font-medium">Trending</span>
            </button>
          </div>
        </div>

        {/* Announcements */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-card p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Megaphone size={64} />
          </div>
          <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-400">
            <Megaphone size={18} />
            <h3 className="font-bold">Latest Announcement</h3>
          </div>
          <p className="text-sm text-body leading-relaxed max-w-lg relative z-10">
            Welcome to the Space! We just updated our Knowledge Library with the latest React 19 guidelines. Make sure to check it out before posting.
          </p>
          <button className="mt-4 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">Read full update &rarr;</button>
        </div>

        {/* Pinned Guide */}
        <div className="bg-elevated border border-border rounded-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-heading">
              <Pin size={18} className="text-warning" />
              <h3 className="font-bold">Pinned Guide</h3>
            </div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4 hover:border-primary transition-colors cursor-pointer group">
            <h4 className="font-bold text-heading group-hover:text-primary transition-colors">Complete Guide to React Server Components</h4>
            <p className="text-sm text-muted mt-1">Everything you need to know about RSCs in Next.js App Router...</p>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted">
              <span className="flex items-center gap-1"><Award size={14} /> Official Tutorial</span>
              <span>12k views</span>
            </div>
          </div>
        </div>

      </div>

      {/* Sidebar Column */}
      <div className="space-y-6">
        
        {/* Knowledge Library Preview */}
        <div className="bg-elevated border border-border rounded-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-heading flex items-center gap-2"><Book size={18}/> Top Resources</h3>
            <button onClick={() => onNavigateTab('knowledge')} className="text-xs text-primary hover:underline flex items-center">View all <ArrowRight size={12} className="ml-1"/></button>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-start gap-3 group cursor-pointer">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-1">
                  {i}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-heading group-hover:text-primary transition-colors">React Hooks Cheat Sheet</h4>
                  <p className="text-xs text-muted">PDF • 2MB</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Featured Contributors */}
        <div className="bg-elevated border border-border rounded-card p-5 shadow-sm">
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2"><Award size={18}/> Top Contributors</h3>
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="flex items-center gap-3">
                <img src={`https://i.pravatar.cc/150?img=${i}`} alt="Avatar" className="w-10 h-10 rounded-full border border-border" />
                <div>
                  <div className="flex items-center gap-1">
                    <h4 className="text-sm font-bold text-heading">Alex Developer</h4>
                  </div>
                  <div className="flex gap-1 mt-0.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Expert</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Mentor</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
