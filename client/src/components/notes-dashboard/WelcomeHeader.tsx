import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNotesDashboard } from "../../context/NotesDashboardContext";
import { Sun, Moon, CloudRain, Flame, Calendar, Award } from "lucide-react";

export const WelcomeHeader: React.FC = () => {
  const { user } = useAuth();
  const { streak, stats } = useNotesDashboard();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hrs = time.getHours();
    if (hrs < 12) return { text: "Good morning", icon: <Sun className="w-6 h-6 text-amber-400" /> };
    if (hrs < 18) return { text: "Good afternoon", icon: <Sun className="w-6 h-6 text-orange-400" /> };
    return { text: "Good evening", icon: <Moon className="w-6 h-6 text-indigo-400" /> };
  };

  const greeting = getGreeting();
  const dateOptions: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  const formattedDate = time.toLocaleDateString(undefined, dateOptions);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-neutral-900/90 to-neutral-950/90 p-6 shadow-xl backdrop-blur-md">
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {greeting.icon}
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
              {greeting.text}, {user?.username || "Writer"}!
            </h1>
          </div>
          <p className="text-neutral-400 text-sm md:text-base font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            {formattedDate}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {/* Streak Stats */}
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl backdrop-blur-sm hover:bg-white/10 transition-all duration-300">
            <div className="p-2 rounded-lg bg-orange-500/20">
              <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Writing Streak</p>
              <p className="text-base font-bold text-white leading-none mt-0.5">{streak} {streak === 1 ? 'day' : 'days'}</p>
            </div>
          </div>

          {/* Productivity Level */}
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl backdrop-blur-sm hover:bg-white/10 transition-all duration-300">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Award className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Productivity Tier</p>
              <p className="text-base font-bold text-white leading-none mt-0.5">
                {(stats?.total || 0) > 50 ? "Grandmaster" : (stats?.total || 0) > 10 ? "Initiate" : "Novice"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
