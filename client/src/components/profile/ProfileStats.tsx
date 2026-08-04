import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Book, Eye, PenTool, Users, UserPlus, Heart } from 'lucide-react';

interface StatItemProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  delay?: number;
  highlight?: boolean;
  onClick?: () => void;
}

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
};

const AnimatedCounter: React.FC<{ value: number; delay: number }> = ({ value, delay }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number;
    const duration = 1200; // 1.2s
    
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
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`flex flex-col items-start p-3 sm:p-4 rounded-2xl transition-colors text-left flex-1 min-w-[90px] snap-start border ${
        highlight 
          ? 'bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20' 
          : 'bg-transparent hover:bg-white/5 border-transparent hover:border-white/5'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className={highlight ? 'text-indigo-400' : 'text-gray-400'}>{icon}</span>
        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-gray-400">
          {label}
        </span>
      </div>
      <span className={`text-2xl sm:text-3xl font-black leading-none ${highlight ? 'text-indigo-100' : 'text-white'}`}>
        <AnimatedCounter value={value} delay={delay} />
      </span>
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
    <div className="flex items-center gap-2 sm:gap-3 w-full pt-2 pb-2 overflow-x-auto scrollbar-hide snap-x">
      <StatItem 
        label="Notes" 
        value={notesCount} 
        icon={<Book size={14} />} 
        delay={0.1} 
        highlight
        onClick={() => onStatClick?.('notes')} 
      />
      <StatItem 
        label="Reads" 
        value={notesCount * 14} 
        icon={<Eye size={14} />} 
        delay={0.15} 
        highlight
        onClick={() => onStatClick?.('reads')} 
      />
      <StatItem 
        label="Posts" 
        value={postsCount} 
        icon={<PenTool size={14} />} 
        delay={0.2} 
        onClick={() => onStatClick?.('posts')} 
      />
      <StatItem 
        label="Followers" 
        value={followersCount} 
        icon={<Users size={14} />} 
        delay={0.25} 
        onClick={() => onStatClick?.('followers')} 
      />
      <StatItem 
        label="Following" 
        value={followingCount} 
        icon={<UserPlus size={14} />} 
        delay={0.3} 
        onClick={() => onStatClick?.('following')} 
      />
      <StatItem 
        label="Likes" 
        value={likesCount} 
        icon={<Heart size={14} />} 
        delay={0.35} 
        onClick={() => onStatClick?.('likes')} 
      />
    </div>
  );
};
