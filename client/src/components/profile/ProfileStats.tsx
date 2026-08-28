import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Book, PenTool, Users, UserPlus, Heart } from 'lucide-react';

interface StatItemProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  delay?: number;
  highlight?: boolean;
  onClick?: () => void;
}

const formatNumber = (num: number) => {
  return new Intl.NumberFormat('en-US', { 
    notation: 'compact', 
    maximumFractionDigits: 1 
  }).format(num);
};

const AnimatedCounter: React.FC<{ value: number; delay: number }> = ({ value, delay }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number;
    const duration = 1000;
    
    const timeout = setTimeout(() => {
      const step = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 4);
        setDisplayValue(Math.floor(easeOut * value));
        
        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          setDisplayValue(value);
        }
      };
      window.requestAnimationFrame(step);
    }, delay * 1000);

    return () => clearTimeout(timeout);
  }, [value, delay]);

  return <span>{formatNumber(displayValue)}</span>;
};

const StatItem: React.FC<StatItemProps> = ({ label, value, icon, delay = 0, highlight, onClick }) => {
  return (
    <motion.button 
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={`flex flex-col items-center justify-center py-2.5 px-1 sm:px-3 rounded-2xl transition-all text-center flex-1 min-w-0 border ${
        highlight 
          ? 'bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30' 
          : 'bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/10'
      }`}
    >
      <span className={`text-lg sm:text-2xl font-black leading-tight truncate w-full ${highlight ? 'text-indigo-300' : 'text-white'}`}>
        <AnimatedCounter value={value} delay={delay} />
      </span>
      <div className="flex items-center gap-1 mt-1 justify-center w-full min-w-0">
        <span className={`shrink-0 ${highlight ? 'text-indigo-400' : 'text-gray-400'}`}>{icon}</span>
        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-400 truncate">
          {label}
        </span>
      </div>
    </motion.button>
  );
};

interface ProfileStatsProps {
  postsCount: number;
  followersCount: number;
  followingCount: number;
  notesCount?: number;
  likesCount?: number;
  onStatClick?: (stat: string) => void;
}

export const ProfileStats: React.FC<ProfileStatsProps> = ({ 
  postsCount, 
  followersCount, 
  followingCount, 
  notesCount = 0, 
  likesCount = 0,
  onStatClick
}) => {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-3 w-full py-3 px-1 bg-gray-900/40 rounded-2xl border border-white/5">
      <StatItem 
        label="Notes" 
        value={notesCount} 
        icon={<Book size={12} />} 
        delay={0.05} 
        highlight
        onClick={() => onStatClick?.('notes')} 
      />
      <StatItem 
        label="Posts" 
        value={postsCount} 
        icon={<PenTool size={12} />} 
        delay={0.1} 
        onClick={() => onStatClick?.('posts')} 
      />
      <StatItem 
        label="Followers" 
        value={followersCount} 
        icon={<Users size={12} />} 
        delay={0.15} 
        onClick={() => onStatClick?.('followers')} 
      />
      <StatItem 
        label="Following" 
        value={followingCount} 
        icon={<UserPlus size={12} />} 
        delay={0.2} 
        onClick={() => onStatClick?.('following')} 
      />
      <StatItem 
        label="Likes" 
        value={likesCount} 
        icon={<Heart size={12} />} 
        delay={0.25} 
        onClick={() => onStatClick?.('likes')} 
      />
    </div>
  );
};
