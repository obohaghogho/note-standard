import React from 'react';
import { BookOpen, ChevronRight, FileText, Settings, History } from 'lucide-react';

export const SpaceWiki: React.FC<{ spaceId: string }> = ({ spaceId }) => {
  return (
    <div className="flex flex-col md:flex-row gap-6 h-[75vh]">
      {/* Sidebar Navigation */}
      <div className="w-full md:w-64 shrink-0 bg-elevated border border-border rounded-card p-4 shadow-sm overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-heading flex items-center gap-2"><BookOpen size={18} /> Index</h3>
        </div>
        
        <div className="space-y-1">
          <WikiNavItem title="Introduction" active />
          <WikiNavItem title="Getting Started" />
          <WikiNavItem title="Guidelines" />
          
          <div className="pt-4 mt-2 border-t border-border">
             <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2 px-2">Resources</div>
             <WikiNavItem title="Tutorials" />
             <WikiNavItem title="Templates" />
             <WikiNavItem title="Glossary" />
          </div>

          <div className="pt-4 mt-2 border-t border-border">
             <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2 px-2">Community</div>
             <WikiNavItem title="FAQs" />
             <WikiNavItem title="Roadmap" />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-surface border border-border rounded-card shadow-sm flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-elevated">
          <div className="flex items-center gap-2 text-sm text-muted">
             <span className="hover:text-heading cursor-pointer">Wiki</span>
             <ChevronRight size={14} />
             <span className="text-heading font-medium">Introduction</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-muted hover:text-heading hover:bg-border rounded-button transition-colors" title="View History"><History size={16}/></button>
            <button className="px-3 py-1.5 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-button transition-colors">Edit Page</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-3xl mx-auto prose dark:prose-invert">
            <h1 className="text-3xl font-extrabold text-heading mb-4">Introduction to the Space</h1>
            <p className="text-body leading-relaxed mb-6">
              Welcome to our knowledge base. This wiki is a collaboratively edited repository of the most valuable information in our community.
              Unlike the feed, which is temporal, this wiki is designed to be a permanent, structured resource.
            </p>
            
            <h2 className="text-2xl font-bold text-heading mt-8 mb-4">How to Contribute</h2>
            <p className="text-body leading-relaxed mb-4">
              Any member can propose edits to this wiki. However, to maintain the high quality of our documentation, all edits must be approved by a Space Moderator or an Editor.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-body mb-6">
              <li>Ensure your information is accurate and cited if necessary.</li>
              <li>Follow the formatting guidelines.</li>
              <li>Do not use the wiki for self-promotion.</li>
            </ul>

            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded-r-lg my-6">
              <p className="text-blue-800 dark:text-blue-300 m-0 text-sm">
                <strong>Tip:</strong> If you are looking for quick answers, try using the AI Assistant tab. It is trained on this entire wiki!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const WikiNavItem = ({ title, active = false }: { title: string, active?: boolean }) => (
  <button className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
    active ? 'bg-primary text-white font-medium shadow-sm' : 'text-body hover:bg-border hover:text-heading'
  }`}>
    <FileText size={16} className={active ? 'text-white/80' : 'text-muted'} />
    {title}
  </button>
);
