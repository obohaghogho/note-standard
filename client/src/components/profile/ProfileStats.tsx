import React, { useEffect, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';

interface StatItemProps {
  label: string;
  value: number;
  delay?: number;
}

const AnimatedCounter: React.FC<{ value: number; delay: number }> = ({ value, delay }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number;
    const duration = 1500; // 1.5s
    
    // Slight delay before counting
    const timeout = setTimeout(() => {
      const step = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        
        // Easing out quart
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

const StatItem: React.FC<StatItemProps> = ({ label, value, delay = 0 }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="flex flex-col items-center sm:items-start p-3 sm:p-4 rounded-2xl bg-gray-900/40 hover:bg-gray-900 border border-transparent hover:border-gray-800 transition-colors w-full sm:w-auto flex-1 min-w-[80px]"
    >
      <span className="text-2xl sm:text-3xl font-bold text-white mb-1">
        <AnimatedCounter value={value} delay={delay} />
      </span>
      <span className="text-xs sm:text-sm font-medium text-gray-400 uppercase tracking-wider">{label}</span>
    </motion.div>
  );
};

interface ProfileStatsProps {
  postsCount: number;
  followersCount: number;
  followingCount: number;
  notesCount?: number;
  likesCount?: number;
}

export const ProfileStats: React.FC<ProfileStatsProps> = ({ 
  postsCount, 
  followersCount, 
  followingCount, 
  notesCount = 0, 
  likesCount = 0 
}) => {
  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-4 w-full">
      <StatItem label="Posts" value={postsCount} delay={0.1} />
      <StatItem label="Followers" value={followersCount} delay={0.2} />
      <StatItem label="Following" value={followingCount} delay={0.3} />
      <StatItem label="Notes" value={notesCount} delay={0.4} />
      <StatItem label="Likes" value={likesCount} delay={0.5} />
    </div>
  );
};
