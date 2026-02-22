import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useChat } from '../../context/ChatContext';
import { usePresence } from '../../context/PresenceContext';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import SecureImage from '../common/SecureImage';
import { Send, Languages, AlertTriangle, Flag, Phone, Video, Plus, Paperclip, Smile, Search, MoreHorizontal, Check, CheckCheck, Loader2, ArrowDown, Mic, MicOff, ArrowLeft } from 'lucide-react';
import { useWebRTC } from '../../context/WebRTCContext';
import { MediaUpload } from './MediaUpload';
import { VoiceRecorder } from './VoiceRecorder';
import { API_URL } from '../../lib/api';
import toast from 'react-hot-toast';

const ChatWindow: React.FC = () => {
    const { 
        activeConversationId, setActiveConversationId, messages, sendMessage, loading, 
        conversations, acceptConversation, deleteConversation, 
        muteConversation, clearChatHistory, loadMoreMessages, hasMore 
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
    const [isAccepting, setIsAccepting] = useState(false);
    
    const emojis = ['😀', '😂', '😍', '🙌', '🔥', '👍', '🙏', '💯', '✨', '❤️', '🎉', '😊', '✅', '🚀', '👀', '💡'];

    const preferredLanguage = profile?.preferred_language || 'en';

    const currentMessages = activeConversationId ? messages[activeConversationId] || [] : [];
    const activeConversation = conversations.find(c => c.id === activeConversationId);

    const myMember = activeConversation?.members.find((m: { user_id: string; status: string }) => m.user_id === user?.id);
    const isPending = myMember?.status === 'pending';

    // Check if other party is pending (for 1:1)
    // Identify the other participant for calls and profile info
    const otherMember = useMemo(() => {
        if (!activeConversation?.members || !user) return null;
        // Find anyone who isn't the current user
        return activeConversation.members.find((m: any) => m.user_id !== user.id) || null;
    }, [activeConversation?.members, user?.id]);

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
        if (isAccepting || !activeConversationId) return;
        setIsAccepting(true);
        try {
            await acceptConversation(activeConversationId);
        } catch (err) {
            console.error('Accept failed', err);
        } finally {
            setIsAccepting(false);
        }
    };

    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [isVoiceRecording, setIsVoiceRecording] = useState(false);

    const handleClearChat = () => {
        if (!activeConversationId) return;
        setShowMoreMenu(false);

        toast((t) => (
            <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-gray-800">
                    Clear all messages in this chat? (This only affects you)
                </p>
                <div className="flex gap-2 justify-end">
                    <button 
                        onClick={() => toast.dismiss(t.id)}
                        className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={async () => {
                            toast.dismiss(t.id);
                            const loadingToast = toast.loading('Clearing history...');
                            try {
                                await clearChatHistory(activeConversationId);
                                toast.success('Chat cleared', { id: loadingToast });
                            } catch (err) {
                                toast.error('Failed to clear chat', { id: loadingToast });
                            }
                        }}
                        className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        Clear
                    </button>
                </div>
            </div>
        ), { duration: 5000 });
    };

    const handleMuteChat = async () => {
        if (!activeConversationId) return;
        setShowMoreMenu(false);

        const isCurrentlyMuted = activeConversation?.is_muted;
        const nextMuteStatus = !isCurrentlyMuted;

        try {
            await muteConversation(activeConversationId, nextMuteStatus);
            toast.success(nextMuteStatus ? 'Chat muted' : 'Chat unmuted');
        } catch (err) {
            toast.error('Failed to update mute status');
        }
    };

    const handleDeleteChat = () => {
        if (!activeConversationId) return;
        
        setShowMoreMenu(false);
        
        toast((t) => (
            <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-gray-800">
                    Are you sure you want to delete this chat forever?
                </p>
                <div className="flex gap-2 justify-end">
                    <button 
                        onClick={() => toast.dismiss(t.id)}
                        className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={async () => {
                            toast.dismiss(t.id);
                            const loadingToast = toast.loading('Deleting chat...');
                            try {
                                await deleteConversation(activeConversationId);
                                toast.success('Chat deleted', { id: loadingToast });
                            } catch (err) {
                                toast.error('Failed to delete chat', { id: loadingToast });
                            }
                        }}
                        className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                        Delete
                    </button>
                </div>
            </div>
        ), { duration: 5000 });
    };

    const handleVoiceMessage = async (_blob: Blob) => {
        try {
            // In a real app, you'd upload this blob to Supabase storage
            // For now, we'll simulate a voice message
            // console.log('Sending voice blob size:', _blob.size);
            await sendMessage('Sent a voice message', 'audio');
            setIsVoiceRecording(false);
        } catch (err) {
            toast.error('Failed to send voice message');
        }
    };

    const handleCall = (type: 'voice' | 'video') => {
        // Diagnostic Logging
        console.log('[ChatWindow] handleCall triggered:', { 
            type, 
            activeConversationId,
            conversationType: activeConversation?.type,
            chatType: activeConversation?.chat_type,
            membersCount: activeConversation?.members?.length,
            currentUserId: user?.id,
            otherMemberId: otherMember?.user_id
        });
        
        if (!otherMember?.user_id) {
            console.error('[ChatWindow] Cannot start call: no recipient found', { otherMember });
            
            if (activeConversation?.members && activeConversation.members.length === 1) {
                if (activeConversation.chat_type === 'support') {
                    toast.error('Waiting for a support agent to join this chat before you can call.');
                } else {
                    toast.error('You are the only member in this chat. Add someone else to start a call!');
                }
            } else if (activeConversation?.type === 'group') {
                toast.error('Group calls are not supported yet');
            } else {
                toast.error('Could not find a recipient for this call. Please refresh the chat.');
            }
            return;
        }

        if (isWaitingForOthers) {
            toast.error('Waiting for recipient to accept message request');
            return;
        }

        toast.loading(`Starting ${type} call...`, { duration: 2000, id: 'call-start' });
        startCall(otherMember.user_id, activeConversationId!, type)
            .catch(err => {
                console.error('[ChatWindow] startCall failed:', err);
                toast.error('Failed to start call. Check camera/mic permissions.');
            });
    };

    if (!activeConversationId) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 bg-gray-900">
                <p>Select a conversation to start chatting</p>
            </div>
        );
    }

    if (loading) return <div className="p-4 bg-gray-900 h-full">Loading...</div>;

    const otherUserTitle = activeConversation?.type === 'direct' && otherMember 
        ? (otherMember.profile?.full_name || otherMember.profile?.username || 'User')
        : 'Chat';

    const otherUserAvatar = activeConversation?.type === 'direct' && otherMember
        ? otherMember.profile?.avatar_url
        : null;

    return (
        <div className="flex flex-col h-full bg-gray-900 text-white">
            <div className="p-2 md:p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 backdrop-blur-md sticky top-0 z-10 w-full overflow-hidden">
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <button 
                        onClick={() => setActiveConversationId(null)}
                        className="p-1.5 -ml-1 text-gray-400 hover:text-white md:hidden"
                        aria-label="Back to conversations"
                    >
                        <ArrowLeft size={22} />
                    </button>
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
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center overflow-hidden border border-white/10 shadow-lg flex-shrink-0">
                                    {displayAvatar ? (
                                        <SecureImage src={displayAvatar} alt={displayName} className="w-full h-full object-cover" fallbackType="profile" />
                                    ) : (
                                        <span className="text-white font-bold text-base md:text-lg">
                                            {displayName?.charAt(0).toUpperCase() || '?'}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h2 className="font-semibold truncate max-w-[80px] sm:max-w-[150px] md:max-w-[300px] text-xs md:text-base">{displayName || 'Chat'}</h2>
                                    {activeConversation?.type === 'direct' && otherMember ? (
                                        isUserOnline(otherMember.user_id) ? (
                                            <p className="text-[10px] text-green-400 hidden sm:flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> Online
                                            </p>
                                        ) : (
                                            <p className="text-[10px] text-gray-400 hidden sm:flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span> 
                                                Last seen {getUserLastSeen(otherMember.user_id) ? formatDistanceToNow(new Date(getUserLastSeen(otherMember.user_id)!), { addSuffix: true }) : 'offline'}
                                            </p>
                                        )
                                    ) : (
                                        <p className="text-[10px] text-gray-400 hidden sm:block">Group Chat</p>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </div>

                <div className="flex items-center gap-0.5 md:gap-3 flex-shrink-0">
                    {isSearchOpen ? (
                        <div className="flex-1 max-w-full md:max-w-md absolute md:relative inset-x-0 top-0 h-full bg-gray-900 md:bg-transparent px-4 md:px-0 flex items-center z-20 animate-in slide-in-from-top-4 md:slide-in-from-right-4 duration-300">
                            <Search size={16} className="absolute left-7 md:left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                                id="chat-search-messages"
                                name="searchMessages"
                                autoFocus
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search..."
                                className="w-full bg-gray-800 border border-gray-700 rounded-full py-1.5 pl-10 pr-10 text-xs focus:outline-none focus:border-blue-500"
                            />
                            <button 
                                onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                                className="absolute right-7 md:right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-[10px] font-bold"
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
                                className="p-1.5 md:p-2 text-gray-400 hover:text-green-400 hover:bg-green-400/10 rounded-full transition-all"
                            >
                                <Phone size={18} className="md:w-5 md:h-5" />
                            </button>
                            <button 
                                onClick={() => handleCall('video')}
                                className="p-1.5 md:p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-full transition-all"
                            >
                                <Video size={18} className="md:w-5 md:h-5" />
                            </button>
                        </>
                    )}
                    <div className="relative">
                        <button 
                            onClick={() => setShowMoreMenu(!showMoreMenu)}
                            className={`p-2 rounded-full transition-all ${showMoreMenu ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <MoreHorizontal size={20} />
                        </button>
                        {showMoreMenu && (
                            <div className="absolute top-full right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 p-1 animate-in zoom-in-95 duration-200">
                                <button onClick={handleMuteChat} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg">
                                    {activeConversation?.is_muted ? 'Unmute Notifications' : 'Mute Notifications'}
                                </button>
                                <button onClick={handleClearChat} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg">Clear History</button>
                                <button onClick={handleDeleteChat} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg">Delete Chat</button>
                            </div>
                        )}
                    </div>
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
                className="flex-1 overflow-y-auto p-2 md:p-4 space-y-3 md:space-y-4 scroll-smooth"
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
                            className={`max-w-[92%] md:max-w-[70%] rounded-2xl p-3 shadow-md border ${msg.isOwn
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
                                disabled={isAccepting}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/40 disabled:opacity-50"
                            >
                                {isAccepting ? 'Accepting...' : 'Accept Request'}
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
                    otherUserName={otherUserTitle}
                    otherUserAvatar={otherUserAvatar}
                />
            )}

            {/* Input Area */}
            {!isPending ? (
                <div className="p-2 md:p-6 border-t border-gray-800 bg-gray-900/80 backdrop-blur-md pb-safe">
                    <form onSubmit={handleSend} className="flex flex-col gap-2 md:gap-3 w-full max-w-full overflow-hidden">
                        {isVoiceRecording ? (
                            <div className="flex justify-center p-2 bg-gray-800 rounded-2xl border border-gray-700 animate-in slide-in-from-bottom-2">
                                <VoiceRecorder onSend={handleVoiceMessage} onCancel={() => setIsVoiceRecording(false)} />
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <div className="flex-1 flex items-center gap-1 md:gap-2 bg-gray-800 border border-gray-700 rounded-2xl p-1 md:p-1.5 px-2 md:px-3 focus-within:border-blue-500 transition-all shadow-inner">
                                    <button 
                                        type="button"
                                        onClick={() => setShowMediaUpload(!showMediaUpload)}
                                        className="p-1.5 md:p-2 text-gray-400 hover:text-blue-400 hover:bg-white/5 rounded-full transition-all flex-shrink-0"
                                    >
                                        <Plus size={20} className="md:w-[22px] md:h-[22px]" />
                                    </button>
                                    
                                    <input
                                        id="chat-window-input"
                                        name="message"
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        placeholder={isWaitingForOthers ? "Waiting..." : "Message..."}
                                        disabled={isWaitingForOthers}
                                        autoComplete="off"
                                        className="flex-1 bg-transparent text-white py-2 md:py-3 px-1 md:px-2 focus:outline-none disabled:opacity-50 text-sm min-w-0"
                                    />
                                    
                                    <div className="flex items-center">
                                        <button 
                                            type="button"
                                            onClick={() => setIsVoiceRecording(true)}
                                            className="p-1.5 md:p-2 text-gray-400 hover:text-blue-400 hover:bg-white/5 rounded-full transition-all flex-shrink-0"
                                        >
                                            <Mic size={18} className="md:w-5 md:h-5" />
                                        </button>
                                        <div className="relative">
                                            <button 
                                                type="button" 
                                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                className="p-1.5 md:p-2 text-gray-400 hover:text-yellow-400 hover:bg-white/5 rounded-full transition-all md:flex hidden"
                                            >
                                                <Smile size={18} className="md:w-5 md:h-5" />
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
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={!inputValue.trim() || isWaitingForOthers}
                                    className="bg-blue-600 hover:bg-blue-500 text-white w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex-shrink-0"
                                >
                                    <Send size={18} className="md:w-5 md:h-5" />
                                </button>
                            </div>
                        )}
                        <div className="hidden md:flex justify-between px-2">
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

const CallOverlay = ({ callState, acceptCall, rejectCall, endCall, localStream, remoteStream, toggleMute, toggleVideo, isMuted, isVideoEnabled, otherUserName, otherUserAvatar }: any) => {
    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in duration-300">
            <div className="relative w-full h-full md:w-[90vw] md:h-[80vh] bg-gray-900 md:rounded-3xl overflow-hidden shadow-2xl border border-white/5">
                {/* Remote Stream (Full Screen) */}
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    {remoteStream ? (
                        <video 
                            ref={(el) => { if (el) el.srcObject = remoteStream; }} 
                            autoPlay 
                            className="w-full h-full object-cover" 
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-6">
                            <div className="relative">
                                <div className="absolute -inset-4 bg-blue-500/20 rounded-full animate-ping"></div>
                                <div className="absolute -inset-8 bg-blue-500/10 rounded-full animate-pulse"></div>
                                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-4xl font-bold border-4 border-white/10 shadow-2xl overflow-hidden">
                                    {otherUserAvatar ? (
                                        <SecureImage src={otherUserAvatar} alt={otherUserName} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-white">{otherUserName?.charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="text-2xl font-bold text-white mb-2">{otherUserName}</h3>
                                <p className="text-blue-400 font-medium animate-pulse">
                                    {callState.status === 'calling' ? 'Ringing...' : 
                                     callState.status === 'incoming' ? `${callState.type === 'video' ? 'Video' : 'Voice'} Call Incoming` : 
                                     'Connecting...'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Local Stream (Picture in Picture) */}
                <div className="absolute top-8 right-8 w-40 h-56 md:w-48 md:h-64 bg-gray-950 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl z-10">
                    {localStream ? (
                        <video 
                            ref={(el) => { if (el) el.srcObject = localStream; }} 
                            autoPlay 
                            muted 
                            className={`w-full h-full object-cover ${!isVideoEnabled ? 'hidden' : ''}`} 
                        />
                    ) : null}
                    {!isVideoEnabled && (
                         <div className="w-full h-full flex items-center justify-center bg-gray-800">
                            <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                                <Video size={20} className="text-gray-500" />
                            </div>
                         </div>
                    )}
                </div>

                {/* Controls Area */}
                <div className="absolute inset-x-0 bottom-12 flex flex-col items-center gap-8 z-20">
                    {callState.status === 'incoming' ? (
                        <div className="flex gap-12">
                            <div className="flex flex-col items-center gap-3">
                                <button onClick={acceptCall} className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center text-white hover:bg-green-600 transition-all hover:scale-110 shadow-xl shadow-green-500/30">
                                    <Phone size={32} />
                                </button>
                                <span className="text-sm font-medium text-green-400">Accept</span>
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <button onClick={rejectCall} className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-all hover:scale-110 shadow-xl shadow-red-500/30">
                                    <Phone size={32} className="rotate-[135deg]" />
                                </button>
                                <span className="text-sm font-medium text-red-400">Decline</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-6 bg-black/40 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/10 shadow-3xl">
                            <button 
                                onClick={toggleMute} 
                                className={`p-5 rounded-full transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                title={isMuted ? "Unmute" : "Mute"}
                            >
                                {isMuted ? <MicOff size={26} /> : <Mic size={26} />}
                            </button>
                            
                            <button onClick={endCall} className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-all hover:scale-110 shadow-2xl shadow-red-500/40 transform active:scale-95">
                                <Phone size={34} className="rotate-[135deg]" />
                            </button>

                            <button 
                                onClick={toggleVideo} 
                                className={`p-5 rounded-full transition-all ${!isVideoEnabled ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                title={isVideoEnabled ? "Turn Camera Off" : "Turn Camera On"}
                            >
                                {isVideoEnabled ? <Video size={26} /> : <Video size={26} />}
                            </button>
                        </div>
                    )}
                </div>
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
