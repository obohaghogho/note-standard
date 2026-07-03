import React from "react";
import { useNotesDashboard, DashboardWidget } from "../../context/NotesDashboardContext";
import { Eye, EyeOff, Layout, ArrowUp, ArrowDown } from "lucide-react";

export const LayoutCustomizer: React.FC = () => {
  const { widgets, updateWidgetLayout } = useNotesDashboard();

  const handleToggleVisibility = async (widgetName: string) => {
    const updated = widgets.map(w => 
      w.widget === widgetName ? { ...w, visible: !w.visible } : w
    );
    await updateWidgetLayout(updated);
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === widgets.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...widgets];
    
    // Swap positions
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;

    // Re-index positions
    const final = updated.map((w, idx) => ({ ...w, position: idx + 1 }));
    await updateWidgetLayout(final);
  };

  const handleWidthChange = async (widgetName: string, width: 'full' | 'half') => {
    const updated = widgets.map(w => 
      w.widget === widgetName ? { ...w, width } : w
    );
    await updateWidgetLayout(updated);
  };

  return (
    <div className="border border-white/10 rounded-2xl bg-neutral-900/50 p-4 space-y-4">
      <h4 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2">
        <Layout className="w-4 h-4 text-emerald-400" />
        Configure Dashboard Widgets
      </h4>

      <div className="flex flex-col gap-2">
        {widgets.map((w, idx) => (
          <div
            key={w.widget}
            className="flex items-center justify-between p-3 bg-neutral-950/40 border border-white/5 rounded-xl hover:border-white/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-neutral-500 font-bold text-xs">#{idx + 1}</span>
              <span className="text-white text-xs font-semibold capitalize">{w.widget}</span>
            </div>

            <div className="flex items-center gap-3">
              {/* Width toggle */}
              <select
                value={w.width}
                onChange={(e) => handleWidthChange(w.widget, e.target.value as 'full' | 'half')}
                className="bg-neutral-900 border border-white/10 rounded-lg text-neutral-300 text-[10px] font-bold px-2 py-1 focus:outline-none"
              >
                <option value="full">Full Width</option>
                <option value="half">Half Width</option>
              </select>

              {/* Position controls */}
              <div className="flex items-center gap-0.5">
                <button
                  disabled={idx === 0}
                  onClick={() => handleMove(idx, 'up')}
                  className="p-1 rounded hover:bg-white/5 text-neutral-500 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={idx === widgets.length - 1}
                  onClick={() => handleMove(idx, 'down')}
                  className="p-1 rounded hover:bg-white/5 text-neutral-500 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Visibility toggle */}
              <button
                onClick={() => handleToggleVisibility(w.widget)}
                className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                  w.visible ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-neutral-900 text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {w.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
