import React from "react";
import { Plus, CheckSquare, Mic, PenTool, Bot, Image } from "lucide-react";

interface QuickActionsBarProps {
  onNewNote: (type?: 'text' | 'checklist' | 'voice' | 'image' | 'drawing') => void;
  onOpenAi: () => void;
}

export const QuickActionsBar: React.FC<QuickActionsBarProps> = ({ onNewNote, onOpenAi }) => {
  const actions = [
    {
      label: "New Note",
      icon: <Plus className="w-5 h-5" />,
      onClick: () => onNewNote('text'),
      bgColor: "bg-blue-600 hover:bg-blue-500",
      textColor: "text-white"
    },
    {
      label: "New Checklist",
      icon: <CheckSquare className="w-5 h-5" />,
      onClick: () => onNewNote('checklist'),
      bgColor: "bg-white/5 border border-white/10 hover:bg-white/10",
      textColor: "text-neutral-200"
    },
    {
      label: "Voice Recording",
      icon: <Mic className="w-5 h-5" />,
      onClick: () => onNewNote('voice'),
      bgColor: "bg-white/5 border border-white/10 hover:bg-white/10",
      textColor: "text-neutral-200"
    },
    {
      label: "Draw Canvas",
      icon: <PenTool className="w-5 h-5" />,
      onClick: () => onNewNote('drawing'),
      bgColor: "bg-white/5 border border-white/10 hover:bg-white/10",
      textColor: "text-neutral-200"
    },
    {
      label: "Upload Image",
      icon: <Image className="w-5 h-5" />,
      onClick: () => onNewNote('image'),
      bgColor: "bg-white/5 border border-white/10 hover:bg-white/10",
      textColor: "text-neutral-200"
    },
    {
      label: "AI Copilot",
      icon: <Bot className="w-5 h-5 text-emerald-400" />,
      onClick: onOpenAi,
      bgColor: "bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20",
      textColor: "text-emerald-300"
    }
  ];

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {actions.map((act, idx) => (
        <button
          key={idx}
          onClick={act.onClick}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 cursor-pointer hover:-translate-y-0.5 ${act.bgColor} ${act.textColor}`}
        >
          {act.icon}
          {act.label}
        </button>
      ))}
    </div>
  );
};
