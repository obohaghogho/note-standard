import React from 'react';
import { BookMarked, BrainCircuit, Star, Clock, FolderOpen, ArrowRight } from 'lucide-react';

export const SpaceKnowledgeLibrary: React.FC<{ spaceId: string }> = ({ spaceId: _spaceId }) => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-elevated border border-border rounded-card p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-heading flex items-center gap-2">
            <FolderOpen className="text-primary" /> 
            Knowledge Library
          </h2>
          <p className="text-sm text-muted mt-1">Curated resources, guides, and top discussions.</p>
        </div>
        <div className="flex gap-2">
          <input type="search" placeholder="Search library..." className="bg-surface border border-border rounded-input px-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 outline-none" />
          <button className="bg-surface border border-border px-4 py-2 rounded-button text-sm font-medium hover:bg-border transition-colors">Filter</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        
        {/* Mod Picks */}
        <div className="xl:col-span-2 bg-elevated border border-border rounded-card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Star className="text-warning fill-warning" size={20} />
            <h3 className="font-bold text-heading text-lg">Moderator Picks</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="group flex gap-4 p-4 rounded-xl bg-surface border border-border hover:border-primary transition-colors cursor-pointer">
                <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <BookMarked size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-heading group-hover:text-primary transition-colors line-clamp-2">How to architect scalable React applications</h4>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted">
                    <span>By Alex Dev</span>
                    <span>•</span>
                    <span>4.2k saves</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Recommended */}
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/10 dark:to-indigo-900/10 border border-purple-200 dark:border-purple-800/30 rounded-card p-6 shadow-sm">
           <div className="flex items-center gap-2 mb-4 text-purple-700 dark:text-purple-400">
            <BrainCircuit size={20} />
            <h3 className="font-bold text-lg">AI Recommended For You</h3>
          </div>
          <p className="text-xs text-purple-600/80 dark:text-purple-300/70 mb-4">Based on your recent reading history.</p>
          <div className="space-y-3">
             {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-lg bg-white dark:bg-surface border border-purple-100 dark:border-purple-800/50 hover:shadow-md transition-shadow cursor-pointer">
                <h4 className="font-semibold text-sm text-heading">Understanding React Context API in depth</h4>
                <p className="text-xs text-muted mt-1">Suggested because you read "Prop Drilling"</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recently Updated */}
        <div className="xl:col-span-3 bg-elevated border border-border rounded-card p-6 shadow-sm">
           <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-heading">
              <Clock size={20} className="text-info" />
              <h3 className="font-bold text-lg">Recently Updated</h3>
            </div>
            <button className="text-sm font-medium text-primary hover:underline flex items-center">Browse all <ArrowRight size={16} className="ml-1" /></button>
          </div>
          <div className="overflow-x-auto pb-2 -mx-2 px-2 no-scrollbar">
            <div className="flex gap-4 w-max">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="w-64 p-4 rounded-xl bg-surface border border-border shrink-0 hover:border-primary transition-colors cursor-pointer">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2 block">Template</span>
                  <h4 className="font-bold text-sm text-heading mb-2">Next.js Boilerplate with Auth</h4>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span>Updated 2h ago</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
