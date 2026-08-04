import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface StatItemProps {
  label: string;
  value: number;
  delay?: number;
  onClick?: () => void;
}

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

  return <span>{displayValue.toLocaleString()}</span>;
};

const StatItem: React.FC<StatItemProps> = ({ label, value, delay = 0, onClick }) => {
  return (
    <motion.button 
      onClick={onClick}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="flex flex-col items-start px-2 py-2 sm:px-4 sm:py-3 rounded-2xl hover:bg-white/5 transition-colors text-left flex-1 min-w-0 border border-transparent hover:border-white/5"
    >
      <span className="text-xl sm:text-2xl md:text-3xl font-black text-white leading-none mb-1">
        <AnimatedCounter value={value} delay={delay} />
      </span>
      <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wide truncate w-full">
        {label}
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
    <div className="flex items-center gap-1 sm:gap-2 w-full pt-2">
      <StatItem label="Posts" value={postsCount} delay={0.1} onClick={() => onStatClick?.('posts')} />
      <StatItem label="Followers" value={followersCount} delay={0.15} onClick={() => onStatClick?.('followers')} />
      <StatItem label="Following" value={followingCount} delay={0.2} onClick={() => onStatClick?.('following')} />
      <StatItem label="Notes" value={notesCount} delay={0.25} onClick={() => onStatClick?.('notes')} />
      <StatItem label="Reads" value={notesCount * 14} delay={0.3} onClick={() => onStatClick?.('reads')} />
      <StatItem label="Likes" value={likesCount} delay={0.35} onClick={() => onStatClick?.('likes')} />
    </div>
  );
};
