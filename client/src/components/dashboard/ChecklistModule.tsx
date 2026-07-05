import React from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { cn } from "../../utils/cn";
import { Button } from "../common/Button";

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  indent: number; // 0, 1, 2, 3 levels
}

interface ChecklistModuleProps {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

export const ChecklistModule: React.FC<ChecklistModuleProps> = ({ items = [], onChange }) => {
  const handleAddItem = () => {
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text: "",
      completed: false,
      indent: 0,
    };
    onChange([...items, newItem]);
  };

  const handleUpdateItem = (id: string, updates: Partial<ChecklistItem>) => {
    const updated = items.map((item) => (item.id === id ? { ...item, ...updates } : item));
    onChange(updated);
  };

  const handleDeleteItem = (id: string) => {
    const updated = items.filter((item) => item.id !== id);
    onChange(updated);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...items];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    onChange(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index === items.length - 1) return;
    const updated = [...items];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    onChange(updated);
  };

  const handleIndent = (index: number, direction: "in" | "out") => {
    const item = items[index];
    const newIndent = direction === "in" ? Math.min(3, item.indent + 1) : Math.max(0, item.indent - 1);
    const updated = [...items];
    updated[index] = { ...item, indent: newIndent };
    onChange(updated);
  };

  // Progress calculations
  const total = items.length;
  const completed = items.filter((i) => i.completed).length;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress Bar Header */}
      <div className="bg-neutral-900/60 border border-white/5 rounded-2xl p-4 shadow-inner">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Progress</span>
          <span className="text-sm font-extrabold text-emerald-400">
            {completed} of {total} ({progressPercent}%)
          </span>
        </div>
        <div className="w-full bg-white/5 h-2.5 rounded-full overflow-hidden border border-white/5">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Checklist Items Container */}
      <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin">
        {items.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl bg-neutral-950/20">
            <p className="text-neutral-500 text-xs font-semibold">No items in your checklist yet.</p>
            <Button
              type="button"
              variant="ghost"
              onClick={handleAddItem}
              className="mt-3 text-xs text-emerald-400 hover:text-emerald-300 font-bold"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add your first item
            </Button>
          </div>
        ) : (
          items.map((item, idx) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-2.5 p-2 rounded-xl border border-white/5 bg-neutral-950/20 hover:bg-neutral-950/40 hover:border-white/10 transition-all group duration-200",
                item.indent === 1 && "ml-6",
                item.indent === 2 && "ml-12",
                item.indent === 3 && "ml-18"
              )}
            >
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => handleUpdateItem(item.id, { completed: !item.completed })}
                className={cn(
                  "w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer transition-all duration-200",
                  item.completed
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-white/20 hover:border-white/40 bg-white/5"
                )}
              >
                {item.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </button>

              {/* Text Input */}
              <input
                id={`check-item-${item.id}`}
                name={`check-item-${item.id}`}
                type="text"
                value={item.text}
                onChange={(e) => handleUpdateItem(item.id, { text: e.target.value })}
                placeholder="Checklist task..."
                className={cn(
                  "flex-grow bg-transparent border-none text-sm text-white focus:outline-none focus:ring-0 placeholder-neutral-600 transition-all",
                  item.completed && "line-through text-neutral-500 font-medium"
                )}
              />

              {/* Controls */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Indent Outdent */}
                <button
                  type="button"
                  disabled={item.indent === 0}
                  onClick={() => handleIndent(idx, "out")}
                  className="p-1 rounded hover:bg-white/5 text-neutral-500 hover:text-white cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Outdent"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={item.indent === 3}
                  onClick={() => handleIndent(idx, "in")}
                  className="p-1 rounded hover:bg-white/5 text-neutral-500 hover:text-white cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Indent"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {/* Move Up/Down */}
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMoveUp(idx)}
                  className="p-1 rounded hover:bg-white/5 text-neutral-500 hover:text-white cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Move Up"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === items.length - 1}
                  onClick={() => handleMoveDown(idx)}
                  className="p-1 rounded hover:bg-white/5 text-neutral-500 hover:text-white cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Move Down"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDeleteItem(item.id)}
                  className="p-1 rounded hover:bg-red-500/10 text-red-400 hover:text-red-300 cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Item Trigger */}
      {items.length > 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={handleAddItem}
          className="w-full flex items-center justify-center gap-1.5 border-white/10 hover:border-white/20 text-xs font-semibold py-2.5"
        >
          <Plus className="w-4 h-4" /> Add Item
        </Button>
      )}
    </div>
  );
};
