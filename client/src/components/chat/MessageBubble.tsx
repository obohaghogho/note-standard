import React, { memo } from 'react';
import { Check, CheckCheck, Video, Phone, Paperclip, Languages, Flag } from 'lucide-react';
import type { Message } from '../../context/ChatContext';
import ImageWithSignedUrl from '../common/ImageWithSignedUrl';
import VideoWithSignedUrl from '../common/VideoWithSignedUrl';
import { AudioPlayer } from './AudioPlayer';
import { useChatGesture } from '../../hooks/useChatGesture';
import { useChatTheme } from '../../context/ChatThemeContext';

interface MessageBubbleProps {
    msg: Message;
    isGrouped: boolean;
    isSelected: boolean;
    isSelectionMode: boolean;
    currentUserId?: string;
    translations: { [key: string]: string };
    showOriginal: { [key: string]: boolean };
    gesture: ReturnType<typeof useChatGesture>;
    getSenderName: (senderId: string) => string;
    toggleMessageSelection: (id: string) => void;
    setShowOriginal: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
    handleReport: (id: string, content: string, translation?: string) => void;
    handleManualTranslate: (id: string, content: string, original_language?: string) => void;
    fetchSignedUrl: (path: string) => Promise<string | null>;
    setPreviewMedia: (data: { url: string; type: 'image' | 'video'; fileName?: string; isSender?: boolean }) => void;
    onMediaLoad?: () => void;
}

