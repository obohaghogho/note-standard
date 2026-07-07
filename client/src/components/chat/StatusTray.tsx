import React from 'react';
import { useStatus } from '../../context/StatusContext';
import { useAuth } from '../../context/AuthContext';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';

function StatusRing({ count, viewedCount, size = 60 }: { count: number; viewedCount: number; size?: number }) {
  if (count === 0) return null;
  if (count === 1) {
    const color = viewedCount === count ? 'stroke-gray-700' : 'stroke-blue-500';
    return (
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - 4) / 2}
          className={`${color} fill-none`}
          strokeWidth="2.5"
        />
      </svg>
    );
  }

  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 3; // Gap size in pixels
  const segmentLength = (circumference - (count * gap)) / count;

  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90">
      {Array.from({ length: count }).map((_, i) => {
        const isViewed = i < viewedCount;
        const color = isViewed ? 'stroke-gray-700' : 'stroke-blue-500';
        const offset = i * (segmentLength + gap);
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className={`${color} fill-none transition-all duration-300`}
            strokeWidth="2.5"
            strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
            strokeDashoffset={-offset}
          />
        );
      })}
    </svg>
  );
}

export default function StatusTray() {
  const { feed, myStatuses, openViewer, openCreator } = useStatus();
  const { user, profile } = useAuth();

  const myViewedCount = myStatuses ? myStatuses.filter(s => s.has_viewed).length : 0;
  const myHasUnviewed = myStatuses ? myStatuses.some(s => !s.has_viewed) : false;

  // Construct own entry from myStatuses
  const myEntry = myStatuses && myStatuses.length > 0 ? {
    user_id: user?.id,
    display_name: 'My Status',
    avatar_url: profile?.avatar_url,
    statuses: myStatuses,
    has_unviewed: myHasUnviewed
  } : null;

  const others = feed.filter(u => u.user_id !== user?.id);

  // Sort: unviewed first, then viewed, then muted
  const sorted = [
    ...others.filter(u => !u.is_muted && u.has_unviewed),
    ...others.filter(u => !u.is_muted && !u.has_unviewed),
    ...others.filter(u => u.is_muted),
  ];

  return (
    <div className="py-3 px-4 border-b border-gray-800/50 bg-gray-950/40">
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 pt-1 items-center snap-x">
        
        {/* My Status */}
        <div 
          className="flex flex-col items-center gap-1.5 cursor-pointer shrink-0 snap-start group"
          onClick={() => {
            if (myEntry) {
              // Find the first unviewed own status, otherwise default to 0 (oldest)
              const firstUnviewed = myStatuses.findIndex(s => !s.has_viewed);
              const startIdx = firstUnviewed === -1 ? 0 : firstUnviewed;
              openViewer(-1, startIdx);
            }
            else openCreator();
          }}
        >
          <div className="relative">
            <div className="w-[60px] h-[60px] relative">
              {myEntry ? (
                <StatusRing 
                  count={myEntry.statuses.length} 
                  viewedCount={myViewedCount} 
                  size={60} 
                />
              ) : (
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-gray-800" />
              )}
              <div className="absolute inset-[3px] rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                {myEntry ? (
                  <StatusThumbnail status={myEntry.statuses[myEntry.statuses.length - 1]} />
                ) : (
                  <img 
                    src={profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`} 
                    alt="Me" 
                    className="w-full h-full object-cover opacity-80"
                  />
                )}
              </div>
            </div>
            
            <div 
              className="absolute bottom-0 right-0 w-5 h-5 bg-blue-500 rounded-full border-2 border-gray-950 flex items-center justify-center shadow-sm hover:bg-blue-400 active:scale-95 transition-transform"
              onClick={(e) => {
                e.stopPropagation();
                openCreator();
              }}
            >
              <Plus size={12} className="text-white" strokeWidth={3} />
            </div>
          </div>
          <span className="text-[11px] font-medium text-gray-300">My Status</span>
        </div>

        {/* Contact Statuses */}
        {sorted.map((entry, idx) => {
          const feedIdx = feed.indexOf(entry);
          const latestStatus = entry.statuses[entry.statuses.length - 1];
          const viewedCount = entry.statuses.filter(s => s.has_viewed).length;
          
          return (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: idx * 0.05 }}
              key={entry.user_id}
              className={`flex flex-col items-center gap-1.5 cursor-pointer shrink-0 snap-start group ${entry.is_muted ? 'opacity-50 grayscale' : ''}`}
              onClick={() => {
                const firstUnviewed = entry.statuses.findIndex(s => !s.has_viewed);
                const startIdx = firstUnviewed === -1 ? 0 : firstUnviewed;
                openViewer(feedIdx, startIdx);
              }}
            >
              <div className="w-[60px] h-[60px] relative">
                <StatusRing 
                  count={entry.statuses.length} 
                  viewedCount={viewedCount} 
                  size={60} 
                />
                <div className="absolute inset-[3px] rounded-full overflow-hidden bg-gray-900 group-active:scale-95 transition-transform">
                  <StatusThumbnail status={latestStatus} user={entry} />
                </div>
              </div>
              <span className="text-[11px] font-medium text-gray-400 w-14 truncate text-center">
                {entry.display_name?.split(' ')[0] || 'User'}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function StatusThumbnail({ status, user }: { 
  status: { type: string; media_url?: string; media_thumbnail?: string; bg_gradient?: string; bg_color?: string; content?: string; link_image?: string; font_style?: string }; 
  user?: { avatar_url?: string; user_id?: string; display_name?: string } 
}) {
  if (!status) return null;

  let content = null;

  if (['image', 'video', 'gif', 'document'].includes(status.type) && status.media_url) {
    const imgUrl = status.type === 'video' ? status.media_url.replace(/\.[^/.]+$/, '.jpg') : status.media_url;
    content = <img src={status.media_thumbnail || imgUrl} alt="Status" className="w-full h-full object-cover" />;
  } else if (status.type === 'audio') {
    content = <div className="w-full h-full bg-blue-500 flex items-center justify-center text-xl">🎵</div>;
  } else if (status.type === 'text') {
    const bg = status.bg_gradient ? { background: status.bg_gradient } : { backgroundColor: status.bg_color };
    content = (
      <div style={bg} className="w-full h-full flex items-center justify-center p-1">
        <span className="text-[8px] text-white text-center leading-tight line-clamp-3 overflow-hidden break-all font-medium" style={{ fontFamily: status.font_style }}>
          {status.content}
        </span>
      </div>
    );
  } else if (status.type === 'link') {
    content = status.link_image ? (
      <img src={status.link_image} alt="Link" className="w-full h-full object-cover" />
    ) : (
      <div className="w-full h-full bg-indigo-500 flex items-center justify-center text-xl">🔗</div>
    );
  }

  return (
    <>
      {content}
      {user && (
        <div className="absolute bottom-0 right-0 w-[18px] h-[18px] rounded-full border-2 border-gray-900 overflow-hidden bg-gray-800">
          <img 
            src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.user_id}`} 
            alt="Avatar" 
            className="w-full h-full object-cover" 
          />
        </div>
      )}
    </>
  );
}
