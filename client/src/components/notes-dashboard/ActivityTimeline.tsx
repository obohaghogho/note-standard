import React from "react";
import { useNotesDashboard } from "../../context/NotesDashboardContext";
import { History, Calendar, CheckSquare, Plus, Edit, Share2 } from "lucide-react";

export const ActivityTimeline: React.FC = () => {
  const { activity, loading } = useNotesDashboard();

  const getActionIcon = (type: string) => {
    switch (type) {
      case "created":
        return <div className="p-1 bg-emerald-500/20 text-emerald-400 rounded-lg"><Plus className="w-3.5 h-3.5" /></div>;
      case "edited":
        return <div className="p-1 bg-blue-500/20 text-blue-400 rounded-lg"><Edit className="w-3.5 h-3.5" /></div>;
      case "shared":
        return <div className="p-1 bg-purple-500/20 text-purple-400 rounded-lg"><Share2 className="w-3.5 h-3.5" /></div>;
      default:
        return <div className="p-1 bg-neutral-500/20 text-neutral-400 rounded-lg"><History className="w-3.5 h-3.5" /></div>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-28 rounded-xl bg-white/5" />
        <div className="h-48 rounded-xl bg-white/5" />
      </div>
    );
  }

  // Find max values in chart to scale the bars
  const maxActions = Math.max(
    1,
    ...activity.chart.map(p => p.created + p.edited)
  );

  return (
    <div className="space-y-6">
      {/* 1. Bar Chart (CSS-Based) */}
      <div className="border border-white/10 rounded-2xl bg-neutral-900/50 p-4">
        <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-400" />
          Weekly Productivity
        </h4>
        
        <div className="h-28 flex items-end justify-between gap-2 px-2 mt-2">
          {activity.chart.map((point, idx) => {
            const total = point.created + point.edited;
            const createdHeight = (point.created / maxActions) * 100;
            const editedHeight = (point.edited / maxActions) * 100;
            const formattedDate = new Date(point.date).toLocaleDateString(undefined, { weekday: 'short' });

            return (
              <div key={idx} className="flex-1 flex flex-col items-center group relative">
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 bg-neutral-950 border border-white/10 text-white text-[10px] rounded-lg p-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  <p className="font-bold text-emerald-400">Created: {point.created}</p>
                  <p className="font-bold text-blue-400">Edited: {point.edited}</p>
                </div>

                {/* Vertical stacked bar */}
                <div className="w-4 md:w-6 bg-white/5 rounded-t-md overflow-hidden flex flex-col justify-end h-20 transition-all duration-300 group-hover:bg-white/10">
                  <div className="bg-emerald-500/80 w-full rounded-t-sm" style={{ height: `${createdHeight}%` }} />
                  <div className="bg-blue-500/80 w-full" style={{ height: `${editedHeight}%` }} />
                </div>

                <span className="text-[10px] text-neutral-500 font-bold mt-2 uppercase">{formattedDate}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Timeline Activity Feed */}
      <div className="border border-white/10 rounded-2xl bg-neutral-900/50 p-4">
        <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
          <History className="w-4 h-4 text-blue-400" />
          Recent Activity
        </h4>

        {activity.timeline.length === 0 ? (
          <p className="text-neutral-500 text-xs text-center py-6">No recent logs.</p>
        ) : (
          <div className="flex flex-col gap-3 max-h-[250px] overflow-y-auto pr-1 scrollbar-thin">
            {activity.timeline.map((act) => (
              <div key={act.id} className="flex items-start gap-3 p-2 hover:bg-white/5 rounded-xl transition-all duration-200">
                {getActionIcon(act.action_type)}
                <div className="flex-grow text-left">
                  <p className="text-white text-xs font-semibold leading-tight line-clamp-1">
                    {act.note_title || "Untitled Note"}
                  </p>
                  <p className="text-neutral-400 text-[10px] capitalize mt-0.5 font-medium">
                    {act.action_type} {act.note_type ? `(${act.note_type})` : ""}
                  </p>
                </div>
                <span className="text-[10px] text-neutral-500 font-bold whitespace-nowrap">
                  {new Date(act.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
