import React from "react";
import { useNotesDashboard } from "../../context/NotesDashboardContext";
import { FileText, Pin, Share2, CheckSquare, Mic, Paperclip } from "lucide-react";

export const StatCardGrid: React.FC = () => {
  const { stats, loading } = useNotesDashboard();

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 KB";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const statItems = [
    {
      title: "Total Notes",
      value: stats?.total ?? 0,
      icon: <FileText className="w-5 h-5 text-blue-400" />,
      color: "from-blue-500/20 to-blue-600/5",
      borderColor: "border-blue-500/20"
    },
    {
      title: "Pinned Notes",
      value: stats?.pinned ?? 0,
      icon: <Pin className="w-5 h-5 text-amber-400" />,
      color: "from-amber-500/20 to-amber-600/5",
      borderColor: "border-amber-500/20"
    },
    {
      title: "Checklists",
      value: stats?.checklists ?? 0,
      icon: <CheckSquare className="w-5 h-5 text-emerald-400" />,
      color: "from-emerald-500/20 to-emerald-600/5",
      borderColor: "border-emerald-500/20"
    },
    {
      title: "Shared Notes",
      value: stats?.shared ?? 0,
      icon: <Share2 className="w-5 h-5 text-purple-400" />,
      color: "from-purple-500/20 to-purple-600/5",
      borderColor: "border-purple-500/20"
    },
    {
      title: "Voice Notes",
      value: stats?.voice ?? 0,
      icon: <Mic className="w-5 h-5 text-rose-400" />,
      color: "from-rose-500/20 to-rose-600/5",
      borderColor: "border-rose-500/20"
    },
    {
      title: "Attachments Size",
      value: formatSize(stats?.attachments_size ?? 0),
      icon: <Paperclip className="w-5 h-5 text-teal-400" />,
      color: "from-teal-500/20 to-teal-600/5",
      borderColor: "border-teal-500/20"
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {statItems.map((item, idx) => (
        <div
          key={idx}
          className={`relative overflow-hidden rounded-2xl border ${item.borderColor} bg-gradient-to-br ${item.color} p-4 shadow-md hover:scale-[1.02] transition-all duration-300`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">{item.title}</span>
            <div className="p-1.5 rounded-lg bg-white/5">{item.icon}</div>
          </div>
          {loading ? (
            <div className="h-8 w-12 bg-white/10 animate-pulse rounded-md mt-1" />
          ) : (
            <div className="text-2xl font-bold text-white tracking-tight mt-1">{item.value}</div>
          )}
        </div>
      ))}
    </div>
  );
};
