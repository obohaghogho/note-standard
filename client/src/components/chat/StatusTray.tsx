import React from 'react';
import { useStatus } from '../../context/StatusContext';
import { useAuth } from '../../context/AuthContext';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';

export default function StatusTray() {
  const { feed, openViewer, openCreator } = useStatus();
  const { user, profile } = useAuth();

  // Find own entry
  const myEntry = feed.find(u => u.user_id === user?.id);
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
            if (myEntry) openViewer(feed.indexOf(myEntry), 0);
            else openCreator();
          }}
        >
          <div className="relative">
            <div className={`w-[60px] h-[60px] rounded-full p-[2px] ${myEntry ? 'bg-gradient-to-tr from-blue-500 to-indigo-500' : 'bg-gray-800'}`}>
              <div className="w-full h-full rounded-full border-2 border-gray-950 overflow-hidden bg-gray-900 relative">
                {myEntry ? (
                  <StatusThumbnail status={myEntry.statuses[0]} />
                ) : (
                  <img 
                    src={profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`} 
                    alt="Me" 
                    className="w-full h-full object-cover opacity-80"
                  />
                )}
              </div>
            </div>
            
            <div className="absolute bottom-0 right-0 w-5 h-5 bg-blue-500 rounded-full border-2 border-gray-950 flex items-center justify-center shadow-sm">
              <Plus size={12} className="text-white" strokeWidth={3} />
            </div>
          </div>
          <span className="text-[11px] font-medium text-gray-300">My Status</span>
        </div>

        {/* Contact Statuses */}
        {sorted.map((entry, idx) => {
          const feedIdx = feed.indexOf(entry);
          const allViewed = !entry.has_unviewed;
          const latestStatus = entry.statuses[0];
          
          return (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: idx * 0.05 }}
              key={entry.user_id}
              className={`flex flex-col items-center gap-1.5 cursor-pointer shrink-0 snap-start group ${entry.is_muted ? 'opacity-50 grayscale' : ''}`}
              onClick={() => openViewer(feedIdx, 0)}
            >
              <div className={`w-[60px] h-[60px] rounded-full p-[2px] transition-colors duration-300 ${allViewed ? 'bg-gray-700' : 'bg-gradient-to-tr from-blue-500 to-purple-500'}`}>
                <div className="w-full h-full rounded-full border-2 border-gray-950 overflow-hidden bg-gray-900 relative group-active:scale-95 transition-transform">
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

function StatusThumbnail({ status, user }: { status: any, user?: any }) {
  if (!status) return null;

  let content = null;

  if (['image', 'video', 'gif', 'document'].includes(status.type) && status.media_url) {
    content = <img src={status.media_thumbnail || status.media_url} alt="Status" className="w-full h-full object-cover" />;
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