const MessageBubble = memo(({
    msg,
    isGrouped,
    isSelected,
    isSelectionMode,
    currentUserId,
    translations,
    showOriginal,
    gesture,
    getSenderName,
    toggleMessageSelection,
    setShowOriginal,
    handleReport,
    handleManualTranslate,
    fetchSignedUrl,
    setPreviewMedia,
    onMediaLoad
}: MessageBubbleProps) => {
    const { activeTheme, customizer } = useChatTheme();
    const isSender = msg.sender_id === currentUserId;

    const fontClass = `chat-font-${customizer.typography.fontFamily}`;
    const glassClass = customizer.bubble.glassmorphism ? 'chat-glass-bubble' : '';
    const elevationClass = `chat-elevation-${customizer.bubble.elevation || 'subtle'}`;

    let background = activeTheme.colors.receivedBubbleBg || '#1E293B';
    let color = activeTheme.colors.receivedBubbleText || '#F1F5F9';
    let borderColor = activeTheme.colors.receivedBubbleBorder || 'rgba(255,255,255,0.08)';
    let isAlignedRight = false;

    switch (msg.sender_type) {
        case 'ai':
            background = '#0F172A';
            color = '#F1F5F9';
            borderColor = 'rgba(56,189,248,0.3)';
            isAlignedRight = false;
            break;
        case 'human':
            background = '#1E293B';
            color = '#F8FAFC';
            borderColor = 'rgba(129,140,248,0.3)';
            isAlignedRight = false;
            break;
        case 'system':
            background = 'transparent';
            color = activeTheme.colors.receivedBubbleText || '#94A3B8';
            isAlignedRight = false;
            break;
        case 'user':
        default:
            if (isSender) {
                background = activeTheme.colors.sentBubbleBg || '#3B82F6';
                color = activeTheme.colors.sentBubbleText || '#FFFFFF';
                borderColor = 'rgba(59,130,246,0.5)';
                isAlignedRight = true;
            } else {
                background = activeTheme.colors.receivedBubbleBg || '#1E293B';
                color = activeTheme.colors.receivedBubbleText || '#F1F5F9';
                borderColor = activeTheme.colors.receivedBubbleBorder || 'rgba(255,255,255,0.1)';
                isAlignedRight = false;
            }
            break;
    }

    // Dynamic bubble styles derived from active theme and customizer
    const bubbleStyle: React.CSSProperties = {
      borderRadius: `${customizer.bubble.borderRadius}px`,
      opacity: customizer.bubble.opacity,
      fontSize: `${customizer.typography.fontSize}px`,
      lineHeight: customizer.typography.lineHeight,
      letterSpacing: `${customizer.typography.letterSpacing}px`,
      background,
      color,
      borderColor,
    };

    return (
        <div 
            id={`msg-${msg.id}`}
            className={`flex px-3 md:px-4 w-full ${isAlignedRight ? 'justify-end' : (msg.sender_type === 'system' ? 'justify-center' : 'justify-start')} ${isGrouped ? '' : 'mt-3'} msg-bubble chat-bubble-animated ${fontClass}`}
            onTouchStart={(e) => gesture.onTouchStart(e, msg.id)}
            onTouchMove={gesture.onTouchMove}
            onTouchEnd={gesture.onTouchEnd}
            onTouchCancel={gesture.onTouchCancel}
            onMouseDown={(e) => gesture.onMouseDown(e, msg.id)}
            onMouseUp={gesture.onMouseUp}
            onMouseLeave={gesture.onMouseLeave}
            onClick={(e) => gesture.onClick(e, msg.id, isSelectionMode, toggleMessageSelection)}
            style={{ ...gesture.dragStartStyle, marginBottom: `${customizer.typography.bubbleSpacing}px` }}
        >
            {/* Selection checkbox indicator */}
            {isSelectionMode && (
                <div className={`flex items-center mr-2 flex-shrink-0 self-center transition-all duration-200 ${isSender ? 'order-2 ml-2 mr-0' : ''}`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                        isSelected 
                            ? 'bg-blue-500 border-blue-500 scale-110' 
                            : 'border-gray-500 bg-transparent hover:border-gray-400'
                    }`}>
                        {isSelected && (
                            <Check size={12} className="text-white animate-in zoom-in-0 duration-150" />
                        )}
                    </div>
                </div>
            )}
            <div 
                className={`max-w-[92%] md:max-w-[75%] p-3.5 md:p-4 border ${glassClass} ${elevationClass} ${
                    isSelected
                        ? 'ring-2 ring-blue-400 border-blue-400/50'
                        : ''
                } relative group transition-all duration-200 ${isSelectionMode ? 'cursor-pointer' : ''}`}
                style={bubbleStyle}
            >
                {msg.sender_type === 'ai' && !isGrouped && (
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                        <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px]">🤖</span>
                        </div>
                        <span className="text-xs font-bold opacity-90 tracking-wide uppercase">AI Assistant</span>
                    </div>
                )}
                
                {msg.sender_type === 'human' && !isGrouped && (
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                        <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px]">🎧</span>
                        </div>
                        <span className="text-xs font-bold opacity-90 tracking-wide uppercase">Support Specialist</span>
                    </div>
                )}
                {msg.reply_to?.id && (
                    <div 
                        className="mb-2 p-2.5 rounded-xl border-l-[3.5px] text-xs transition-all backdrop-blur-md cursor-pointer hover:bg-black/5"
                        style={{
                          background: isSender ? activeTheme.colors.replyBgSent : activeTheme.colors.replyBgReceived,
                          borderLeftColor: activeTheme.colors.primaryAccent,
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            const element = document.getElementById(`msg-${msg.reply_to?.id}`);
                            if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'ring-offset-transparent');
                                setTimeout(() => element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'ring-offset-transparent'), 2000);
                            }
                        }}
                    >
                        <p className="font-bold mb-0.5" style={{ color: activeTheme.colors.primaryAccent }}>
                            {getSenderName(msg.reply_to.sender_id)}
                        </p>
                        <p className="truncate opacity-80 leading-relaxed italic">
                            {msg.reply_to.content || (msg.reply_to.type && msg.reply_to.type !== 'text' ? `Shared a ${msg.reply_to.type}` : 'Message')}
                        </p>
                    </div>
                )}

                {/* WhatsApp-style Status Reply Card */}
                {msg.metadata?.status_reply && (
                    <div 
                        className="mb-2 rounded-xl overflow-hidden border border-white/10"
                        style={{
                            background: msg.metadata.status_reply.bg_gradient 
                                || msg.metadata.status_reply.bg_color 
                                || 'rgba(0,0,0,0.15)',
                        }}
                    >
                        {/* Status media preview */}
                        {msg.metadata.status_reply.media_url && ['image', 'gif'].includes(msg.metadata.status_reply.media_type || '') && (
                            <div className="relative w-full max-h-[200px] overflow-hidden">
                                <img 
                                    src={msg.metadata.status_reply.media_thumbnail || msg.metadata.status_reply.media_url}
                                    alt="Status" 
                                    className="w-full h-full object-cover"
                                    style={{ maxHeight: '200px' }}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            </div>
                        )}
                        {msg.metadata.status_reply.media_url && msg.metadata.status_reply.media_type === 'video' && (
                            <div className="relative w-full max-h-[200px] overflow-hidden bg-black/30 flex items-center justify-center" style={{ minHeight: '120px' }}>
                                {msg.metadata.status_reply.media_thumbnail ? (
                                    <img 
                                        src={msg.metadata.status_reply.media_thumbnail}
                                        alt="Video status" 
                                        className="w-full h-full object-cover"
                                        style={{ maxHeight: '200px' }}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                                        </div>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                <div className="absolute top-2 right-2 bg-black/40 rounded-full p-1 backdrop-blur-sm">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                                </div>
                            </div>
                        )}
                        {/* Text-only status with background color */}
                        {!msg.metadata.status_reply.media_url && msg.metadata.status_reply.status_content && (
                            <div 
                                className="px-3 py-4 text-center text-sm text-white/90 font-medium leading-relaxed"
                                style={{ 
                                    background: msg.metadata.status_reply.bg_gradient 
                                        || msg.metadata.status_reply.bg_color 
                                        || '#1a1a2e',
                                    minHeight: '60px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <p className="line-clamp-3">{msg.metadata.status_reply.status_content}</p>
                            </div>
                        )}
                        {/* Status context label */}
                        <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(0,0,0,0.25)' }}>
                            <div className="w-5 h-5 rounded-full overflow-hidden bg-white/20 flex-shrink-0">
                                {msg.metadata.status_reply.poster_avatar ? (
                                    <img src={msg.metadata.status_reply.poster_avatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-white/60">👤</div>
                                )}
                            </div>
                            <span className="text-[11px] text-white/70 font-medium truncate">
                                Replied to <span className="text-white/90 font-semibold">{msg.metadata.status_reply.poster_name || 'status'}</span>'s status
                            </span>
                        </div>
                    </div>
                )}

                {msg.attachment && msg.type !== 'audio' && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-black/20 bg-black/10">
                        {msg.type === 'image' ? (
                            <ImageWithSignedUrl 
                                path={msg.attachment.storage_path} 
                                fetchUrl={fetchSignedUrl} 
                                onLoad={onMediaLoad}
                                onPreview={(url) => setPreviewMedia({ url, type: 'image', fileName: msg.attachment?.file_name, isSender })}
                            />
                        ) : msg.type === 'video' ? (
                            <VideoWithSignedUrl 
                                path={msg.attachment.storage_path} 
                                fetchUrl={fetchSignedUrl} 
                                onLoad={onMediaLoad}
                                onPreview={(url) => setPreviewMedia({ url, type: 'video', fileName: msg.attachment?.file_name, isSender })}
                            />
                        ) : (
                            <button 
                                type="button"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    const url = await fetchSignedUrl(msg.attachment!.storage_path);
                                    if (url) window.open(url, '_blank');
                                }}
                                className="p-3 flex items-center gap-3 w-full text-left hover:bg-white/5 transition-colors cursor-pointer"
                            >
                                <Paperclip size={20} className="flex-shrink-0" style={{ color: activeTheme.colors.primaryAccent }} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate hover:underline">{msg.attachment.file_name}</p>
                                    <p className="text-[10px] opacity-60">{(msg.attachment.file_size / 1024).toFixed(1)} KB</p>
                                </div>
                            </button>
                        )}
                    </div>
                )}
                
                {msg.type === 'call' && (
                    <div className="flex items-center gap-2 py-1 px-1 opacity-90">
                        <div className={`p-1.5 rounded-full ${msg.content.includes('Missed') ? 'bg-red-500/20 text-red-100' : 'bg-green-500/20 text-green-100'}`}>
                            {msg.content.includes('video') ? <Video size={14} /> : <Phone size={14} />}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-medium">{msg.content}</span>
                            {!isGrouped && (
                                <span className="text-[10px] opacity-70" style={{ color: isSender ? activeTheme.colors.timestampSent : activeTheme.colors.timestampReceived }}>
                                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {msg.type === 'audio' && (
                    <div className="flex flex-col gap-2 min-w-[200px]">
                        <AudioPlayer 
                            path={msg.attachment?.storage_path || ''} 
                            fetchUrl={fetchSignedUrl} 
                        />
                        <div className="flex items-center justify-end gap-1 opacity-70">
                            {!isGrouped && (
                                <span className="text-[10px]" style={{ color: isSender ? activeTheme.colors.timestampSent : activeTheme.colors.timestampReceived }}>
                                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                                </span>
                            )}
                            {isSender && (
                                <div className="relative flex items-center justify-center ml-0.5">
                                    {msg.read_at || msg.status === 'read' ? (
                                        <CheckCheck size={15} strokeWidth={2.5} className="text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.9)] animate-in zoom-in-50 duration-300 transition-all font-extrabold" />
                                    ) : msg.delivered_at || msg.status === 'delivered' ? (
                                        <CheckCheck size={15} strokeWidth={2.5} className="text-slate-200 opacity-90 animate-in fade-in duration-300 drop-shadow-[0_0_1px_rgba(255,255,255,0.4)]" />
                                    ) : (
                                        <Check size={14} strokeWidth={2.5} className="text-slate-300 animate-in fade-in duration-300 opacity-60" />
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!['call', 'audio'].includes(msg.type) && (
                    <>
                        {!msg.isOwn && translations[msg.id] && translations[msg.id] !== 'translating...' && !showOriginal[msg.id] ? (
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md mb-2 w-fit" style={{ background: 'rgba(0,0,0,0.2)', color: activeTheme.colors.primaryAccent }}>
                                        <Languages size={12} />
                                        <span className="font-medium">Translated from {msg.original_language || 'detected'}</span>
                                        <button onClick={() => setShowOriginal(prev => ({ ...prev, [msg.id]: true }))} className="underline opacity-80 hover:opacity-100 ml-2 font-semibold">View Original</button>
                                    </div>
                                    <button onClick={() => handleReport(msg.id, msg.content, translations[msg.id])} className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] opacity-60 hover:opacity-100 flex items-center gap-1 absolute top-3 right-3"><Flag size={10} /> Report</button>
                                </div>
                                <p className="break-words text-sm leading-relaxed">{translations[msg.id]}</p>
                            </div>
                        ) : (
                            <div>
                                {!isGrouped && !isSender && (
                                    <div className="flex items-center justify-between mb-1">
                                        <button 
                                            onClick={() => handleManualTranslate(msg.id, msg.content, msg.original_language)}
                                            className="text-[10px] opacity-80 hover:opacity-100 transition-colors flex items-center gap-1"
                                            style={{ color: activeTheme.colors.primaryAccent }}
                                        >
                                            <Languages size={10} />
                                            {translations[msg.id] ? (showOriginal[msg.id] ? "Show Translation" : "Show Original") : "Translate"}
                                        </button>
                                        {msg.original_language && (
                                            <span className="text-[8px] opacity-50 lowercase">Detected: {msg.original_language}</span>
                                        )}
                                    </div>
                                )}
                                <p className="break-words text-sm leading-relaxed">
                                    {translations[msg.id] && !showOriginal[msg.id] && translations[msg.id] !== 'translating...' 
                                        ? translations[msg.id] 
                                        : msg.content}
                                </p>
                            </div>
                        )}
                        <div className="flex items-center justify-end gap-1 mt-1 opacity-70 flex-shrink-0">
                            {!isGrouped && (
                                <span className="text-[10px] flex items-center gap-1 whitespace-nowrap flex-shrink-0 chat-timestamp" style={{ color: isSender ? activeTheme.colors.timestampSent : activeTheme.colors.timestampReceived }}>
                                    {msg.is_edited && <span className="italic opacity-70">(edited)</span>}
                                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                                </span>
                            )}
                            {isSender && (
                                <div className="relative flex items-center justify-center ml-0.5">
                                    {msg.read_at || msg.status === 'read' ? (
                                        <CheckCheck size={15} strokeWidth={2.5} className="text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.9)] animate-in zoom-in-50 duration-300 transition-all font-extrabold" />
                                    ) : msg.delivered_at || msg.status === 'delivered' ? (
                                        <CheckCheck size={15} strokeWidth={2.5} className="text-slate-200 opacity-90 animate-in fade-in duration-300 drop-shadow-[0_0_1px_rgba(255,255,255,0.4)]" />
                                    ) : (
                                        <Check size={14} strokeWidth={2.5} className="text-slate-300 animate-in fade-in duration-300 opacity-60" />
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.msg.id === next.msg.id &&
           prev.msg.content === next.msg.content &&
           prev.msg.status === next.msg.status &&
           prev.msg.read_at === next.msg.read_at &&
           prev.msg.delivered_at === next.msg.delivered_at &&
           prev.msg.is_edited === next.msg.is_edited &&
           prev.isGrouped === next.isGrouped &&
           prev.isSelected === next.isSelected &&
           prev.isSelectionMode === next.isSelectionMode &&
           prev.translations[prev.msg.id] === next.translations[next.msg.id] &&
           prev.showOriginal[prev.msg.id] === next.showOriginal[next.msg.id];
});

export default MessageBubble;
