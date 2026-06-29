/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { ShieldAlert, Users, MessageSquareWarning, Activity, HelpCircle } from 'lucide-react';

export const SpaceModeratorDash: React.FC<{ spaceId: string }> = ({ spaceId }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-surface border border-border p-6 rounded-card shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-heading">Moderator Dashboard</h2>
          <p className="text-sm text-muted mt-1">Manage reports, members, and view AI moderation insights.</p>
        </div>
        <div className="bg-danger/10 text-danger px-3 py-1.5 rounded-badge text-sm font-bold flex items-center gap-2">
          <ShieldAlert size={16} /> Restricted Access
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ModStatCard title="Pending Reports" value="12" icon={<MessageSquareWarning size={20} className="text-warning"/>} alert />
        <ModStatCard title="Pending Members" value="45" icon={<Users size={20} className="text-info"/>} />
        <ModStatCard title="Unanswered Questions" value="8" icon={<HelpCircle size={20} className="text-primary"/>} />
        <ModStatCard title="Wiki Edit Queue" value="3" icon={<Activity size={20} className="text-success"/>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unanswered Questions (Key feature request) */}
        <div className="bg-elevated border border-border rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-heading">Opportunity: Unanswered Questions</h3>
            <button className="text-xs font-medium text-primary hover:underline">View All</button>
          </div>
          <p className="text-sm text-muted mb-4">These questions have been active for &gt;24h without a response. Tag experts to help!</p>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 bg-surface border border-border rounded-xl flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-heading leading-tight mb-1">How does Supabase handle RLS with custom JWTs?</h4>
                  <div className="text-xs text-muted">Asked by User123 • 2 days ago</div>
                </div>
                <button className="shrink-0 text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">Tag Expert</button>
              </div>
            ))}
          </div>
        </div>

        {/* AI Moderation Log */}
        <div className="bg-elevated border border-border rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-heading">AI Moderation Suggestions</h3>
          </div>
          <div className="space-y-3">
             <div className="p-3 bg-surface border border-border rounded-xl flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-danger/10 text-danger flex items-center justify-center shrink-0">
                  <ShieldAlert size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-heading">Potential Spam Detected</h4>
                  <p className="text-xs text-muted mt-1">A user posted 5 identical comments in the last 10 minutes containing external crypto links.</p>
                  <div className="flex gap-2 mt-2">
                    <button className="text-xs font-bold bg-danger text-white px-3 py-1 rounded">Ban User</button>
                    <button className="text-xs font-bold bg-surface border border-border text-heading px-3 py-1 rounded hover:bg-border">Ignore</button>
                  </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ModStatCard = ({ title, value, icon, alert }: { title: string, value: string, icon: React.ReactNode, alert?: boolean }) => (
  <div className="bg-elevated border border-border rounded-card p-5 shadow-sm flex items-center justify-between">
    <div>
      <div className="text-xs font-medium text-muted mb-1">{title}</div>
      <div className={`text-2xl font-extrabold ${alert ? 'text-danger' : 'text-heading'}`}>{value}</div>
    </div>
    <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center">
      {icon}
    </div>
  </div>
);
