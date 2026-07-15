import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStatus } from '../../context/StatusContext';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { formatDistanceToNowStrict } from 'date-fns';
import { X, Play, Pause, Eye, Trash2, Send, Music } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseFormattedText } from '../../lib/formatParser';
import { StatusRing } from './StatusTray';

const QUICK_REACTIONS = ['😂', '😍', '😢', '👏', '🔥', '🎉'];
const STATUS_DURATION = 30000; // WhatsApp 30 seconds default

const FONT_PRESETS = [
  { id: 'sans', name: 'Default', family: `system-ui, -apple-system, sans-serif` },
  { id: 'serif', name: 'Serif', family: `Georgia, serif` },
  { id: 'cursive', name: 'Cursive', family: `"Comic Sans MS", cursive` },
  { id: 'mono', name: 'Mono', family: `monospace` },
  { id: 'impact', name: 'Impact', family: `'Impact', sans-serif` },
];

export default function StatusViewer() {
  const { feed, myStatuses, viewerOpen, closeViewer, nextStatus, prevStatus, markViewed, react, reply, deleteStatus } = useStatus();
  const { user, profile } = useAuth();
  const { setActiveConversationId } = useChat();

  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  
  // Single ref for both video and audio status nodes
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const pressStartRef = useRef<number>(0);
  const touchActiveRef = useRef(false);

  const handlePressStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (e.type === 'touchstart') {
      touchActiveRef.current = true;
    } else if (e.type === 'mousedown' && touchActiveRef.current) {
      return;
    }
    pressStartRef.current = Date.now();
    setPaused(true);
  };

  const handlePressEnd = (e: React.MouseEvent | React.TouchEvent, action: 'next' | 'prev') => {
    e.stopPropagation();
    if (e.type === 'touchend') {
      setTimeout(() => {
        touchActiveRef.current = false;
      }, 500);
    } else if (e.type === 'mouseup' && touchActiveRef.current) {
      return;
    }

    const duration = Date.now() - pressStartRef.current;
    setPaused(false);
    if (duration < 250) {
      if (action === 'next') nextStatus();
      else prevStatus();
    }
  };

  const { userIndex, statusIndex } = viewerOpen || {};
  
  const userEntry = userIndex === -1 && myStatuses && myStatuses.length > 0 
    ? {
        user_id: user?.id,
        display_name: 'My Status',
        avatar_url: profile?.avatar_url,
        statuses: myStatuses,
        has_unviewed: false
      }
    : (userIndex !== undefined && userIndex !== -1 ? feed[userIndex] : null);

  const status = userEntry && statusIndex !== undefined ? userEntry.statuses[statusIndex] : null;
  const isOwn = status?.user_id === user?.id;

  // Sync background music with play/pause state
  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    
    // Safety check: Pause background music if status is paused, closed, OR is video/audio type status
    const shouldPlayMusic = status && !paused && status.bg_music_url && status.type !== 'video' && status.type !== 'audio';
    
    if (shouldPlayMusic) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [status?.id, paused, status?.type, status?.bg_music_url]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
      }
    };
  }, []);

  // Mark viewed on open
  useEffect(() => {
    if (status && !status.has_viewed && !isOwn) {
      markViewed(status.id);
    }
    elapsedRef.current = 0;
    setProgress(0);
    setReplyText('');
    setShowViewers(false);
  }, [status?.id, markViewed, isOwn]);

  const getDuration = useCallback(() => {
    return STATUS_DURATION;
  }, []);

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
  }, [status?.id, nextStatus, getDuration]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (!status) return;

    if (status.type === 'video' || status.type === 'audio') {
      const media = mediaRef.current;
      if (media) {
        if (paused) {
          media.pause();
        } else {
          media.play().catch(() => {});
        }
      }
    }

    if (paused) {
      stopTimer();
    } else {
      startTimer();
    }

    return () => stopTimer();
  }, [paused, status?.id, startTimer, stopTimer]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextStatus();
      if (e.key === 'ArrowLeft') prevStatus();
      if (e.key === 'Escape') closeViewer();
      if (e.key === ' ') {
        e.preventDefault();
        setPaused(p => !p);
      }
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
    } catch (e) {
      console.error(e);
    }
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
      
      {/* Background music playing node */}
      {status.bg_music_url && (
        <audio 
          ref={musicAudioRef}
          src={status.bg_music_url} 
          loop
          className="hidden"
        />
      )}

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
        <div className="absolute top-8 left-0 right-0 px-4 flex items-center justify-between z-20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[46px] h-[46px] relative flex items-center justify-center shrink-0">
              <StatusRing 
                count={userEntry.statuses.length} 
                viewedCount={statusIndex || 0} 
                size={46} 
              />
              <div className="absolute inset-[3px] rounded-full overflow-hidden bg-gray-800">
                <img 
                  src={userEntry.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userEntry.user_id}`} 
                  alt="Avatar" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-white font-semibold text-sm shadow-black/50 drop-shadow-md truncate">
                {userEntry.display_name}
              </div>
              <div className="text-white/70 text-xs shadow-black/50 drop-shadow-md flex items-center gap-1.5 mt-0.5">
                <span>{formatDistanceToNowStrict(new Date(status.created_at), { addSuffix: true })}</span>
                {status.bg_music_url && (
                  <span className="bg-blue-600/30 text-blue-300 border border-blue-500/20 text-[9px] px-2 py-0.5 rounded-full truncate max-w-[120px] flex items-center gap-1" title={status.bg_music_title}>
                    <Music size={10} /> {status.bg_music_title}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
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
          style={status.type === 'text' ? bgStyle : undefined}
        >
          {status.type === 'text' && (
            <div 
              className="w-full px-6 flex items-center justify-center text-white font-medium break-words overflow-y-auto max-h-full" 
              style={{ 
                fontFamily: FONT_PRESETS.find(f => f.id === status.font_style)?.family || 'system-ui, sans-serif', 
                fontSize: `${status.font_size || 28}px`,
                textAlign: (status.text_align || 'center') as 'center' | 'left' | 'right',
                lineHeight: '1.3'
              }}
            >
              {parseFormattedText(status.content || '')}
            </div>
          )}

          {['image', 'gif'].includes(status.type) && status.media_url && (
            <img src={status.media_url} alt="Status" className="w-full h-full object-contain" />
          )}

          {status.type === 'video' && status.media_url && (
            <video 
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              src={status.media_url} 
              className="w-full h-full object-contain"
              playsInline
            />
          )}

          {status.type === 'audio' && status.media_url && (
            <div className="flex flex-col items-center gap-4 bg-gray-900/80 border border-gray-800 rounded-3xl p-8 max-w-[300px]">
              <div className="w-16 h-16 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Music size={32} className={paused ? '' : 'animate-spin'} style={{ animationDuration: '6s' }} />
              </div>
              <audio 
                ref={mediaRef as React.RefObject<HTMLAudioElement>}
                src={status.media_url}
                className="w-full mt-2"
              />
              {status.content && (
                <p className="text-gray-300 text-sm text-center font-medium mt-2 leading-relaxed max-h-[100px] overflow-y-auto no-scrollbar">
                  {status.content}
                </p>
              )}
            </div>
          )}

          {status.type === 'link' && status.link_url && (
            <div className="flex flex-col items-center gap-4 bg-indigo-950/40 border border-indigo-500/20 rounded-3xl p-6 max-w-[300px] text-center shadow-lg">
              <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Send size={28} />
              </div>
              <a 
                href={status.link_url} 
                target="_blank" 
                rel="noreferrer" 
                className="text-blue-400 hover:text-blue-300 font-semibold text-base break-all hover:underline line-clamp-2"
              >
                {status.link_title || status.link_url}
              </a>
              {status.content && (
                <p className="text-gray-300 text-xs leading-relaxed max-h-[80px] overflow-y-auto no-scrollbar">
                  {status.content}
                </p>
              )}
            </div>
          )}

          {/* Tap Zones - limited vertical height to prevent overlapping top header and bottom footer controls */}
          <div 
            className="absolute top-20 bottom-36 left-0 w-1/3 z-10" 
            onMouseDown={handlePressStart}
            onMouseUp={(e) => handlePressEnd(e, 'prev')}
            onTouchStart={handlePressStart}
            onTouchEnd={(e) => handlePressEnd(e, 'prev')}
          />
          <div 
            className="absolute top-20 bottom-36 right-0 w-2/3 z-10" 
            onMouseDown={handlePressStart}
            onMouseUp={(e) => handlePressEnd(e, 'next')}
            onTouchStart={handlePressStart}
            onTouchEnd={(e) => handlePressEnd(e, 'next')}
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
                  id="status-reply-input"
                  name="status-reply-input"
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
                ) : (status.viewers || []).map((v: { avatar_url?: string; id: string; display_name: string; viewed_at: string }, idx: number) => (
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
