import React, { useState, useEffect } from "react";
import axios from "axios";
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || '';

interface CalendarNote {
  id: string;
  title: string;
  note_type: string;
  color?: string;
}

interface CalendarWidgetProps {
  onSelectNote: (id: string) => void;
}

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({ onSelectNote }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [notesMap, setNotesMap] = useState<Record<string, CalendarNote[]>>({});
  const [loading, setLoading] = useState(false);

  const fetchCalendarNotes = async (date: Date) => {
    setLoading(true);
    try {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const token = localStorage.getItem("token");
      
      const { data } = await axios.get(
        `${API_URL}/api/dashboard/notes/calendar?month=${year}-${month}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotesMap(data);
    } catch (err) {
      console.error("[CalendarWidget] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarNotes(currentDate);
  }, [currentDate]);

  const changeMonth = (offset: number) => {
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    setCurrentDate(next);
  };

  // Generate calendar days
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  
  const daysArray = [];
  // Empty slots for previous month offset
  for (let i = 0; i < firstDayIndex; i++) {
    daysArray.push(null);
  }
  // Days of month
  for (let d = 1; d <= lastDay; d++) {
    daysArray.push(d);
  }

  const monthName = currentDate.toLocaleString("default", { month: "long" });

  return (
    <div className="border border-white/10 rounded-2xl bg-neutral-900/50 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2">
          <CalIcon className="w-4 h-4 text-emerald-400" />
          Calendar ({monthName} {year})
        </h4>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => changeMonth(-1)}
            className="p-1 rounded hover:bg-white/5 text-neutral-400 hover:text-white cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => changeMonth(1)}
            className="p-1 rounded hover:bg-white/5 text-neutral-400 hover:text-white cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => (
          <span key={idx} className="text-[10px] font-bold text-neutral-500 uppercase py-1">{day}</span>
        ))}

        {daysArray.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="h-10" />;
          }

          const dayStr = String(day).padStart(2, "0");
          const monthStr = String(month + 1).padStart(2, "0");
          const dateKey = `${year}-${monthStr}-${dayStr}`;
          const dayNotes = notesMap[dateKey] || [];
          const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();

          return (
            <div
              key={`day-${day}`}
              className={`h-12 flex flex-col justify-between items-center p-1 rounded-lg border border-white/5 relative group transition-colors hover:bg-white/5 ${
                isToday ? "bg-emerald-500/10 border-emerald-500/30" : "bg-neutral-950/20"
              }`}
            >
              <span className={`text-[10px] font-bold leading-none ${isToday ? "text-emerald-400 font-extrabold" : "text-neutral-400"}`}>
                {day}
              </span>
              
              {/* Note markers */}
              <div className="flex gap-0.5 justify-center w-full overflow-hidden max-h-4">
                {dayNotes.slice(0, 3).map((note) => (
                  <button
                    key={note.id}
                    onClick={() => onSelectNote(note.id)}
                    className="w-1.5 h-1.5 rounded-full cursor-pointer hover:scale-125 transition-transform"
                    style={{ backgroundColor: note.color || "#3B82F6" }}
                    title={note.title || "Untitled"}
                  />
                ))}
                {dayNotes.length > 3 && (
                  <span className="text-[6px] text-neutral-500 font-extrabold leading-none">+{dayNotes.length - 3}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
