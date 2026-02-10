import React, { useEffect, useRef, useState } from 'react';
import { useChat } from '../../context/ChatContext';
import { usePresence } from '../../context/PresenceContext';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { SecureImage } from '../common/SecureImage';
import { Send, Languages, AlertTriangle, Flag, Phone, Video, Plus, Paperclip, Smile, Search, MoreHorizontal, Check, CheckCheck, Loader2, ArrowDown, Mic, MicOff } from 'lucide-react';
import { useWebRTC } from '../../context/WebRTCContext';
import { MediaUpload } from './MediaUpload';
import { API_URL } from '../../lib/api';
import toast from 'react-hot-toast';

const ChatWindow: React.FC = () => {
    const { 
        activeConversationId, messages, sendMessage, loading, 
        conversations, acceptConversation, loadMoreMessages, hasMore 
    } = useChat();
    const { isUserOnline, getUserLastSeen } = usePresence();
    const { user, profile, session } = useAuth();
    const { startCall, callState, acceptCall, rejectCall, endCall, localStream, remoteStream, toggleMute, toggleVideo, isMuted, isVideoEnabled } = useWebRTC();
    
    const [inputValue, setInputValue] = useState('');
    const [showMediaUpload, setShowMediaUpload] = useState(false);
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [translations, setTranslations] = useState<{ [key: string]: string }>({});
    const [showOriginal, setShowOriginal] = useState<{ [key: string]: boolean }>({});
    const [isAtBottom, setIsAtBottom] = useState(true);
    
    // Search states
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    
    const emojis = ['😀', '😂', '😍', '🙌', '🔥', '👍', '🙏', '💯', '✨', '❤️', '🎉', '😊', '✅', '🚀', '👀', '💡'];

    const preferredLanguage = profile?.preferred_language || 'en';

    const currentMessages = activeConversationId ? messages[activeConversationId] || [] : [];
    const activeConversation = conversations.find(c => c.id === activeConversationId);

    const myMember = activeConversation?.members.find((m: { user_id: string; status: string }) => m.user_id === user?.id);
    const isPending = myMember?.status === 'pending';

    // Check if other party is pending (for 1:1)
    const otherMember = activeConversation?.type === 'direct'
        ? activeConversation.members.find((m: { user_id: string; status: string; profile?: any }) => m.user_id !== user?.id)
        : null;
    const isWaitingForOthers = myMember?.status === 'accepted' && otherMember?.status === 'pending';

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const reachedBottom = scrollHeight - scrollTop - clientHeight < 50;
        setIsAtBottom(reachedBottom);
    };

    useEffect(() => {
        scrollToBottom();

        // Auto-translation logic
        const translateNewMessages = async () => {
            if (!activeConversationId) return;

            // Find messages that need translation
            const messagesToTranslate = currentMessages.filter(msg => {
                // If message is not own, and language is set and different from preferred
                // If msg.original_language is missing, we assume 'en' or skip
                // Ideally, check if we already have it
                const sourceLang = msg.original_language || 'en';
                const isDifferent = sourceLang !== preferredLanguage;
                const notOwn = msg.sender_id !== user?.id;
                const notTranslated = !translations[msg.id];

                return notOwn && isDifferent && notTranslated && msg.type === 'text';
            });

            for (const msg of messagesToTranslate) {
                try {
                    // Mark as empty to avoid double fetch
                    setTranslations(prev => ({ ...prev, [msg.id]: 'translating...' }));

                    const response = await fetch(`${API_URL}/api/chat/translate`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session?.access_token}`
                        },
                        body: JSON.stringify({
                            text: msg.content,
                            targetLang: preferredLanguage,
                            sourceLang: msg.original_language
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        setTranslations(prev => ({ ...prev, [msg.id]: data.translation }));
                    } else {
                        setTranslations(prev => ({ ...prev, [msg.id]: '[Translation Failed]' }));
                    }
                } catch (e) {
                    console.error('Translation error', e);
                    setTranslations(prev => ({ ...prev, [msg.id]: '[Translation Error]' }));
                }
            }
        };

        translateNewMessages();

    }, [currentMessages, activeConversationId, preferredLanguage, user, translations]);


    const handleReport = async (msgId: string, original: string, translated: string) => {
        try {
            await fetch(`${API_URL}/api/chat/report-translation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    messageId: msgId,
                    originalText: original,
                    translatedText: translated,
                    targetLang: preferredLanguage,
                    comment: 'User reported poor translation'
                })
            });
            toast.success('Report sent. Thanks for the feedback!');
        } catch (e) {
            toast.error('Failed to send report');
        }
    };

    // Search debouncing
    useEffect(() => {
        if (!searchQuery.trim() || !isSearchOpen) {
            setSearchResults([]);
            return;
        }

        const delayDebounce = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetch(`${API_URL}/api/chat/conversations/${activeConversationId}/search?q=${encodeURIComponent(searchQuery)}`, {
                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setSearchResults(data);
                }
            } catch (err) {
                console.error('Search failed:', err);
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(delayDebounce);
    }, [searchQuery, isSearchOpen, activeConversationId, session?.access_token]);

    const fetchSignedUrl = async (path: string) => {
        if (signedUrls[path]) return signedUrls[path];
        try {
            const res = await fetch(`${API_URL}/api/media/signed-url?path=${encodeURIComponent(path)}`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            if (res.ok) {
                const { url } = await res.json();
                setSignedUrls(prev => ({ ...prev, [path]: url }));
                return url;
            }
        } catch (err) {
            console.error('Failed to get signed URL:', err);
        }
        return null;
    };

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!inputValue.trim() || !activeConversationId) return;

        try {
            await sendMessage(inputValue);
            setInputValue('');
        } catch (err) {
            console.error('Failed to send:', err);
            toast.error('Failed to send message');
        }
    };

    const handleMediaUploadComplete = async (attachmentId: string, type: string, fileName: string) => {
        try {
            await sendMessage(`Shared a ${type}: ${fileName}`, type, attachmentId);
            setShowMediaUpload(false);
        } catch (err) {
            console.error('Failed to send media message:', err);
            toast.error('Failed to send media message');
        }
    };

    const handleAccept = async () => {
        if (activeConversationId) {
            await acceptConversation(activeConversationId);
        }
    };

    const handleCall = (type: 'voice' | 'video') => {
        if (otherMember?.user_id) {
            startCall(otherMember.user_id, activeConversationId!, type);
        }
    };

    if (!activeConversationId) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 bg-gray-900">
                <p>Select a conversation to start chatting</p>
            </div>
        );
    }

    if (loading) return <div className="p-4 bg-gray-900 h-full">Loading...</div>;

    return (
        <div className="flex flex-col h-full bg-gray-900 text-white">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    {(() => {
                        let displayName = activeConversation?.name;
                        let displayAvatar = null;

                        if (activeConversation?.type === 'direct') {
                            const otherMember = activeConversation.members.find((m: { user_id: string; profile?: any }) => m.user_id !== user?.id);
                            if (otherMember && otherMember.profile) {
                                displayName = otherMember.profile.full_name || otherMember.profile.username;
                                displayAvatar = otherMember.profile.avatar_url;
                            }
                        }

                        return (
                            <>
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center overflow-hidden border border-white/10 shadow-lg">
                                    {displayAvatar ? (
                                        <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-white font-bold text-lg">
                                            {displayName?.charAt(0).toUpperCase() || '?'}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h2 className="font-semibold truncate max-w-[150px] md:max-w-[300px]">{displayName || 'Chat'}</h2>
                                    {activeConversation?.type === 'direct' && otherMember ? (
                                        isUserOnline(otherMember.user_id) ? (
                                            <p className="text-[10px] text-green-400 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> Online
                                            </p>
                                        ) : (
                                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span> 
                                                Last seen {getUserLastSeen(otherMember.user_id) ? formatDistanceToNow(new Date(getUserLastSeen(otherMember.user_id)!), { addSuffix: true }) : 'offline'}
                                            </p>
                                        )
                                    ) : (
                                        <p className="text-[10px] text-gray-400">Group Chat</p>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </div>

                <div className="flex items-center gap-1 md:gap-3 flex-1 justify-end">
                    {isSearchOpen ? (
                        <div className="flex-1 max-w-md relative animate-in slide-in-from-right-4 duration-300">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                                autoFocus
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search messages..."
                                className="w-full bg-gray-800 border border-gray-700 rounded-full py-1.5 pl-9 pr-10 text-xs focus:outline-none focus:border-blue-500"
                            />
                            <button 
                                onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-[10px] font-bold"
                            >
                                ESC
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setIsSearchOpen(true)} className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all">
                            <Search size={20} />
                        </button>
                    )}
                    {!isPending && !isWaitingForOthers && (
                        <>
                            <button 
                                onClick={() => handleCall('voice')}
                                className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-400/10 rounded-full transition-all"
                            >
                                <Phone size={20} />
                            </button>
                            <button 
                                onClick={() => handleCall('video')}
                                className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-full transition-all"
                            >
                                <Video size={20} />
                            </button>
                        </>
                    )}
                    <button className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all">
                        <MoreHorizontal size={20} />
                    </button>
                </div>
            </div>

            {/* Pagination / Load More */}
            {hasMore[activeConversationId] && (
                <div className="flex justify-center py-2 bg-gray-900">
                    <button 
                        onClick={() => loadMoreMessages(activeConversationId)}
                        className="text-xs font-medium text-blue-400 hover:text-blue-300"
                    >
                        Load older messages
                    </button>
                </div>
            )}

            <div 
                className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
                ref={scrollContainerRef}
                onScroll={handleScroll}
            >
                {isSearchOpen && searchQuery.trim() !== '' ? (
                    <div className="space-y-4">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-4">
                            {isSearching ? 'Searching...' : `Search Results (${searchResults.length})`}
                        </p>
                        {searchResults.length === 0 && !isSearching && (
                            <p className="text-center text-gray-500 py-10 text-sm">No messages found matching "{searchQuery}"</p>
                        )}
                        {searchResults.map((msg) => (
                            <SearchMessageItem key={msg.id} msg={msg} isOwn={msg.sender_id === user?.id} query={searchQuery} fetchUrl={fetchSignedUrl} />
                        ))}
                    </div>
                ) : (
                    currentMessages.map((msg) => (
                        <div
                            key={msg.id || Math.random()}
                            className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                        >
                        <div
                            className={`max-w-[75%] rounded-2xl p-3 shadow-md border ${msg.isOwn
                                ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-br-sm border-blue-500/50'
                                : 'bg-gray-800 text-gray-200 rounded-bl-sm border-gray-700'
                                } relative group`}
                        >
                            {/* Media Attachment */}
                            {msg.attachment && (
                                <div className="mb-2 rounded-lg overflow-hidden border border-black/20 bg-black/10">
                                    {msg.type === 'image' ? (
                                        <ImageWithSignedUrl path={msg.attachment.storage_path} fetchUrl={fetchSignedUrl} />
                                    ) : msg.type === 'video' ? (
                                        <VideoWithSignedUrl path={msg.attachment.storage_path} fetchUrl={fetchSignedUrl} />
                                    ) : (
                                        <div className="p-3 flex items-center gap-3">
                                            <Paperclip size={20} className="text-blue-400" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">{msg.attachment.file_name}</p>
                                                <p className="text-[10px] opacity-60">{(msg.attachment.file_size / 1024).toFixed(1)} KB • {msg.attachment.file_type}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Translation Logic */}
                            {!msg.isOwn && translations[msg.id] && translations[msg.id] !== 'translating...' && translations[msg.id] !== '[Translation Failed]' && translations[msg.id] !== '[Translation Error]' && !showOriginal[msg.id] ? (
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1.5 text-[10px] text-blue-300">
                                            <Languages size={10} />
                                            <span>Translated • {msg.original_language || 'detected'}</span>
                                            <button
                                                onClick={() => setShowOriginal(prev => ({ ...prev, [msg.id]: true }))}
                                                className="underline hover:text-blue-200 ml-1"
                                            >
                                                Original
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => handleReport(msg.id, msg.content, translations[msg.id])}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-gray-500 hover:text-red-400 flex items-center gap-1"
                                            title="Report bad translation"
                                        >
                                            <Flag size={8} /> Report
                                        </button>
                                    </div>
                                    <p className="break-words text-sm leading-relaxed">{translations[msg.id]}</p>
                                </div>
                            ) : (
                                <div>
                                    {!msg.isOwn && (
                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-1">
                                            {translations[msg.id] && (translations[msg.id] === '[Translation Failed]' || translations[msg.id] === '[Translation Error]') ? (
                                                <span className="flex items-center gap-1 text-yellow-500">
                                                    <AlertTriangle size={10} /> Translation Unavailable
                                                </span>
                                            ) : translations[msg.id] && (
                                                <>
                                                    <span>Original ({msg.original_language})</span>
                                                    <button
                                                        onClick={() => setShowOriginal(prev => ({ ...prev, [msg.id]: false }))}
                                                        className="underline hover:text-white ml-1"
                                                    >
                                                        Translate
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    <p className="break-words text-sm leading-relaxed">{msg.content}</p>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                                <span className="text-[10px]">
                                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                                </span>
                                {msg.isOwn && (
                                    <div className="text-white/80 scale-75 origin-right">
                                        {msg.read_at ? <CheckCheck size={14} className="text-blue-300" /> : <Check size={14} />}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )))}

                {/* Status Messages */}
                {isPending && (
                    <div className="flex flex-col items-center justify-center p-8 bg-gray-800/50 backdrop-blur rounded-2xl my-6 border border-gray-700 shadow-xl">
                        <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center mb-4 text-blue-400">
                           <MoreHorizontal size={32} />
                        </div>
                        <p className="text-gray-200 mb-6 text-center font-medium">
                            {otherMember ? `${otherMember.profile?.full_name || otherMember.profile?.username} wants to start a conversation with you.` : 'You have been invited to this chat.'}
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={handleAccept}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/40"
                            >
                                Accept Request
                            </button>
                            <button className="px-6 py-2.5 text-gray-400 hover:text-white transition-colors">
                                Decline
                            </button>
                        </div>
                    </div>
                )}

                {isWaitingForOthers && (
                    <div className="text-center p-6 bg-gray-800/30 rounded-xl my-4">
                        <Loader2 className="animate-spin text-blue-500 mx-auto mb-2" size={20} />
                        <p className="text-sm text-gray-400 italic font-medium">
                            Waiting for acceptance...
                        </p>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Scroll to Bottom Button */}
            {!isAtBottom && (
                <button 
                    onClick={scrollToBottom}
                    className="fixed bottom-24 right-8 bg-blue-600 text-white p-3 rounded-full shadow-2xl hover:bg-blue-700 transition-all animate-in zoom-in-0 duration-200 z-10"
                >
                    <ArrowDown size={20} />
                </button>
            )}

            {/* Media Upload Modal Overlay */}
            {showMediaUpload && (
                <div className="p-4 absolute bottom-24 left-4 right-4 z-20">
                    <MediaUpload 
                        conversationId={activeConversationId} 
                        onUploadComplete={handleMediaUploadComplete} 
                        onCancel={() => setShowMediaUpload(false)} 
                    />
                </div>
            )}

            {/* Input Area */}
            {!isPending ? (
                <div className="p-4 md:p-6 border-t border-gray-800 bg-gray-900/80 backdrop-blur-md">
                    <form onSubmit={handleSend} className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-2xl p-1 px-2 focus-within:border-blue-500 transition-all shadow-inner">
                            <button 
                                type="button"
                                onClick={() => setShowMediaUpload(!showMediaUpload)}
                                className="p-2 text-gray-400 hover:text-blue-400 hover:bg-white/5 rounded-full transition-all"
                            >
                                <Plus size={22} />
                            </button>
                            
                            <input
                                id="chat-window-input"
                                name="message"
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder={isWaitingForOthers ? "Waiting for acceptance..." : "Type a secure message..."}
                                disabled={isWaitingForOthers}
                                autoComplete="off"
                                className="flex-1 bg-transparent text-white py-3 px-2 focus:outline-none disabled:opacity-50 text-sm"
                            />
                            
                            <div className="flex items-center gap-1">
                                <div className="relative">
                                    <button 
                                        type="button" 
                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                        className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-white/5 rounded-full transition-all md:flex hidden"
                                    >
                                        <Smile size={20} />
                                    </button>
                                    {showEmojiPicker && (
                                        <div className="absolute bottom-full right-0 mb-4 p-3 bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl z-30 grid grid-cols-4 gap-2 animate-in zoom-in-95 duration-200">
                                            {emojis.map(emoji => (
                                                <button
                                                    key={emoji}
                                                    type="button"
                                                    onClick={() => {
                                                        setInputValue(prev => prev + emoji);
                                                        setShowEmojiPicker(false);
                                                    }}
                                                    className="text-xl hover:bg-white/10 p-1 rounded transition-colors"
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="submit"
                                    disabled={!inputValue.trim() || isWaitingForOthers}
                                    className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between px-2">
                             <p className="text-[10px] text-gray-500 flex items-center gap-1">
                                <CheckCheck size={10} /> End-to-end encrypted
                             </p>
                        </div>
                    </form>
                </div>
            ) : (
                <div className="p-8 border-t border-gray-800 bg-gray-900/80 text-center text-gray-400 text-sm font-medium">
                    Please accept the message request to start chatting.
                </div>
            )}

            {/* Call Overlay */}
            {callState.status !== 'idle' && (
                <CallOverlay 
                    callState={callState} 
                    acceptCall={acceptCall} 
                    rejectCall={rejectCall} 
                    endCall={endCall}
                    localStream={localStream}
                    remoteStream={remoteStream}
                    toggleMute={toggleMute}
                    toggleVideo={toggleVideo}
                    isMuted={isMuted}
                    isVideoEnabled={isVideoEnabled}
                />
            )}
        </div>
    );
};

// --- Helper Components for Media Rendering ---

const ImageWithSignedUrl = ({ path, fetchUrl }: { path: string, fetchUrl: (p: string) => Promise<string | null> }) => {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => { fetchUrl(path).then(setUrl); }, [path]);
    
    return (
        <SecureImage
            src={url || undefined}
            alt="Attached"
            className="max-w-full h-auto cursor-pointer hover:opacity-95 transition-opacity"
            onClick={() => url && window.open(url, '_blank')}
            fallback={<div className="aspect-square bg-gray-700 animate-pulse flex items-center justify-center"><Loader2 className="animate-spin text-gray-500" /></div>}
        />
    );
};

const VideoWithSignedUrl = ({ path, fetchUrl }: { path: string, fetchUrl: (p: string) => Promise<string | null> }) => {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => { fetchUrl(path).then(setUrl); }, [path]);
    if (!url) return <div className="aspect-video bg-gray-700 animate-pulse flex items-center justify-center"><Loader2 className="animate-spin text-gray-500" /></div>;
    return <video src={url} controls className="max-w-full" />;
};

// --- Call Overlay UI Component ---

const CallOverlay = ({ callState, acceptCall, rejectCall, endCall, localStream, remoteStream, toggleMute, toggleVideo, isMuted, isVideoEnabled }: any) => {
    return (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in duration-300">
            <div className="relative w-full max-w-4xl aspect-video bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-white/5 mx-4">
                {/* Remote Stream (Full Screen) */}
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                    {remoteStream ? (
                        <video 
                            ref={(el) => { if (el) el.srcObject = remoteStream; }} 
                            autoPlay 
                            className="w-full h-full object-cover" 
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-4xl font-bold animate-pulse">
                                ?
                            </div>
                            <p className="text-xl font-semibold text-white">
                                {callState.status === 'calling' ? 'Ringing...' : 'Connecting...'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Local Stream (Picture in Picture) */}
                <div className="absolute top-8 right-8 w-48 h-32 bg-gray-900 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl z-10">
                    {localStream ? (
                        <video 
                            ref={(el) => { if (el) el.srcObject = localStream; }} 
                            autoPlay 
                            muted 
                            className="w-full h-full object-cover" 
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
                            <Video size={32} className="text-gray-600" />
                        </div>
                    )}
                </div>

                {/* Incoming Call Controls */}
                {callState.status === 'incoming' && (
                    <div className="absolute inset-x-0 bottom-12 flex flex-col items-center gap-6 z-20">
                        <div className="flex gap-8">
                            <button onClick={acceptCall} className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center text-white hover:bg-green-600 transition-all hover:scale-110 shadow-xl shadow-green-500/20">
                                <Phone size={32} />
                            </button>
                            <button onClick={rejectCall} className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-all hover:scale-110 shadow-xl shadow-red-500/20">
                                <Phone size={32} className="rotate-[135deg]" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Connected / Calling Controls */}
                {(callState.status === 'connected' || callState.status === 'calling') && (
                    <div className="absolute inset-x-0 bottom-12 flex flex-col items-center gap-6 z-20">
                        <div className="flex items-center gap-4 bg-black/40 backdrop-blur-md p-4 rounded-3xl border border-white/5">
                            <button onClick={toggleMute} className={`p-4 rounded-full transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                            </button>
                            <button onClick={toggleVideo} className={`p-4 rounded-full transition-all ${!isVideoEnabled ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                                <Video size={24} />
                            </button>
                            <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-all hover:scale-110 shadow-xl shadow-red-500/40">
                                <Phone size={28} className="rotate-[135deg]" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const SearchMessageItem = ({ msg, isOwn, query, fetchUrl }: { msg: any, isOwn: boolean, query: string, fetchUrl: any }) => {
    const highlight = (text: string) => {
        if (!query) return text;
        const parts = text.split(new RegExp(`(${query})`, 'gi'));
        return parts.map((part, i) => 
            part.toLowerCase() === query.toLowerCase() 
                ? <span key={i} className="bg-yellow-500/30 text-yellow-200 rounded-sm px-0.5">{part}</span> 
                : part
        );
    };

    return (
        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} opacity-90 hover:opacity-100 transition-opacity`}>
            <div className={`max-w-[85%] rounded-xl p-3 border ${isOwn ? 'bg-blue-600/20 border-blue-500/30' : 'bg-gray-800 border-gray-700'}`}>
                {msg.attachment && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-black/20 bg-black/10 max-h-32">
                        {msg.type === 'image' ? (
                            <ImageWithSignedUrl path={msg.attachment.storage_path} fetchUrl={fetchUrl} />
                        ) : msg.type === 'video' ? (
                            <VideoWithSignedUrl path={msg.attachment.storage_path} fetchUrl={fetchUrl} />
                        ) : (
                            <div className="p-2 flex items-center gap-2">
                                <Paperclip size={14} className="text-blue-400" />
                                <span className="text-[10px] truncate">{msg.attachment.file_name}</span>
                            </div>
                        )}
                    </div>
                )}
                <p className="text-xs text-blue-400 font-bold mb-1">{isOwn ? 'You' : 'Matched Message'}</p>
                <p className="text-sm text-gray-200">{highlight(msg.content)}</p>
                <p className="text-[10px] text-gray-500 mt-2">{new Date(msg.created_at).toLocaleString()}</p>
            </div>
        </div>
    );
};

export default ChatWindow;
