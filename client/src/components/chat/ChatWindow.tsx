import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useChatGesture } from '../../hooks/useChatGesture';
import { AnimatePresence } from 'framer-motion';
import { useChat } from '../../context/ChatContext';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import type { Message } from '../../context/ChatContext';
import { usePresence } from '../../context/PresenceContext';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import SecureImage from '../common/SecureImage';
import { Send, Languages, Flag, Phone, Video, Plus, Paperclip, Smile, Search, MoreHorizontal, Check, CheckCheck, Loader2, ArrowDown, Mic, ArrowLeft, Maximize, Trash2, Share2, X, Copy, Menu, Pencil } from 'lucide-react';
import { useWebRTC } from '../../context/WebRTCContext';
import { MediaUpload } from './MediaUpload';
import { VoiceRecorder } from './VoiceRecorder';
import { AudioPlayer } from './AudioPlayer';
import { API_URL } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { MediaPreviewModal } from './MediaPreviewModal';
import { MentionSuggestions } from './MentionSuggestions';
import { ForwardMessageModal } from './ForwardMessageModal';

import { ConfirmationModal } from '../common/ConfirmationModal';
import { applyAutoCorrect } from '../../utils/textUtils';
import { UserBadge } from '../common/UserBadge';

const ChatWindow: React.FC = () => {
    const { 
        activeConversationId, setActiveConversationId, messages, sendMessage, loading, 
        conversations, acceptConversation, deleteConversation, deleteMessage, editMessage,
        muteConversation, clearChatHistory, loadMoreMessages, hasMore,
        sendTypingStatus, typingUsers, sendMessageToConversation,
        drafts, setDraft
    } = useChat();
    const [, setSearchParams] = useSearchParams();
    const { isUserOnline, getUserLastSeen } = usePresence();
    const { user, profile, session, isAdmin } = useAuth();
    const { startCall } = useWebRTC();
    const { openMobileMenu } = useOutletContext<{ openMobileMenu: () => void }>() || {};

    // ── WhatsApp-Style Selection System ──────────────────────
    const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
    const isSelectionMode = selectedMessages.size > 0;

    // Forward modal state
    const [forwardModal, setForwardModal] = useState<{
        isOpen: boolean;
        messages: { id: string; content: string; type: string }[];
    }>({ isOpen: false, messages: [] });

    // Editing state
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

    const toggleMessageSelection = (msgId: string) => {
        setSelectedMessages(prev => {
            const next = new Set(prev);
            if (next.has(msgId)) next.delete(msgId);
            else next.add(msgId);
            return next;
        });
    };

    const clearSelection = () => setSelectedMessages(new Set());

    // Gesture hook — scroll wins, long-press only after 480ms of no movement
    const gesture = useChatGesture({
        onLongPress: (id) => toggleMessageSelection(id),
        moveThreshold: 8,
        delay: 480,
        enabled: true,
    });

    // Copy to clipboard
    const handleCopy = async () => {
        if (selectedMessages.size === 0) return;
        const selectedMsgs = currentMessages
            .filter(m => selectedMessages.has(m.id))
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map(m => m.content)
            .join('\n');
        
        try {
            await navigator.clipboard.writeText(selectedMsgs);
            toast.success(selectedMessages.size > 1 ? 'Messages copied' : 'Message copied');
            clearSelection();
        } catch {
            toast.error('Failed to copy to clipboard');
        }
    };

    // (No manual timer cleanup needed — useChatGesture manages its own cleanup)
    
    const [inputValue, setInputValue] = useState('');
    const [showMediaUpload, setShowMediaUpload] = useState(false);
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
    
    // Confirmation state
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        type: 'message' | 'clear' | 'delete_chat';
        messageId?: string;
    }>({
        isOpen: false,
        type: 'message'
    });

    const [previewMedia, setPreviewMedia] = useState<{
        isOpen: boolean;
        url: string;
        type: 'image' | 'video';
        fileName?: string;
        isSender?: boolean;
    }>({
        isOpen: false,
        url: '',
        type: 'image'
    });
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [translations, setTranslations] = useState<{ [key: string]: string }>({});
    const [showOriginal, setShowOriginal] = useState<{ [key: string]: boolean }>({});
    const [isAtBottom, setIsAtBottom] = useState(true);
    
    // Search states
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Message[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isAccepting, setIsAccepting] = useState(false);
    
    // Mentions state
    const [showMentions, setShowMentions] = useState(false);
    
    // Ref to prevent translation loops
    const translatingRef = useRef<Set<string>>(new Set());
    
    const emojis = ['😀', '😂', '😍', '🙌', '🔥', '👍', '🙏', '💯', '✨', '❤️', '🎉', '😊', '✅', '🚀', '👀', '💡'];

    const preferredLanguage = profile?.preferred_language || 'en';

    const currentMessages = useMemo(() => activeConversationId ? messages[activeConversationId] || [] : [], [messages, activeConversationId]);
    const activeConversation = useMemo(() => conversations.find(c => c.id === activeConversationId), [conversations, activeConversationId]);

    const myMember = activeConversation?.members.find((m: { user_id: string; status: string }) => m.user_id === user?.id);
    const isPending = myMember?.status === 'pending';

    const otherMember = useMemo(() => {
        if (!activeConversation?.members || !user) return null;
        return activeConversation.members.find(m => m.user_id !== user.id) || null;
    }, [activeConversation?.members, user]);

    const isWaitingForOthers = myMember?.status === 'accepted' && otherMember?.status === 'pending';

    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        if (scrollContainerRef.current) {
            const { scrollHeight } = scrollContainerRef.current;
            scrollContainerRef.current.scrollTo({
                top: scrollHeight,
                behavior
            });
            // Force set state to avoid lag in UI update
            setIsAtBottom(true);
        }
    };

    const handleLoadMore = async () => {
        if (!activeConversationId || !scrollContainerRef.current) return;
        
        const scrollNode = scrollContainerRef.current;
        const previousScrollHeight = scrollNode.scrollHeight;
        
        await loadMoreMessages(activeConversationId);
        
        setTimeout(() => {
            if (scrollContainerRef.current) {
                const newScrollHeight = scrollContainerRef.current.scrollHeight;
                scrollContainerRef.current.scrollTop = newScrollHeight - previousScrollHeight;
            }
        }, 0);
    };

    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const reachedBottom = scrollHeight - scrollTop - clientHeight < 50;
        setIsAtBottom(reachedBottom);
    };

    useEffect(() => {
        if (isAtBottom) scrollToBottom('smooth');
    }, [currentMessages, isAtBottom]);

    useEffect(() => {
        if (activeConversationId) {
            // Use setTimeout to ensure DOM has updated before scrolling
            setTimeout(() => {
                scrollToBottom('auto');
                setIsAtBottom(true);
            }, 0);
        }
    }, [activeConversationId]);

    // Initialize input from draft
    useEffect(() => {
        if (activeConversationId) {
            setInputValue(drafts[activeConversationId] || '');
        }
    }, [activeConversationId, drafts]);

    const translationsRef = useRef(translations);
    useEffect(() => {
        translationsRef.current = translations;
    }, [translations]);

    useEffect(() => {
        const translateNewMessages = async () => {
            if (!activeConversationId || !preferredLanguage || !session?.access_token) return;

            const messagesToTranslate = currentMessages.filter(msg => {
                const sourceLang = msg.original_language || 'en';
                const isDifferent = sourceLang !== preferredLanguage;
                const notOwn = msg.sender_id !== user?.id;
                const notTranslated = !translationsRef.current[msg.id];
                const notInFlight = !translatingRef.current.has(msg.id);
                return notOwn && isDifferent && notTranslated && notInFlight && msg.type === 'text';
            });

            if (messagesToTranslate.length === 0) return;

            // Mark as in-flight before starting
            messagesToTranslate.forEach(m => translatingRef.current.add(m.id));

            for (const msg of messagesToTranslate) {
                try {
                    setTranslations(prev => ({ ...prev, [msg.id]: 'translating...' }));
                    const response = await fetch(`${API_URL}/api/chat/translate`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session.access_token}`
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
                } catch {
                    setTranslations(prev => ({ ...prev, [msg.id]: '[Translation Error]' }));
                } finally {
                    translatingRef.current.delete(msg.id);
                }
            }
        };

        translateNewMessages();
    }, [currentMessages, activeConversationId, preferredLanguage, user?.id, session?.access_token]);

    const handleManualTranslate = async (msgId: string, content: string, sourceLang?: string) => {
        if (!preferredLanguage || !session?.access_token) return;
        
        try {
            setTranslations(prev => ({ ...prev, [msgId]: 'translating...' }));
            const response = await fetch(`${API_URL}/api/chat/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    text: content,
                    targetLang: preferredLanguage,
                    sourceLang: sourceLang
                })
            });

            if (response.ok) {
                const data = await response.json();
                setTranslations(prev => ({ ...prev, [msgId]: data.translation }));
                setShowOriginal(prev => ({ ...prev, [msgId]: false }));
            } else {
                setTranslations(prev => ({ ...prev, [msgId]: '[Translation Failed]' }));
            }
        } catch {
            setTranslations(prev => ({ ...prev, [msgId]: '[Translation Error]' }));
        }
    };

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
        } catch {
            toast.error('Failed to send report');
        }
    };

    useEffect(() => {
        if (!searchQuery.trim() || !isSearchOpen) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const delayDebounce = setTimeout(async () => {
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

    const fetchSignedUrl = useCallback(async (path: string) => {
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
    }, [signedUrls, session?.access_token]);

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const textToSend = inputValue.trim();
        if (!textToSend || !activeConversationId) return;

        // Clear UI state synchronously for instant feedback
        setInputValue('');
        if (activeConversationId) setDraft(activeConversationId, '');
        setShowMentions(false);
        
        const currentEditingId = editingMessageId;
        setEditingMessageId(null);

        try {
            if (currentEditingId) {
                await editMessage(currentEditingId, textToSend);
            } else {
                await sendMessage(textToSend, 'text', undefined, replyTo?.id);
                setReplyTo(null);
            }
        } catch {
            // Restore state if network request fails
            setInputValue(textToSend);
            setEditingMessageId(currentEditingId);
            toast.error(currentEditingId ? 'Failed to edit message' : 'Failed to send message');
        }
    };

    const handleMediaUploadComplete = async (attachmentId: string, type: string, fileName: string) => {
        try {
            await sendMessage(`Shared a ${type}: ${fileName}`, type, attachmentId);
            setShowMediaUpload(false);
        } catch {
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
        setConfirmModal({ isOpen: true, type: 'clear' });
    };

    const handleMuteChat = async () => {
        if (!activeConversationId) return;
        setShowMoreMenu(false);
        const nextMuteStatus = !activeConversation?.is_muted;
        try {
            await muteConversation(activeConversationId, nextMuteStatus);
            toast.success(nextMuteStatus ? 'Chat muted' : 'Chat unmuted');
        } catch {
            toast.error('Failed to update mute status');
        }
    };

    const handleDeleteChat = () => {
        if (!activeConversationId) return;
        setShowMoreMenu(false);
        setConfirmModal({ isOpen: true, type: 'delete_chat' });
    };

    const handleVoiceMessage = async (blob: Blob) => {
        if (!session || !activeConversationId) return;
        
        const loadingToast = toast.loading('Processing voice message...');
        try {
            const mimeType = blob.type || 'audio/webm';
            // Use a temporary path for processing
            const tempFileName = `raw_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const tempPath = `temp/${tempFileName}`;

            // 1. Upload raw blob to Supabase Storage (Temp folder)
            const { error: uploadError, data } = await supabase.storage
                .from('chat-media')
                .upload(tempPath, blob, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: mimeType
                });

            if (uploadError) throw uploadError;

            // 2. Call Backend to convert and create record
            const res = await fetch(`${API_URL}/api/media/process-audio`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    storagePath: data.path,
                    conversationId: activeConversationId
                })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to process audio');
            }

            const attachment = await res.json();

            // 3. Send Message referencing the new attachment
            await sendMessage('Sent a voice message', 'audio', attachment.id);
            
            setIsVoiceRecording(false);
            toast.success('Voice message sent', { id: loadingToast });
        } catch (err) {
            console.error('[ChatWindow] Voice message error:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to send voice message', { id: loadingToast });
        }
    };

    const otherUserTitle = activeConversation?.type === 'direct' && otherMember 
        ? (otherMember.profile?.full_name || otherMember.profile?.username || 'User')
        : 'Chat';

    const otherUserAvatar = activeConversation?.type === 'direct' && otherMember
        ? otherMember.profile?.avatar_url
        : null;

    const handleCall = (type: 'voice' | 'video') => {
        if (!activeConversationId || !otherMember?.user_id) {
            toast.error('Could not find participant to call');
            return;
        }
        if (isWaitingForOthers) {
            toast.error('Waiting for participant to join the conversation');
            return;
        }
        if (!isUserOnline(otherMember.user_id)) {
            toast(`${otherUserTitle} may be away. Call will still be attempted.`, { icon: 'ℹ️', duration: 3000 });
        }
        toast.loading(`Starting ${type} call...`, { duration: 2000, id: 'call-start' });
        startCall(otherMember.user_id, activeConversationId, type, {
            id: otherMember.user_id,
            full_name: otherUserTitle,
            avatar_url: otherUserAvatar || undefined
        })
            .catch(() => {
                toast.error('Failed to start call. Check camera/mic permissions.');
            });
    };

    // Typing Status Debounce
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement> | string) => {
        const value = typeof e === 'string' ? e : e.target.value;
        const val = applyAutoCorrect(value);
        setInputValue(val);

        // Emit typing status
        sendTypingStatus(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            sendTypingStatus(false);
        }, 3000);

        // Update draft
        if (activeConversationId) {
            setDraft(activeConversationId, val);
        }

        // Mention detection
        const lastAtPos = val.lastIndexOf('@');
        // ... (rest of the logic)
        if (lastAtPos !== -1) {
            const query = val.substring(lastAtPos + 1).split(' ')[0];
            const beforeAt = val.substring(0, lastAtPos);
            // Show only if @ is at start or preceded by space
            if (lastAtPos === 0 || beforeAt.endsWith(' ')) {
                setMentionSearch(query);
                setShowMentions(true);
                
                // Filter current conversation members
                if (activeConversation?.members) {
                    const filtered = activeConversation.members
                        .filter(m => m.user_id !== user?.id && m.profile)
                        .map(m => ({
                            ...m.profile!,
                            id: m.user_id
                        }))
                        .filter(p => 
                            p.username.toLowerCase().includes(query.toLowerCase()) || 
                            p.full_name?.toLowerCase().includes(query.toLowerCase())
                        );
                    setMentionParticipants(filtered);
                }
            } else {
                setShowMentions(false);
            }
        } else {
            setShowMentions(false);
        }
    };

    const handleSelectMention = (mentionedUser: { id: string, username: string }) => {
        const lastAtPos = inputValue.lastIndexOf('@');
        const beforeAt = inputValue.substring(0, lastAtPos);
        const afterMention = inputValue.substring(lastAtPos + mentionSearch.length + 1);
        setInputValue(`${beforeAt}@${mentionedUser.username} ${afterMention}`);
        setShowMentions(false);
        sendTypingStatus(true); // Re-trigger typing
    };

    // Message Grouping Helper
    const isSameSender = (index: number) => {
        if (index === 0) return false;
        const current = currentMessages[index];
        const previous = currentMessages[index - 1];
        if (!current || !previous) return false;
        
        const timeDiff = new Date(current.created_at).getTime() - new Date(previous.created_at).getTime();
        return current.sender_id === previous.sender_id && timeDiff < 60000; // Group if within 1 minute
    };

    if (!activeConversationId) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 bg-gray-900">
                <p>Select a conversation to start chatting</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full min-h-0 bg-gray-950 text-white overflow-hidden relative w-full shadow-none rounded-none md:max-w-[1200px] md:mx-auto md:shadow-2xl md:border-x md:border-white/5">
            {/* ── Selection Action Bar (WhatsApp-style) ── */}
            {isSelectionMode ? (
                <div className="pt-safe flex-shrink-0 border-b border-blue-500/30 bg-blue-600/10 backdrop-blur-md z-20" onClick={(e) => e.stopPropagation()}>
                    <div className="p-2 md:p-4 flex items-center justify-between gap-4 w-full">
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={clearSelection}
                                className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-all active:scale-90"
                                aria-label="Cancel selection"
                            >
                                <X size={22} />
                            </button>
                            <span className="text-white font-bold text-base">
                                {selectedMessages.size} selected
                            </span>
                        </div>
                        <div className="flex items-center gap-1 md:gap-2">
                             <button 
                                onClick={() => {
                                    const selectedMsgs = currentMessages
                                        .filter(m => selectedMessages.has(m.id))
                                        .map(m => ({ id: m.id, content: m.content, type: m.type }));
                                    setForwardModal({ isOpen: true, messages: selectedMsgs });
                                }}
                                className="flex items-center gap-2 px-3 md:px-4 py-2 text-sm font-semibold text-blue-300 hover:text-blue-200 hover:bg-blue-500/15 rounded-xl transition-all"
                            >
                                <Share2 size={18} />
                                <span className="hidden sm:inline">Forward</span>
                            </button>
                            {selectedMessages.size === 1 && (
                                (() => {
                                    const msgId = Array.from(selectedMessages)[0];
                                    const msg = currentMessages.find(m => m.id === msgId);
                                    if (msg && msg.sender_id === user?.id && msg.type === 'text') {
                                        return (
                                            <button 
                                                onClick={() => {
                                                    if (msg) {
                                                        setEditingMessageId(msg.id);
                                                        setInputValue(msg.content || '');
                                                    }
                                                    clearSelection();
                                                }}
                                                className="flex items-center gap-2 px-3 md:px-4 py-2 text-sm font-semibold text-green-400 hover:text-green-300 hover:bg-green-500/15 rounded-xl transition-all"
                                            >
                                                <Pencil size={18} />
                                                <span className="hidden sm:inline">Edit</span>
                                            </button>
                                        );
                                    }
                                    return null;
                                })()
                            )}
                             <button 
                                onClick={handleCopy}
                                className="flex items-center gap-2 px-3 md:px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                            >
                                <Copy size={18} />
                                <span className="hidden sm:inline">Copy</span>
                            </button>
                            {(isAdmin || currentMessages.filter(m => selectedMessages.has(m.id)).every(m => m.sender_id === user?.id)) && (
                                 <button 
                                    onClick={() => {
                                        setConfirmModal({ isOpen: true, type: 'message', messageId: Array.from(selectedMessages)[0] });
                                    }}
                                    className="flex items-center gap-2 px-3 md:px-4 py-2 text-sm font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/15 rounded-xl transition-all"
                                >
                                    <Trash2 size={18} />
                                    <span className="hidden sm:inline">Delete</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
            <div className="flex-shrink-0 bg-gray-950/80 backdrop-blur-2xl border-b border-white/5 z-20 pt-safe shadow-sm">
                <div className="px-3 py-3 md:px-5 md:py-4 flex items-center justify-between gap-4 w-full">
                    <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                        <button 
                            onClick={() => {
                                setActiveConversationId(null);
                                setSearchParams({});
                            }}
                            className="p-2 -ml-2 text-gray-400 hover:text-white md:hidden active:scale-90 transition-transform"
                            aria-label="Back to conversations"
                        >
                            <ArrowLeft size={24} />
                        </button>
                        <button 
                            onClick={openMobileMenu}
                            className="p-1.5 text-gray-400 hover:text-white md:hidden"
                            aria-label="Open sidebar"
                        >
                            <Menu size={22} />
                        </button>
                        {(() => {
                            let displayName = activeConversation?.name;
                            let displayAvatar = null;
                            let otherM = null;

                            if (activeConversation?.type === 'direct' && activeConversation.members) {
                                otherM = activeConversation.members.find(m => m.user_id !== user?.id);
                                if (otherM && otherM.profile) {
                                    const p = otherM.profile;
                                    displayName = p.full_name || p.username;
                                    displayAvatar = p.avatar_url;
                                }
                            }

                            return (
                                <>
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center overflow-hidden border border-white/10 shadow-lg flex-shrink-0">
                                        {displayAvatar ? (
                                            <SecureImage src={displayAvatar} alt={displayName} className="w-full h-full object-cover" fallbackType="profile" />
                                        ) : (
                                            <span className="text-white font-bold text-base md:text-lg">
                                                {displayName?.charAt(0).toUpperCase() || '?'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="font-semibold truncate max-w-[60px] xs:max-w-[100px] sm:max-w-[150px] md:max-w-[300px] text-[10px] xs:text-xs md:text-base flex items-center gap-1">
                                            {displayName || 'Chat'}
                                            {activeConversation?.type === 'direct' && otherM && otherM.profile && (
                                                <UserBadge 
                                                    planTier={otherM.profile.plan_tier}
                                                    isVerified={otherM.profile.is_verified}
                                                />
                                            )}
                                        </h2>
                                        {activeConversationId && typingUsers[activeConversationId]?.length > 0 ? (
                                            <p className="text-[10px] text-blue-400 animate-pulse font-medium flex items-center gap-1">
                                                <span className="flex gap-1">
                                                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
                                                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                                </span>
                                                Typing...
                                            </p>
                                        ) : activeConversation?.type === 'direct' && otherM ? (
                                            isUserOnline(otherM.user_id) ? (
                                                <p className="text-[8px] xs:text-[10px] text-green-400 flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> Online
                                                </p>
                                            ) : (
                                                <p className="text-[10px] text-gray-400 hidden sm:flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span> 
                                                    {otherM.profile?.show_online_status === false ? (
                                                        'offline'
                                                    ) : (
                                                        (() => {
                                                            const ts = getUserLastSeen(otherM.user_id) || otherM.profile?.last_seen;
                                                            return ts ? `Last seen ${formatDistanceToNow(new Date(ts), { addSuffix: true })}` : 'offline';
                                                        })()
                                                    )}
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

                    <div className="flex items-center gap-1 md:gap-3 flex-shrink-0 ml-auto">
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
                                >ESC</button>
                            </div>
                        ) : (
                            <button onClick={() => setIsSearchOpen(true)} className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all">
                                <Search size={20} />
                            </button>
                        )}
                        {!isPending && (
                            <div className="flex items-center gap-1 md:gap-2">
                                <button onClick={() => handleCall('voice')} className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-400/10 rounded-full transition-all flex-shrink-0" aria-label="Audio call">
                                    <Phone size={18} className="md:w-5 md:h-5" />
                                </button>
                                <button onClick={() => handleCall('video')} className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-full transition-all flex-shrink-0" aria-label="Video call">
                                    <Video size={18} className="md:w-5 md:h-5" />
                                </button>
                            </div>
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
                                    <button onClick={handleMuteChat} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg">{activeConversation?.is_muted ? 'Unmute Notifications' : 'Mute Notifications'}</button>
                                    <button onClick={handleClearChat} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg">Clear History</button>
                                    <button onClick={handleDeleteChat} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg">Delete Chat</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            )}

            {activeConversationId && hasMore[activeConversationId] && (
                <div className="flex justify-center py-2 bg-gray-950">
                    <button onClick={handleLoadMore} className="text-xs font-medium text-blue-400 hover:text-blue-300">Load older messages</button>
                </div>
            )}

            <div 
                className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6 scroll-smooth overscroll-contain transition-all scrollbar-hide"
                style={{ 
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-y',        /* browser handles scroll before JS */
                    overscrollBehavior: 'contain',
                }}
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
                            <SearchMessageItem 
                                key={msg.id} 
                                msg={msg} 
                                isOwn={msg.sender_id === user?.id} 
                                query={searchQuery} 
                                fetchUrl={fetchSignedUrl} 
                                onPreviewMedia={(data) => setPreviewMedia({ isOpen: true, ...data })}
                            />
                        ))}
                    </div>
                ) : (
                    <>
                        {currentMessages.map((msg, index) => {
                            const isGrouped = isSameSender(index);
                            const isSelected = selectedMessages.has(msg.id);
                            return (
                                <div 
                                    key={msg.id || `msg-temp-${index}`} 
                                    className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'} ${isGrouped ? '-mt-2 md:-mt-3' : 'mt-4'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
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
                                        <div className={`flex items-center mr-2 flex-shrink-0 self-center transition-all duration-200 ${msg.sender_id === user?.id ? 'order-2 ml-2 mr-0' : ''}`}>
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
                                    <div className={`max-w-[92%] md:max-w-[75%] ${isGrouped ? 'rounded-[20px]' : (msg.sender_id === user?.id ? 'rounded-[20px] rounded-br-md' : 'rounded-[20px] rounded-bl-md')} p-3.5 md:p-4 shadow-lg border ${
                                        isSelected
                                            ? 'bg-blue-600/40 border-blue-400/50 ring-1 ring-blue-500/30'
                                            : (msg.sender_id === user?.id ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-blue-500/50' : 'bg-gray-800/90 text-gray-200 border-gray-700/50')
                                    } relative group transition-all duration-200 ${isSelectionMode ? 'cursor-pointer' : ''}`}>
                                        {msg.attachment && msg.type !== 'audio' && (
                                            <div className="mb-2 rounded-lg overflow-hidden border border-black/20 bg-black/10">
                                                {msg.type === 'image' ? (
                                                    <ImageWithSignedUrl 
                                                        path={msg.attachment.storage_path} 
                                                        fetchUrl={fetchSignedUrl} 
                                                        onPreview={(url) => setPreviewMedia({ isOpen: true, url, type: 'image', fileName: msg.attachment?.file_name, isSender: msg.sender_id === user?.id })}
                                                    />
                                                ) : msg.type === 'video' ? (
                                                    <VideoWithSignedUrl 
                                                        path={msg.attachment.storage_path} 
                                                        fetchUrl={fetchSignedUrl} 
                                                        onPreview={(url) => setPreviewMedia({ isOpen: true, url, type: 'video', fileName: msg.attachment?.file_name, isSender: msg.sender_id === user?.id })}
                                                    />
                                                ) : (
                                                    <div className="p-3 flex items-center gap-3">
                                                        <Paperclip size={20} className="text-blue-400" />
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium truncate">{msg.attachment.file_name}</p>
                                                            <p className="text-[10px] opacity-60">{(msg.attachment.file_size / 1024).toFixed(1)} KB</p>
                                                        </div>
                                                    </div>
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
                                                    {msg.sender_id === user?.id && (
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
                                                            <div className="flex items-center gap-1.5 text-[10px] text-blue-300">
                                                                <Languages size={10} />
                                                                <span>Translated • {msg.original_language || 'detected'}</span>
                                                                <button onClick={() => setShowOriginal(prev => ({ ...prev, [msg.id]: true }))} className="underline hover:text-blue-200 ml-1">Original</button>
                                                            </div>
                                                            <button onClick={() => handleReport(msg.id, msg.content, translations[msg.id])} className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-gray-500 hover:text-red-400 flex items-center gap-1"><Flag size={8} /> Report</button>
                                                        </div>
                                                        <p className="break-words text-sm leading-relaxed">{translations[msg.id]}</p>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        {!isGrouped && msg.sender_id !== user?.id && (
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
                                                    {msg.sender_id === user?.id && (
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
                        })}
                        
                        {/* Typing Indicator */}
                        {activeConversationId && typingUsers[activeConversationId] && typingUsers[activeConversationId].length > 0 && (
                            <div className="flex justify-start items-center gap-2 mt-2 animate-in fade-in slide-in-from-left-2">
                                <div className="bg-gray-800 rounded-2xl p-3 flex gap-1 border border-gray-700 shadow-lg">
                                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                                </div>
                                <span className="text-[10px] text-gray-500 font-medium italic">
                                    {typingUsers[activeConversationId]?.join(', ')} {typingUsers[activeConversationId]?.length > 1 ? 'are' : 'is'} typing...
                                </span>
                            </div>
                        )}
                    </>
                )}

                {isPending && (
                    <div className="flex flex-col items-center justify-center p-8 bg-gray-800/50 backdrop-blur rounded-2xl my-6 border border-gray-700 shadow-xl">
                        <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center mb-4 text-blue-400"><MoreHorizontal size={32} /></div>
                        <p className="text-gray-200 mb-6 text-center font-medium">{otherMember ? `${otherMember.profile?.full_name || otherMember.profile?.username} wants to start a conversation with you.` : 'You have been invited to this chat.'}</p>
                        <div className="flex gap-4">
                            <button onClick={handleAccept} disabled={isAccepting} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/40 disabled:opacity-50 active:scale-95">{isAccepting ? 'Accepting...' : 'Accept Chat Request'}</button>
                            <button className="px-6 py-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all font-medium">Decline</button>
                        </div>
                    </div>
                )}
                {isWaitingForOthers && (
                    <div className="text-center p-6 bg-gray-800/30 rounded-xl my-4">
                        <Loader2 className="animate-spin text-blue-500 mx-auto mb-2" size={20} />
                        <p className="text-sm text-gray-400 italic font-medium">Waiting for acceptance...</p>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {!isAtBottom && (
                <button 
                    onClick={scrollToBottom} 
                    className="absolute bottom-24 right-6 bg-blue-600 text-white p-3 rounded-full shadow-2xl hover:bg-blue-700 transition-all animate-in zoom-in-0 duration-200 z-[30] hover:scale-110 active:scale-95 border border-white/10"
                >
                    <ArrowDown size={20} />
                </button>
            )}

            <AnimatePresence>
                {showMediaUpload && activeConversationId && (
                    <MediaUpload conversationId={activeConversationId} onUploadComplete={handleMediaUploadComplete} onCancel={() => setShowMediaUpload(false)} />
                )}
            </AnimatePresence>



            {!isPending ? (
                <div className="flex-shrink-0 bg-gray-950/95 backdrop-blur-2xl border-t border-white/10 z-20">
                    <div className="max-w-[900px] mx-auto p-3 md:p-4 pb-[max(env(safe-area-inset-bottom,20px),20px)]">
                        <form onSubmit={handleSend} className="flex flex-col gap-2 md:gap-3 max-w-full">
                            {isVoiceRecording ? (
                                <div className="flex justify-center p-3 bg-gray-800/80 backdrop-blur rounded-2xl border border-gray-700/50 animate-in slide-in-from-bottom-4 duration-300">
                                    <VoiceRecorder onSend={handleVoiceMessage} onCancel={() => setIsVoiceRecording(false)} />
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 md:gap-3">
                                    <div className="flex-1 min-w-0 flex items-center gap-1 md:gap-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] focus-within:border-blue-500/60 focus-within:bg-white/[0.1] rounded-[24px] p-2 px-4 md:px-5 transition-all duration-300 shadow-xl group/input">
                                        <button 
                                            type="button" 
                                            onClick={() => setShowMediaUpload(!showMediaUpload)} 
                                            className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-full transition-all flex-shrink-0 active:scale-90"
                                        >
                                            <Plus size={22} className={`transition-transform duration-300 ${showMediaUpload ? 'rotate-45 text-blue-400' : ''}`} />
                                        </button>
                                        
                                        <div className="flex-1 relative min-w-0 flex flex-col justify-end">
                                            {editingMessageId && (
                                                <div className="absolute bottom-full left-0 mb-2 w-full flex items-center justify-between bg-blue-900/30 text-blue-200 text-xs px-3 py-1.5 rounded-lg border border-blue-500/20 backdrop-blur-md animate-in slide-in-from-bottom-2">
                                                    <span className="font-medium flex items-center gap-1.5 px-1 py-0.5">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                        Editing Message
                                                    </span>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => { setEditingMessageId(null); setInputValue(''); }}
                                                        className="hover:bg-blue-500/20 p-1 rounded-full transition-colors"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            )}
                                            {showMentions && mentionParticipants.length > 0 && (
                                                <div className="absolute bottom-full left-0 mb-4 w-full max-w-[300px] animate-in slide-in-from-bottom-2 duration-200">
                                                    <MentionSuggestions users={mentionParticipants} onSelect={handleSelectMention} />
                                                </div>
                                            )}
                                            <input 
                                                id="chat-window-input" 
                                                name="message" 
                                                type="text" 
                                                value={inputValue} 
                                                onChange={handleInputChange} 
                                                placeholder="Type a message..." 
                                                autoComplete="off" 
                                                spellCheck={true}
                                                autoCapitalize="sentences"
                                                autoCorrect="on"
                                                className="w-full bg-transparent text-white py-2.5 md:py-3.5 px-1 md:px-2 focus:outline-none disabled:opacity-50 text-[16px] md:text-sm placeholder:text-gray-500 font-medium" 
                                            />
                                        </div>

                                        <div className="flex items-center gap-0.5 md:gap-1 flex-shrink-0">
                                            <button 
                                                type="button" 
                                                onClick={() => setIsVoiceRecording(true)} 
                                                className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-full transition-all active:scale-90"
                                                title="Voice message"
                                            >
                                                <Mic size={20} />
                                            </button>
                                            
                                            <div className="relative md:block hidden">
                                                <button 
                                                    type="button" 
                                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                                                    className={`p-2 rounded-full transition-all active:scale-90 ${showEmojiPicker ? 'text-yellow-400 bg-yellow-400/10' : 'text-gray-400 hover:text-yellow-400 hover:bg-yellow-400/10'}`}
                                                >
                                                    <Smile size={20} />
                                                </button>
                                                {showEmojiPicker && (
                                                    <div className="absolute bottom-full right-0 mb-4 p-3 bg-gray-800/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-30 grid grid-cols-4 gap-2 animate-in zoom-in-95 duration-200 origin-bottom-right">
                                                        {emojis.map(emoji => (
                                                            <button 
                                                                key={emoji} 
                                                                type="button" 
                                                                onClick={() => { const newValue = inputValue + emoji; setInputValue(newValue); setShowEmojiPicker(false); handleInputChange(newValue); }} 
                                                                className="text-xl hover:bg-white/10 p-2 rounded-xl transition-all hover:scale-110 active:scale-90"
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
                                        disabled={!inputValue.trim()} 
                                        className={`w-11 h-11 md:w-12 md:h-12 flex items-center justify-center rounded-full transition-all duration-300 shadow-xl active:scale-90 flex-shrink-0 ${
                                            inputValue.trim() 
                                            ? 'bg-blue-600 text-white shadow-blue-600/30 hover:bg-blue-500 hover:-translate-y-0.5' 
                                            : 'bg-gray-800 text-gray-500 opacity-50 cursor-not-allowed'
                                        }`}
                                    >
                                        <Send size={18} className={`transition-transform duration-300 ${inputValue.trim() ? 'translate-x-0.5 -translate-y-0.5' : ''}`} />
                                    </button>
                                </div>
                            )}
                            <div className="hidden md:flex justify-between items-center px-4">
                                <p className="text-[10px] text-gray-500 font-medium flex items-center gap-1.5 opacity-60">
                                    <CheckCheck size={12} className="text-blue-500/70" /> End-to-end encrypted
                                </p>
                                {inputValue.length > 0 && (
                                    <p className="text-[10px] text-gray-600 font-bold">{inputValue.length} characters</p>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            ) : (
                <div className="flex-shrink-0 bg-gray-950 border-t border-white/5 p-8 text-center text-gray-500 text-sm font-medium">
                    Please accept the message request to start chatting.
                </div>
            )}

            <MediaPreviewModal isOpen={previewMedia.isOpen} onClose={() => setPreviewMedia(prev => ({ ...prev, isOpen: false }))} mediaUrl={previewMedia.url} mediaType={previewMedia.type} fileName={previewMedia.fileName} isSender={previewMedia.isSender} />

            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={async () => {
                    const { type } = confirmModal;
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    
                    if (type === 'message' && selectedMessages.size > 0) {
                        const toDelete = Array.from(selectedMessages);
                        const loadingToast = toDelete.length > 1 
                            ? toast.loading(`Deleting ${toDelete.length} messages...`) 
                            : undefined;
                        try {
                            for (const msgId of toDelete) {
                                await deleteMessage(msgId);
                            }
                            toast.success(
                                toDelete.length > 1 ? `${toDelete.length} messages deleted` : 'Message deleted',
                                loadingToast ? { id: loadingToast } : undefined
                            );
                            clearSelection();
                        } catch {
                            toast.error('Failed to delete message(s)', loadingToast ? { id: loadingToast } : undefined);
                        }
                    } else if (type === 'clear' && activeConversationId) {
                        const loadingToast = toast.loading('Clearing history...');
                        try {
                            await clearChatHistory(activeConversationId);
                            toast.success('Chat cleared', { id: loadingToast });
                        } catch {
                            toast.error('Failed to clear chat', { id: loadingToast });
                        }
                    } else if (type === 'delete_chat' && activeConversationId) {
                        const loadingToast = toast.loading('Deleting chat...');
                        try {
                            await deleteConversation(activeConversationId);
                            toast.success('Chat deleted', { id: loadingToast });
                        } catch {
                            toast.error('Failed to delete chat', { id: loadingToast });
                        }
                    }
                }}
                title={
                    confirmModal.type === 'message' 
                        ? (selectedMessages.size > 1 ? `Delete ${selectedMessages.size} Messages` : 'Delete Message')
                        : confirmModal.type === 'clear' ? 'Clear History' : 'Delete Chat'
                }
                message={
                    confirmModal.type === 'message' 
                        ? (selectedMessages.size > 1 
                            ? `Are you sure you want to delete ${selectedMessages.size} selected messages? This action cannot be undone.`
                            : 'Are you sure you want to delete this message? This action cannot be undone.')
                        : confirmModal.type === 'clear' ? 'Are you sure you want to clear all messages in this chat? This only affects your view.'
                        : 'Are you sure you want to delete this conversation forever? All history will be lost.'
                }
                confirmText={
                    confirmModal.type === 'message' ? 'Delete' : 
                    confirmModal.type === 'clear' ? 'Clear' : 'Delete'
                }
                variant="danger"
            />

            {/* Forward Message Modal */}
            <ForwardMessageModal
                isOpen={forwardModal.isOpen}
                onClose={() => { setForwardModal({ isOpen: false, messages: [] }); clearSelection(); }}
                messageContent={forwardModal.messages.map(m => m.content).join('\n')}
                messageType={forwardModal.messages.length === 1 ? forwardModal.messages[0]?.type : undefined}
                onForward={async (targetConversationId: string) => {
                    try {
                        for (const msg of forwardModal.messages) {
                            const prefix = '↪️ Forwarded: ';
                            await sendMessageToConversation(targetConversationId, prefix + msg.content);
                        }
                        toast.success(`Message${forwardModal.messages.length > 1 ? 's' : ''} forwarded`);
                        clearSelection();
                    } catch {
                        toast.error('Failed to forward message');
                    }
                }}
            />
        </div>
    );
};

// --- Helper Components ---



const ImageWithSignedUrl = ({ path, fetchUrl, onPreview }: { path: string, fetchUrl: (p: string) => Promise<string | null>, onPreview?: (url: string) => void }) => {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => { fetchUrl(path).then(setUrl); }, [path, fetchUrl]);
    return <SecureImage src={url || undefined} alt="Attached" className="max-w-full h-auto cursor-pointer hover:opacity-95 transition-opacity" onClick={() => { if (url) { if (onPreview) onPreview(url); else window.open(url, '_blank'); } }} />;
};

const VideoWithSignedUrl = ({ path, fetchUrl, onPreview }: { path: string, fetchUrl: (p: string) => Promise<string | null>, onPreview?: (url: string) => void }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => { fetchUrl(path).then(u => { setUrl(u); if (u) setIsLoading(false); }); }, [path, fetchUrl]);
    if (isLoading) return <div className="aspect-video bg-gray-700 animate-pulse flex items-center justify-center"><Loader2 className="animate-spin text-gray-500" /></div>;
    if (!url) return <div className="p-4 text-center text-xs text-gray-500">Video failed to load</div>;
    return (
        <div className="relative group cursor-pointer" onClick={() => onPreview && onPreview(url)}>
            <video src={url} className="max-w-full rounded-lg" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white border border-white/30"><Maximize size={20} /></div>
            </div>
        </div>
    );
};



const SearchMessageItem = ({ 
    msg, isOwn, query, fetchUrl, onPreviewMedia 
}: { 
    msg: Message, 
    isOwn: boolean, 
    query: string, 
    fetchUrl: (p: string) => Promise<string | null>, 
    onPreviewMedia: (data: { url: string; type: 'image' | 'video'; fileName?: string; isSender?: boolean }) => void 
}) => {
    const highlight = (text: string | null | undefined) => {
        if (!text) return '';
        if (!query) return text;
        try {
            const parts = text.split(new RegExp(`(${query})`, 'gi'));
            return parts.map((part, i) => part.toLowerCase() === query.toLowerCase() ? <span key={i} className="bg-yellow-500/30 text-yellow-200 rounded-sm px-0.5">{part}</span> : part);
        } catch (e) {
            console.error('[Chat] Highlight error:', e);
            return text;
        }
    };
    
    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? '' : d.toLocaleString();
    };

    return (
        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} opacity-90 hover:opacity-100 transition-opacity`}>
            <div className={`max-w-[85%] rounded-xl p-3 border ${isOwn ? 'bg-blue-600/20 border-blue-500/30' : 'bg-gray-800 border-gray-700'}`}>
                {msg.attachment && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-black/20 bg-black/10 max-h-32">
                        {msg.type === 'image' ? (
                            <ImageWithSignedUrl 
                                path={msg.attachment.storage_path} 
                                fetchUrl={fetchUrl} 
                                onPreview={(url) => onPreviewMedia({ url, type: 'image', fileName: msg.attachment?.file_name, isSender: isOwn })} 
                            />
                        ) : msg.type === 'video' ? (
                            <VideoWithSignedUrl 
                                path={msg.attachment.storage_path} 
                                fetchUrl={fetchUrl} 
                                onPreview={(url) => onPreviewMedia({ url, type: 'video', fileName: msg.attachment?.file_name, isSender: isOwn })} 
                            />
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
                <p className="text-[10px] text-gray-500 mt-2">{formatDate(msg.created_at)}</p>
            </div>
        </div>
    );
};

export default ChatWindow;
