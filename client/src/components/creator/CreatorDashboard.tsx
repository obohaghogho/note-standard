/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from 'react';
import { 
  BarChart2, Users, BookOpen, Clock, BrainCircuit, Target, 
  ChevronRight, Sparkles, AlertTriangle, Lightbulb 
} from 'lucide-react';

export const CreatorDashboard = ({ summary }) => {
  if (!summary) return <div>Loading...</div>;

  const { readiness, top_insights, history } = summary;
  const isReady = readiness?.is_monetization_eligible;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header section with Revenue Readiness */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 bg-gradient-to-br from-primary to-blue-700 text-white rounded-card p-6 shadow-lg">
          <h2 className="text-xl font-bold mb-2">Creator Overview</h2>
          <p className="text-white/80 text-sm mb-6">Your 30-day impact across all Spaces.</p>
          
          <div className="grid grid-cols-2 gap-4">
            <StatBox label="Total Views" value={summary.total_views} trend={summary.reach_trend_pct} />
            <StatBox label="Unique Readers" value={summary.unique_readers} />
            <StatBox label="Followers Gained" value={summary.followers_gained} />
            <StatBox label="Avg Read Completion" value={`${summary.read_completion_pct}%`} />
          </div>
        </div>

        <div className="md:w-80 bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-heading flex items-center gap-2 mb-2">
              <Target size={18} className="text-primary" /> Revenue Readiness
            </h3>
            <p className="text-xs text-muted mb-4">Internal score based on engagement, quality, and retention.</p>
            
            <div className="flex items-end gap-2 mb-4">
              <span className={`text-4xl font-extrabold ${isReady ? 'text-success' : 'text-heading'}`}>
                {readiness?.overall_score ?? 0}
              </span>
              <span className="text-sm text-muted mb-1">/ 100</span>
            </div>

            <div className="h-2 bg-border rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-700 ${isReady ? 'bg-success' : 'bg-primary'}`} 
                style={{ width: `${Math.min(readiness?.overall_score ?? 0, 100)}%` }}
              />
            </div>
            
            <div className="mt-3 text-xs font-medium flex items-center gap-1.5">
              {isReady ? (
                <span className="text-success flex items-center gap-1"><Sparkles size={14}/> Eligible for Monetization</span>
              ) : (
                <span className="text-muted flex items-center gap-1">Reach 70 to unlock monetization tools</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Engagement */}
        <div className="bg-surface border border-border rounded-card p-5 shadow-sm">
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2"><BookOpen size={16} className="text-muted"/> Content Engagement</h3>
          <div className="space-y-4">
            <MetricRow label="Saves" value={summary.total_saves} />
            <MetricRow label="Shares" value={summary.total_shares} />
            <MetricRow label="Avg Time / Read" value={`${Math.round(summary.avg_reading_time_seconds / 60)}m`} />
          </div>
        </div>

        {/* Learning */}
        <div className="bg-surface border border-border rounded-card p-5 shadow-sm">
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2"><BrainCircuit size={16} className="text-muted"/> Learning Impact</h3>
          <div className="space-y-4">
            <MetricRow label="Quiz Completions" value={summary.quiz_completions} />
            <MetricRow label="Avg Quiz Score" value={`${summary.avg_quiz_score}%`} />
            <MetricRow label="Path Completions" value={summary.learning_path_completions} />
          </div>
        </div>

        {/* Retention & AI */}
        <div className="bg-surface border border-border rounded-card p-5 shadow-sm">
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2"><Users size={16} className="text-muted"/> Audience Retention</h3>
          <div className="space-y-4">
            <MetricRow label="7-Day Retention" value={`${summary.retention_7d_pct}%`} />
            <MetricRow label="30-Day Retention" value={`${summary.retention_30d_pct}%`} />
            <MetricRow label="AI Tutor Sessions" value={summary.ai_tutor_sessions} />
          </div>
        </div>

      </div>

      {/* Content Insights (Actionable) */}
      <div className="bg-elevated border border-border rounded-card p-6 shadow-sm">
        <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
          <Lightbulb size={18} className="text-warning" /> Content Insights
        </h3>
        
        {top_insights?.length === 0 ? (
          <p className="text-sm text-muted">Not enough data to generate insights yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {top_insights?.map((insight, idx) => (
              <div key={idx} className="bg-surface border border-border rounded-xl p-4 flex gap-3">
                <div className="mt-0.5 text-danger"><AlertTriangle size={16}/></div>
                <div>
                  <div className="text-sm font-semibold text-heading mb-1">High Drop-off Detected</div>
                  <div className="text-xs text-muted mb-2">Node {insight.node_id.substring(0,6)} ({insight.node_type}) has a {insight.drop_off_pct}% drop-off rate.</div>
                  <button className="text-xs font-bold text-primary hover:underline">Review Content</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

const StatBox = ({ label, value, trend }) => (
  <div className="bg-white/10 rounded-xl p-3">
    <div className="text-xs text-white/70 mb-1">{label}</div>
    <div className="flex items-end gap-2">
      <div className="text-2xl font-extrabold">{value}</div>
      {trend !== undefined && (
        <div className={`text-xs font-medium mb-1 ${trend > 0 ? 'text-success' : trend < 0 ? 'text-danger' : 'text-white/50'}`}>
          {trend > 0 ? '+' : ''}{trend}%
        </div>
      )}
    </div>
  </div>
);

const MetricRow = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-muted font-medium">{label}</span>
    <span className="text-sm font-bold text-heading">{value}</span>
  </div>
);
