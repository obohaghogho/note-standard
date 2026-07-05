import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStatus } from '../../../context/StatusContext';
import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import { formatDistanceToNowStrict } from 'date-fns';
import { X, Play, Pause, Eye, Trash2, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const QUICK_REACTIONS = ['😂', '😍', '😢', '👏', '🔥', '🎉'];
const STATUS_DURATION = 5000;

export default function StatusViewer() {
  const { feed, viewerOpen, closeViewer, nextStatus, prevStatus, markViewed, react, reply, deleteStatus } = useStatus();
  const { user } = useAuth();
  const { setActiveConversationId, startConversation } = useChat();
  const navigate = useNavigate();

  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { userIndex, statusIndex } = viewerOpen || {};
  const userEntry = userIndex !== undefined ? feed[userIndex] : null;
  const status = userEntry && statusIndex !== undefined ? userEntry.statuses[statusIndex] : null;
  const isOwn = status?.user_id === user?.id;

  // Mark viewed on open
  useEffect(() => {
    if (status && !isOwn && !status.has_viewed) {
      markViewed(status.id);
    }
    elapsedRef.current = 0;
    setProgress(0);
    setReplyText('');
    setShowViewers(false);
  }, [status?.id, isOwn, markViewed]);

  const getDuration = () => {
    if (status?.type === 'video' && videoRef.current?.duration) {
      return videoRef.current.duration * 1000;
    }
    return STATUS_DURATION;
  };

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    startTimeRef.current = Date.now() - elapsedRef.current;
    
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - (startTimeRef.current || 0);
      const duration = getDuration();
      const pct = Math.min((elapsed / duration) * 100, 100);
      
      setProgress(pct);
      
      if (pct >= 100) {
        if (timerRef.current) clearInterval(timerRef.current);
        elapsedRef.current = 0;
        nextStatus();
      } else {
        elapsedRef.current = elapsed;
      }
    }, 50);
  }, [status?.id, nextStatus]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (!status) return;
    if (paused) {
      stopTimer();
      videoRef.current?.pause();
    } else {
      startTimer();
      if (status.type === 'video') videoRef.current?.play().catch(() => {});
    }
    return () => stopTimer();
  }, [paused, status?.id, startTimer, stopTimer]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextStatus();
      if (e.key === 'ArrowLeft') prevStatus();
      if (e.key === 'Escape') closeViewer();
      if (e.key === ' ') setPaused(p => !p);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nextStatus, prevStatus, closeViewer]);

  const handleReply = async () => {
    if (!replyText.trim() || sending || !status) return;
    setSending(true);
    try {
      const convId = await reply(status.id, replyText.trim());
      setReplyText('');
      closeViewer();
      setActiveConversationId(convId);
      toast.success('Reply sent!');
    } catch {
      toast.error('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (emoji: string) => {
    if (!status) return;
    try {
      await react(status.id, emoji);
      toast.success(emoji);
    } catch {}
  };

  const handleDelete = async () => {
    if (!status) return;
    if (!window.confirm('Delete this status?')) return;
    await deleteStatus(status.id);
    closeViewer();
    toast.success('Status deleted');
  };

  if (!status || !userEntry) return null;

  const bgStyle = status.bg_gradient
    ? { background: status.bg_gradient }
    : { backgroundColor: status.bg_color || '#1a1a2e' };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col md:flex-row items-center justify-center">
      <div className="w-full h-full md:w-[400px] md:h-[800px] md:max-h-[90vh] bg-black relative md:rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        
        {/* Progress Bars */}
        <div className="absolute top-0 left-0 right-0 p-3 flex gap-1 z-20">
          {userEntry.statuses.map((_, i) => (
            <div key={i} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full"
                style={{
                  width: i < (statusIndex || 0) ? '100%' : i === statusIndex ? `${progress}%` : '0%',
                  transitionDuration: i === statusIndex && !paused ? '50ms' : '0ms'
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-4 left-0 right-0 px-4 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <img 
              src={userEntry.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userEntry.user_id}`} 
              alt="Avatar" 
              className="w-10 h-10 rounded-full border border-white/20 object-cover bg-gray-800"
            />
            <div>
              <div className="text-white font-semibold text-sm shadow-black/50 drop-shadow-md">
                {userEntry.display_name}
              </div>
              <div className="text-white/70 text-xs shadow-black/50 drop-shadow-md">
                {formatDistanceToNowStrict(new Date(status.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => setPaused(p => !p)} className="text-white drop-shadow-md active:scale-90 transition-transform">
              {paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
            </button>
            <button onClick={closeViewer} className="text-white drop-shadow-md active:scale-90 transition-transform">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div 
          className="flex-1 relative w-full h-full flex items-center justify-center select-none"
          style={bgStyle}
        >
          {status.type === 'text' && (
            <div className="px-8 text-center text-white text-3xl font-bold leading-tight break-words" style={{ fontFamily: status.font_style, fontSize: `${status.font_size}px` }}>
              {status.content}
            </div>
          )}

          {['image', 'gif'].includes(status.type) && status.media_url && (
            <img src={status.media_url} alt="Status" className="w-full h-full object-contain" />
          )}

          {status.type === 'video' && status.media_url && (
            <video 
              ref={videoRef}
              src={status.media_url} 
              className="w-full h-full object-contain"
              playsInline
              onEnded={nextStatus}
            />
          )}

          {/* Tap Zones */}
          <div 
            className="absolute inset-y-0 left-0 w-1/3 z-10" 
            onClick={(e) => { e.stopPropagation(); prevStatus(); }}
            onMouseDown={() => setPaused(true)}
            onMouseUp={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
          />
          <div 
            className="absolute inset-y-0 right-0 w-2/3 z-10" 
            onClick={(e) => { e.stopPropagation(); nextStatus(); }}
            onMouseDown={() => setPaused(true)}
            onMouseUp={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
          />
        </div>

        {/* Footer (Replies / Viewers) */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-20">
          {isOwn ? (
            <div className="flex justify-between items-center px-2">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowViewers(true); setPaused(true); }}
                className="flex flex-col items-center text-white active:scale-95 transition-transform"
              >
                <Eye size={24} className="mb-1" />
                <span className="text-xs font-semibold">{status.view_count || 0}</span>
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                className="text-red-400 p-2 active:scale-95 transition-transform"
              >
                <Trash2 size={22} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 relative z-30" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-center gap-4">
                {QUICK_REACTIONS.map(emoji => (
                  <button 
                    key={emoji} 
                    onClick={() => handleReact(emoji)}
                    className="text-3xl hover:scale-125 active:scale-90 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center bg-black/40 backdrop-blur-md rounded-full px-4 py-2 border border-white/10 focus-within:border-white/40 focus-within:bg-black/60 transition-colors">
                <input
                  type="text"
                  placeholder="Reply..."
                  className="flex-1 bg-transparent text-white placeholder-white/50 focus:outline-none text-sm"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onFocus={() => setPaused(true)}
                  onBlur={() => setPaused(false)}
                  onKeyDown={e => e.key === 'Enter' && handleReply()}
                />
                <button onClick={handleReply} disabled={!replyText.trim() || sending} className="text-blue-400 disabled:opacity-50">
                  <Send size={18} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Viewers Bottom Sheet Overlay */}
        {showViewers && (
          <div className="absolute inset-0 z-50 bg-black/50 flex flex-col justify-end" onClick={(e) => { e.stopPropagation(); setShowViewers(false); setPaused(false); }}>
            <div className="bg-gray-900 rounded-t-3xl h-[60%] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <Eye size={18} /> {status.view_count || 0} Views
                </h3>
                <button onClick={() => { setShowViewers(false); setPaused(false); }} className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-full">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                {(status.viewers || []).length === 0 ? (
                  <div className="text-center text-gray-500 mt-10">No views yet</div>
                ) : (status.viewers || []).map((v: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3">
                    <img 
                      src={v.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${v.id}`} 
                      alt="" 
                      className="w-10 h-10 rounded-full bg-gray-800"
                    />
                    <div className="flex-1">
                      <div className="text-white font-medium text-sm">{v.display_name}</div>
                      <div className="text-gray-400 text-xs">{formatDistanceToNowStrict(new Date(v.viewed_at), { addSuffix: true })}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
