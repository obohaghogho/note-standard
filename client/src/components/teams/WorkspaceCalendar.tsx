import React, { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Video, CheckSquare } from 'lucide-react';
import { getMeetings, getProjects } from '../../lib/collaborationApi';
import type { Meeting, Project } from '../../types/collaboration';

interface WorkspaceCalendarProps {
  teamId: string;
}

export const WorkspaceCalendar: React.FC<WorkspaceCalendarProps> = ({ teamId }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
      setLoading(true);
      try {
        const [meetingsData, projectsData] = await Promise.all([
          getMeetings(teamId).catch(() => []),
          getProjects(teamId).catch(() => [])
        ]);
        setMeetings(meetingsData);
        setProjects(projectsData);
      } catch {
        console.error('Failed to load events');
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, [teamId]);

  // Calendar dates generation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const prevMonthDays = new Date(year, month, 0).getDate();

  const days: { date: Date; isCurrentMonth: boolean; events: any[] }[] = [];

  // Previous month filler days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    days.push({ date: d, isCurrentMonth: false, events: [] });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    
    // Filter events happening on this date
    const dayEvents: any[] = [];
    
    meetings.forEach(m => {
      const meetDate = new Date(m.scheduled_at);
      if (meetDate.toDateString() === d.toDateString()) {
        dayEvents.push({ type: 'meeting', title: m.title, time: meetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), raw: m });
      }
    });

    projects.forEach(p => {
      if (p.due_date) {
        const projDate = new Date(p.due_date);
        if (projDate.toDateString() === d.toDateString()) {
          dayEvents.push({ type: 'project', title: p.name, raw: p });
        }
      }
    });

    days.push({ date: d, isCurrentMonth: true, events: dayEvents });
  }

  // Next month filler days
  const totalSlots = 42; // 6 rows * 7 columns
  const nextMonthFiller = totalSlots - days.length;
  for (let i = 1; i <= nextMonthFiller; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: d, isCurrentMonth: false, events: [] });
  }

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  return (
    <div className="p-6 md:p-8 space-y-6 overflow-y-auto h-full scrollbar-hide bg-black text-white">
      {/* Header bar */}
      <div className="flex justify-between items-center border-b border-white/5 pb-4">
        <div>
          <h3 className="text-lg font-black italic uppercase tracking-tight flex items-center gap-2">
            <CalendarIcon size={18} className="text-primary" /> Workspace Calendar
          </h3>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Track meetings, project deadlines, and workspace milestones</p>
        </div>

        <div className="flex items-center gap-4 bg-white/5 border border-white/5 px-4 py-2 rounded-2xl">
          <button onClick={prevMonth} className="p-1 hover:text-primary transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-black uppercase tracking-wider min-w-[100px] text-center">
            {monthNames[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-1 hover:text-primary transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex items-center justify-center text-gray-500 uppercase tracking-widest text-xs font-black">
          Syncing Calendar Events...
        </div>
      ) : (
        /* Calendar Grid */
        <div className="border border-white/5 rounded-[2.5rem] bg-white/[0.01] overflow-hidden shadow-2xl">
          <div className="grid grid-cols-7 border-b border-white/5 bg-white/5 py-4 text-center text-[9px] font-black text-gray-500 uppercase tracking-widest">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>
          <div className="grid grid-cols-7 grid-rows-6 divide-x divide-y divide-white/5 border-l border-t border-white/5">
            {days.map((day, idx) => (
              <div 
                key={idx} 
                className={`min-h-[100px] p-3 flex flex-col justify-between transition-colors hover:bg-white/[0.02] ${
                  day.isCurrentMonth ? '' : 'opacity-25'
                }`}
              >
                <div className="text-right text-[10px] font-black text-gray-500">{day.date.getDate()}</div>
                <div className="space-y-1.5 mt-2 flex-1 overflow-y-auto scrollbar-hide max-h-[70px]">
                  {day.events.map((ev, evIdx) => (
                    <div 
                      key={evIdx} 
                      className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold truncate flex items-center gap-1.5 ${
                        ev.type === 'meeting' 
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                          : 'bg-primary/10 text-primary border border-primary/20'
                      }`}
                      title={ev.title}
                    >
                      {ev.type === 'meeting' ? <Video size={10} /> : <CheckSquare size={10} />}
                      <span>{ev.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
export default WorkspaceCalendar;
