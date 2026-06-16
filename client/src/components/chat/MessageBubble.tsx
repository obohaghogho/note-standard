import React, { memo } from 'react';
import { Check, CheckCheck, Video, Phone, Paperclip, Languages, Flag } from 'lucide-react';
import type { Message } from '../../context/ChatContext';
import ImageWithSignedUrl from '../common/ImageWithSignedUrl';
import VideoWithSignedUrl from '../common/VideoWithSignedUrl';
import { AudioPlayer } from './AudioPlayer';
import { useChatGesture } from '../../hooks/useChatGesture';

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
    setPreviewMedia
}: MessageBubbleProps) => {
    return (
        <div 
            id={`msg-${msg.id}`}
            className={`flex px-3 md:px-4 w-full ${msg.sender_id === currentUserId ? 'justify-end' : 'justify-start'} ${isGrouped ? '' : 'mt-3'} msg-bubble`}
            onTouchStart={(e) => gesture.onTouchStart(e, msg.id)}
            onTouchMove={gesture.onTouchMove}
            onTouchEnd={gesture.onTouchEnd}
            onTouchCancel={gesture.onTouchCancel}
            onMouseDown={(e) => gesture.onMouseDown(e, msg.id)}
            onMouseUp={gesture.onMouseUp}
            onMouseLeave={gesture.onMouseLeave}
            onClick={(e) => gesture.onClick(e, msg.id, isSelectionMode, toggleMessageSelection)}
            style={gesture.dragStartStyle}
        >
            {/* Selection checkbox indicator */}
            {isSelectionMode && (
                <div className={`flex items-center mr-2 flex-shrink-0 self-center transition-all duration-200 ${msg.sender_id === currentUserId ? 'order-2 ml-2 mr-0' : ''}`}>
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
            <div className={`max-w-[92%] md:max-w-[75%] ${isGrouped ? 'rounded-[20px]' : (msg.sender_id === currentUserId ? 'rounded-[20px] rounded-br-md' : 'rounded-[20px] rounded-bl-md')} p-3.5 md:p-4 shadow-lg border ${
                isSelected
                    ? 'bg-blue-600/40 border-blue-400/50 ring-1 ring-blue-500/30'
                    : (msg.sender_id === currentUserId ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-blue-500/50' : 'bg-gray-800/90 text-gray-200 border-gray-700/50')
            } relative group transition-all duration-200 ${isSelectionMode ? 'cursor-pointer' : ''}`}>
                {msg.reply_to?.id && (
                    <div 
                        className={`mb-2 p-2.5 rounded-xl border-l-[3.5px] text-xs transition-all backdrop-blur-md cursor-pointer hover:bg-black/5 ${
                            msg.sender_id === currentUserId 
                                ? 'bg-black/20 border-l-blue-400 text-blue-100' 
                                : 'bg-white/5 border-l-blue-500 text-gray-300'
                        }`}
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
                        <p className={`font-bold mb-0.5 ${msg.sender_id === currentUserId ? 'text-blue-300' : 'text-blue-400'}`}>
                            {getSenderName(msg.reply_to.sender_id)}
                        </p>
                        <p className="truncate opacity-80 leading-relaxed italic">
                            {msg.reply_to.content || (msg.reply_to.type && msg.reply_to.type !== 'text' ? `Shared a ${msg.reply_to.type}` : 'Message')}
                        </p>
                    </div>
                )}

                {msg.attachment && msg.type !== 'audio' && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-black/20 bg-black/10">
                        {msg.type === 'image' ? (
                            <ImageWithSignedUrl 
                                path={msg.attachment.storage_path} 
                                fetchUrl={fetchSignedUrl} 
                                onPreview={(url) => setPreviewMedia({ url, type: 'image', fileName: msg.attachment?.file_name, isSender: msg.sender_id === currentUserId })}
                            />
                        ) : msg.type === 'video' ? (
                            <VideoWithSignedUrl 
                                path={msg.attachment.storage_path} 
                                fetchUrl={fetchSignedUrl} 
                                onPreview={(url) => setPreviewMedia({ url, type: 'video', fileName: msg.attachment?.file_name, isSender: msg.sender_id === currentUserId })}
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
                                <Paperclip size={20} className="text-blue-400 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate hover:underline text-blue-100">{msg.attachment.file_name}</p>
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
                                <span className="text-[10px] opacity-70">
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
                                <span className="text-[10px]">
                                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                                </span>
                            )}
                            {msg.sender_id === currentUserId && (
                                <div className="text-white/80 scale-75 origin-right relative flex items-center justify-center">
                                    {msg.read_at ? (
                                        <CheckCheck size={14} className="text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)] animate-in zoom-in-50 duration-300 transition-all font-extrabold" />
                                    ) : msg.delivered_at ? (
                                        <CheckCheck size={14} className="text-gray-300 animate-in fade-in duration-300 opacity-80" />
                                    ) : (
                                        <Check size={14} className="animate-in fade-in duration-300 opacity-60" />
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
                                    <div className="flex items-center gap-1 text-[10px] text-blue-300 bg-blue-500/10 px-2 py-1 rounded-md mb-2 w-fit">
                                        <Languages size={12} />
                                        <span className="font-medium">Translated from {msg.original_language || 'detected'}</span>
                                        <button onClick={() => setShowOriginal(prev => ({ ...prev, [msg.id]: true }))} className="underline hover:text-blue-200 ml-2 font-semibold">View Original</button>
                                    </div>
                                    <button onClick={() => handleReport(msg.id, msg.content, translations[msg.id])} className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-gray-500 hover:text-red-400 flex items-center gap-1 absolute top-3 right-3"><Flag size={10} /> Report</button>
                                </div>
                                <p className="break-words text-sm leading-relaxed">{translations[msg.id]}</p>
                            </div>
                        ) : (
                            <div>
                                {!isGrouped && msg.sender_id !== currentUserId && (
                                    <div className="flex items-center justify-between mb-1">
                                        <button 
                                            onClick={() => handleManualTranslate(msg.id, msg.content, msg.original_language)}
                                            className="text-[10px] text-blue-300 hover:text-blue-200 transition-colors flex items-center gap-1"
                                        >
                                            <Languages size={10} />
                                            {translations[msg.id] ? (showOriginal[msg.id] ? "Show Translation" : "Show Original") : "Translate"}
                                        </button>
                                        {msg.original_language && (
                                            <span className="text-[8px] text-gray-500 lowercase opacity-50">Detected: {msg.original_language}</span>
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
                        <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                            {!isGrouped && (
                                <span className="text-[10px] flex items-center gap-1">
                                    {msg.is_edited && <span className="italic opacity-70">(edited)</span>}
                                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                                </span>
                            )}
                            {msg.sender_id === currentUserId && (
                                <div className="text-white/80 scale-75 origin-right relative flex items-center justify-center">
                                    {msg.read_at ? (
                                        <CheckCheck size={14} className="text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.8)] animate-in zoom-in-50 duration-300 transition-all font-extrabold" />
                                    ) : msg.delivered_at ? (
                                        <CheckCheck size={14} className="text-gray-300 animate-in fade-in duration-300 opacity-80" />
                                    ) : (
                                        <Check size={14} className="animate-in fade-in duration-300 opacity-60" />
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
