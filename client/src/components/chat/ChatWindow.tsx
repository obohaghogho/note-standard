import React, { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback, startTransition } from 'react';
import { useChatGesture } from '../../hooks/useChatGesture';
import { AnimatePresence } from 'framer-motion';
import { useChat } from '../../context/ChatContext';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import type { Message } from '../../context/ChatContext';
import { usePresence } from '../../context/PresenceContext';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import SecureImage from '../common/SecureImage';
import ImageWithSignedUrl from '../common/ImageWithSignedUrl';
import VideoWithSignedUrl from '../common/VideoWithSignedUrl';
import { Send, Phone, Video, Plus, Paperclip, Smile, Search, MoreHorizontal, CheckCheck, Loader2, ArrowDown, Mic, ArrowLeft, Trash2, Share2, X, Copy, Menu, Pencil, MessageCircle, Reply } from 'lucide-react';
import { useWebRTC } from '../../context/WebRTCContext';
import { MediaUpload } from './MediaUpload';
import { VoiceRecorder } from './VoiceRecorder';
import { API_URL } from '../../lib/api';
import toast from 'react-hot-toast';
import { MediaPreviewModal } from './MediaPreviewModal';
import { MentionSuggestions } from './MentionSuggestions';
import { ForwardMessageModal } from './ForwardMessageModal';

import { ConfirmationModal } from '../common/ConfirmationModal';
import { applyAutoCorrect } from '../../utils/textUtils';
import { UserBadge } from '../common/UserBadge';
import MessageBubble from './MessageBubble';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';

const ChatWindow: React.FC = () => {
    const { 
        activeConversationId, setActiveConversationId, messages, sendMessage, loading, 
        conversations, acceptConversation, deleteConversation, deleteMessage, editMessage,
        muteConversation, clearChatHistory, loadMoreMessages, hasMore,
        sendTypingStatus, typingUsers, sendMessageToConversation,
        drafts, setDraft, sendMediaMessage,
        blockUser, unblockUser
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
    const [replyTo, setReplyTo] = useState<{ id: string; content: string; sender_id: string; type?: string; attachment?: { id: string; file_name: string; file_type: string; file_size: number; storage_path: string; metadata: Record<string, unknown> } } | null>(null);

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
        onSwipeRight: (id) => {
            const msg = currentMessages.find(m => m.id === id);
            if (msg) {
                setReplyTo({
                    id: msg.id,
                    content: msg.content,
                    sender_id: msg.sender_id,
                    type: msg.type,
                    attachment: msg.attachment
                });
            }
        },
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
    const signedUrlsRef = useRef<Record<string, string>>({});
    useEffect(() => {
        signedUrlsRef.current = signedUrls;
    }, [signedUrls]);
    
    // Confirmation state
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        type: 'message' | 'clear' | 'delete_chat' | 'block_user';
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
    const composerRef = useRef<HTMLDivElement>(null);
    const virtuosoRef = useRef<VirtuosoHandle>(null);


    const [translations, setTranslations] = useState<{ [key: string]: string }>({});
    const [showOriginal, setShowOriginal] = useState<{ [key: string]: boolean }>({});
    const [showScrollDown, setShowScrollDown] = useState(false);
    const prevConvIdRef = useRef<string | null>(null);
    
    // Search states
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Message[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isAccepting, setIsAccepting] = useState(false);
    const [unreadCountWhileScrolled, setUnreadCountWhileScrolled] = useState(0);
    
    // Mentions state
    const [showMentions, setShowMentions] = useState(false);
    const [mentionSearch, setMentionSearch] = useState('');
    const [mentionParticipants, setMentionParticipants] = useState<{ id: string; username: string; full_name?: string; avatar_url?: string }[]>([]);
    
    // Ref to prevent translation loops
    const translatingRef = useRef<Set<string>>(new Set());
    
    const emojis = ['😀', '😂', '😍', '🙌', '🔥', '👍', '🙏', '💯', '✨', '❤️', '🎉', '😊', '✅', '🚀', '👀', '💡'];

    const preferredLanguage = profile?.preferred_language || 'en';

    const currentMessages = useMemo(() => activeConversationId ? messages[activeConversationId] || [] : [], [messages, activeConversationId]);
    const activeConversation = useMemo(() => conversations.find(c => c.id === activeConversationId), [conversations, activeConversationId]);

    // Stable message count ref — avoids recreating scrollToBottom and layout effects on every tick update.
    // scrollToBottom only needs to know WHEN the length changes, not the full array.
    const currentMessagesLengthRef = useRef(currentMessages.length);
    currentMessagesLengthRef.current = currentMessages.length;

    // Stable message ID list — used by translation effect to detect truly new messages
    // without re-running on every tick/status update. A message's ID never changes.
    const messageIdsKey = useMemo(() => currentMessages.map(m => m.id).join(','), [currentMessages]);

    const myMember = activeConversation?.members.find((m: { user_id: string; status: string }) => m.user_id === user?.id);
    const isPending = myMember?.status === 'pending';

    const otherMember = useMemo(() => {
        if (!activeConversation?.members || !user) return null;
        return activeConversation.members.find(m => m.user_id !== user.id) || null;
    }, [activeConversation?.members, user]);

    const isWaitingForOthers = myMember?.status === 'accepted' && otherMember?.status === 'pending';



    const isKeyboardTransitioning = useRef(false);
    const wasAtBottomBeforeKeyboard = useRef(false);
    const showScrollDownRef = useRef(showScrollDown);
    useEffect(() => {
        showScrollDownRef.current = showScrollDown;
    }, [showScrollDown]);

    const scrollToBottom = useCallback((behavior: ScrollBehavior | 'instant' | 'auto' = 'smooth') => {
        if (isKeyboardTransitioning.current) return;
        const len = currentMessagesLengthRef.current;
        const isNearBottom = !showScrollDownRef.current;

        // Fast path: If already near the bottom, Virtuoso doesn't need to jump indexes.
        // Natively scroll the container to the absolute bottom to ensure the footer spacer is visible.
        if (isNearBottom && scrollContainerRef.current) {
            requestAnimationFrame(() => {
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTo({
                        top: scrollContainerRef.current.scrollHeight,
                        behavior: behavior === 'instant' ? 'auto' : behavior as 'auto' | 'smooth'
                    });
                }
            });
            setShowScrollDown(false);
            setUnreadCountWhileScrolled(0);
            return;
        }

        // If user scrolled far up, force Virtuoso to jump to the last item so it renders.
        if (virtuosoRef.current && len > 0) {
            virtuosoRef.current.scrollToIndex({
                index: len - 1,
                align: 'end',
                behavior: behavior === 'instant' ? 'auto' : behavior as 'auto' | 'smooth'
            });

            // After Virtuoso renders the last item, ensure we scroll all the way down
            // to reveal the footer spacer, pushing the last message above the composer.
            requestAnimationFrame(() => {
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTo({
                        top: scrollContainerRef.current.scrollHeight,
                        behavior: behavior === 'instant' ? 'auto' : behavior as 'auto' | 'smooth'
                    });
                }
            });

            setShowScrollDown(false);
            setUnreadCountWhileScrolled(0);
        } else if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: behavior === 'instant' ? 'auto' : behavior as ScrollBehavior, block: 'end' });
            setShowScrollDown(false);
            setUnreadCountWhileScrolled(0);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Stable forever — reads currentMessagesLengthRef.current at call time

    // Track composer height dynamically via ResizeObserver.
    useLayoutEffect(() => {
        const el = composerRef.current;
        if (!el) return;
        
        let rafId: number;
        const observer = new ResizeObserver(() => {
            if (isKeyboardTransitioning.current) return; // No DOM reads/writes during transition
            
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                if (!el || isKeyboardTransitioning.current) return;
                const h = el.getBoundingClientRect().height;
                document.documentElement.style.setProperty('--composer-height', `${h}px`);
                
                const isInputFocused = document.activeElement?.id === 'chat-window-input';
                const isNearBottom = !showScrollDownRef.current;
                if (isNearBottom || isInputFocused) {
                    scrollToBottom('instant');
                }
            });
        });
        observer.observe(el);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(rafId);
        };
    }, [scrollToBottom]);

    // Hook visualViewport resize to stabilize scroll
    useEffect(() => {
        let resizeTimeout: ReturnType<typeof setTimeout>;
        
        const handleViewportResize = () => {
            if (!isKeyboardTransitioning.current) {
                isKeyboardTransitioning.current = true;
                // Capture immutable snapshot before keyboard animation
                wasAtBottomBeforeKeyboard.current = !showScrollDownRef.current;
            }
            
            clearTimeout(resizeTimeout);
            
            // Wait for the keyboard animation to settle completely
            resizeTimeout = setTimeout(() => {
                const reconcile = () => {
                    if (wasAtBottomBeforeKeyboard.current) {
                        if (virtuosoRef.current && currentMessages.length > 0) {
                            virtuosoRef.current.scrollToIndex({
                                index: currentMessages.length - 1,
                                align: 'end',
                                behavior: 'auto'
                            });
                            requestAnimationFrame(() => {
                                if (scrollContainerRef.current) {
                                    scrollContainerRef.current.scrollTo({
                                        top: scrollContainerRef.current.scrollHeight,
                                        behavior: 'auto'
                                    });
                                }
                            });
                            setShowScrollDown(false);
                            setUnreadCountWhileScrolled(0);
                        } else if (scrollContainerRef.current) {
                            scrollContainerRef.current.scrollTo({
                                top: scrollContainerRef.current.scrollHeight,
                                behavior: 'auto'
                            });
                            setShowScrollDown(false);
                            setUnreadCountWhileScrolled(0);
                        }
                    }

                    // 1-frame cooldown after reconciliation to prevent delayed event leakage on low-end Androids
                    requestAnimationFrame(() => {
                        isKeyboardTransitioning.current = false;
                    });
                };
                
                // Double rAF ensures Virtuoso's ResizeObserver has fully processed the new container height
                requestAnimationFrame(() => {
                    requestAnimationFrame(reconcile);
                });
            }, 250); // Increased timeout to 250ms for slower Android keyboard animations
        };
        
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleViewportResize);
            return () => {
                window.visualViewport?.removeEventListener('resize', handleViewportResize);
                clearTimeout(resizeTimeout);
            };
        }
    }, [currentMessages.length]);

    const handleLoadMore = async () => {
        if (!activeConversationId) return;
        await loadMoreMessages(activeConversationId);
    };

    // We can use native IntersectionObserver to check if user has scrolled away from the bottom anchor
    useEffect(() => {
        const anchor = messagesEndRef.current;
        if (!anchor) return;
        
        const observer = new IntersectionObserver(([entry]) => {
            const isVisible = entry.isIntersecting;
            setShowScrollDown(!isVisible);
            if (isVisible) {
                setUnreadCountWhileScrolled(0);
            }
        }, {
            root: scrollContainerRef.current,
            threshold: 0.1
        });
        
        observer.observe(anchor);
        return () => observer.disconnect();
    }, [activeConversationId]);

    // Simple auto-scroll lock when chat changes
    useLayoutEffect(() => {
        if (activeConversationId && prevConvIdRef.current !== activeConversationId) {
            prevConvIdRef.current = activeConversationId;
            scrollToBottom('instant');
        }
    }, [activeConversationId, scrollToBottom]);

    // Auto-scroll on new message if already at bottom
    const prevMessagesLengthRef = useRef(currentMessages.length);
    useLayoutEffect(() => {
        if (currentMessages.length > prevMessagesLengthRef.current) {
            // New message arrived
            if (!showScrollDown) {
                scrollToBottom('smooth');
            } else {
                setUnreadCountWhileScrolled(prev => prev + 1);
            }
        }
        prevMessagesLengthRef.current = currentMessages.length;
    }, [currentMessages.length, showScrollDown, scrollToBottom]);

    // Initialize input from draft
    useEffect(() => {
        if (activeConversationId) {
            setInputValue(drafts[activeConversationId] || '');
        }
    }, [activeConversationId, drafts]);

    // Reset all per-room ephemeral state when switching conversations.
    // This prevents stale selections, translations, and reply context from
    // leaking across different chat rooms (WhatsApp/Telegram-grade isolation).
    useEffect(() => {
        setSelectedMessages(new Set());
        setTranslations({});
        setShowOriginal({});
        setReplyTo(null);
        setEditingMessageId(null);
        setShowMoreMenu(false);
        setIsSearchOpen(false);
        setSearchQuery('');
        setSearchResults([]);
        setShowEmojiPicker(false);
    }, [activeConversationId]);

    const translationsRef = useRef(translations);
    useEffect(() => {
        translationsRef.current = translations;
    }, [translations]);

    useEffect(() => {
        const translateNewMessages = async () => {
            if (!activeConversationId || !preferredLanguage || !session?.access_token) return;

            // Use current messages from ref to avoid stale closure, but filter by the
            // stable ID key so this only runs when NEW messages arrive, not on status/tick updates.
            const msgs = currentMessages;
            const messagesToTranslate = msgs.filter(msg => {
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
    // CRITICAL: depend on messageIdsKey (stable ID list), NOT currentMessages.
    // Tick updates change currentMessages reference but NOT messageIdsKey.
    // This prevents a translation API call on every delivered/read status update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messageIdsKey, activeConversationId, preferredLanguage, user?.id, session?.access_token]);

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

    const handleReport = async (msgId: string, original: string, translated?: string) => {
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
        if (signedUrlsRef.current[path]) return signedUrlsRef.current[path];
        try {
            const res = await fetch(`${API_URL}/api/media/signed-url?path=${encodeURIComponent(path)}`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            if (res.ok) {
                const { url } = await res.json();
                setSignedUrls(prev => ({ ...prev, [path]: url }));
                signedUrlsRef.current[path] = url; // optimistic cache write to prevent concurrency races
                return url;
            }
        } catch (err) {
            console.error('Failed to get signed URL:', err);
        }
        return null;
    }, [session?.access_token]);

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const textToSend = inputValue.trim();
        if (!textToSend || !activeConversationId) return;

        // Clear UI state synchronously for instant feedback
        setInputValue('');
        if (activeConversationId) setDraft(activeConversationId, '');
        setShowMentions(false);
        setShowScrollDown(false); // Force scroll lock to bottom so the new message is fully visible

        // Reset textarea height back to single-line (WhatsApp collapses on send)
        const textarea = document.getElementById('chat-window-input') as HTMLTextAreaElement | null;
        if (textarea) {
            textarea.style.height = 'auto';
        }

        const currentEditingId = editingMessageId;
        setEditingMessageId(null);

        try {
            if (currentEditingId) {
                await editMessage(currentEditingId, textToSend);
            } else {
                await sendMessage({
                    content: textToSend,
                    type: 'text',
                    replyTo: replyTo ? { ...replyTo } : undefined
                });
                setReplyTo(null);
            }
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } }; message?: string };
            // Restore state if network request fails
            setInputValue(textToSend);
            setEditingMessageId(currentEditingId);
            const serverMsg = error.response?.data?.error || error.message;
            toast.error(serverMsg ? `Error: ${serverMsg}` : (currentEditingId ? 'Failed to edit message' : 'Failed to send message'));
        }
    };

    const handleMediaUploadComplete = async (file: File, type: 'image' | 'video') => {
        setShowMediaUpload(false);
        try {
            await sendMediaMessage(file, type);
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

    const handleBlockUser = async () => {
        if (!activeConversationId || !otherMember?.user_id) return;
        setShowMoreMenu(false);
        if (activeConversation?.blockedByMe) {
            await unblockUser(otherMember.user_id);
        } else {
            setConfirmModal({ isOpen: true, type: 'block_user' });
        }
    };

    const handleVoiceMessage = async (blob: Blob) => {
        if (!activeConversationId) return;
        setIsVoiceRecording(false);
        try {
            await sendMediaMessage(blob, 'audio');
        } catch (err) {
            console.error('[ChatWindow] Voice message error:', err);
            toast.error('Failed to send voice message');
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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) => {
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
                        setMentionParticipants(filtered as { id: string; username: string; full_name?: string; avatar_url?: string }[]);
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

    // isSameSender is inlined into Virtuoso itemContent for chronological array

    const getSenderName = (senderId: string) => {
        if (senderId === user?.id) return 'You';
        const member = activeConversation?.members.find(m => m.user_id === senderId);
        return member?.profile?.username || member?.profile?.full_name || 'Member';
    };

    if (!activeConversationId) {
        return (
            <div className="flex-grow flex flex-col items-center justify-center h-full text-gray-400 bg-crystal relative p-6">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-none z-0" />
                <div className="relative z-10 text-center flex flex-col items-center gap-3 bg-black/45 backdrop-blur-xl border border-white/10 p-8 rounded-2xl max-w-sm shadow-2xl">
                    <MessageCircle size={40} className="text-blue-400/80 animate-pulse" />
                    <p className="font-semibold text-white/80">Select a conversation to start chatting</p>
                    <p className="text-xs text-gray-500 leading-relaxed">Pick any member or channel from the sidebar list to begin your secure conversation.</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex-grow flex items-center justify-center h-full bg-crystal text-gray-400 relative">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-none z-0" />
                <div className="relative z-10 flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                    <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Decrypting messages...</p>
                </div>
            </div>
        );
    }

    // Secondary guard: activeConversationId is set but not yet in the conversations
    // list (happens immediately after an account switch while the new account's
    // conversations are still loading). Show a spinner instead of the broken "?" header.
    if (activeConversationId && !activeConversation) {
        return (
            <div className="flex-grow flex items-center justify-center h-full bg-crystal text-gray-400 relative">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-none z-0" />
                <div className="relative z-10 flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                    <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Loading conversation...</p>
                </div>
            </div>
        );
    }


    return (
        <div className="chat-root bg-crystal text-white w-full h-full flex flex-col relative overflow-hidden md:max-w-[1200px] md:mx-auto md:shadow-2xl md:border-x md:border-white/5">
            {/* Immersive glass layer overlay */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-none z-0" />
            {/* ── Selection Action Bar (WhatsApp-style) ── */}
            {isSelectionMode ? (
                <div className="chat-header border-b border-blue-500/30 bg-blue-600/10 backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
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
                                <button 
                                    onClick={() => {
                                        const msgId = Array.from(selectedMessages)[0];
                                        const msg = currentMessages.find(m => m.id === msgId);
                                        if (msg) {
                                            setReplyTo({
                                                id: msg.id,
                                                content: msg.content,
                                                sender_id: msg.sender_id,
                                                type: msg.type,
                                                attachment: msg.attachment
                                            });
                                            clearSelection();
                                        }
                                    }}
                                    className="flex items-center gap-2 px-3 md:px-4 py-2 text-sm font-semibold text-purple-400 hover:text-purple-300 hover:bg-purple-500/15 rounded-xl transition-all"
                                >
                                    <Reply size={18} />
                                    <span className="hidden sm:inline">Reply</span>
                                </button>
                            )}
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
            <div className="chat-header bg-gray-950/95 backdrop-blur-md border-b border-white/5 shadow-md">
                <div className="px-3 py-2.5 md:px-5 md:py-4 flex items-center justify-between gap-4 w-full">
                    <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                        <button 
                            onClick={() => {
                                startTransition(() => {
                                    setActiveConversationId(null);
                                    setSearchParams({});
                                });
                            }}
                            className="p-2 -ml-2 text-gray-400 active:text-white md:hover:text-white md:hidden active:scale-90 transition-transform"
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
                                        <h2 className="font-semibold flex items-center gap-1 min-w-0 max-w-[150px] xs:max-w-[180px] sm:max-w-[240px] md:max-w-[320px]">
                                            <span className="truncate text-sm md:text-base">{displayName || 'Chat'}</span>
                                            {activeConversation?.type === 'direct' && otherM && otherM.profile && (
                                                <div className="flex-shrink-0">
                                                    <UserBadge 
                                                        planTier={otherM.profile.plan_tier}
                                                        isVerified={otherM.profile.is_verified}
                                                    />
                                                </div>
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
                                    {activeConversation?.type === 'direct' && (
                                        <button onClick={handleBlockUser} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg">
                                            {activeConversation.blockedByMe ? 'Unblock User' : 'Block User'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            )}

                {isSearchOpen && searchQuery.trim() !== '' ? (
                    <div className="chat-messages custom-scrollbar p-3 md:p-6 gap-1 md:gap-2" style={{ touchAction: 'pan-y' }}>
                        <div className="space-y-4 flex flex-col w-full">
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
                            {/* Spacer to prevent search results from hiding behind absolute input bar */}
                            <div className="w-full flex-shrink-0" style={{ height: 'calc(var(--composer-height, 80px) + 16px)' }} />
                        </div>
                    </div>
                ) : (
                    <div 
                        className="chat-messages custom-scrollbar p-3 md:p-6"
                        ref={(ref) => {
                            if (ref) scrollContainerRef.current = ref as HTMLDivElement;
                        }}
                        onScroll={(e) => {
                            const target = e.target as HTMLDivElement;
                            const isAtBottom = Math.abs(target.scrollHeight - target.clientHeight - target.scrollTop) < 150;
                            setShowScrollDown(!isAtBottom);
                            if (isAtBottom) {
                                setUnreadCountWhileScrolled(0);
                            }
                        }}
                    >
                        <div className="flex flex-col gap-1 md:gap-2">
                            {activeConversationId && hasMore[activeConversationId] && (
                                <div className="flex justify-center py-4 bg-transparent relative z-10 w-full flex-shrink-0">
                                    <button onClick={handleLoadMore} className="text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline">Load older messages</button>
                                </div>
                            )}
                            {isPending && (
                                <div className="flex flex-col items-center justify-center p-8 bg-gray-800/50 backdrop-blur rounded-2xl my-6 border border-gray-700 shadow-xl w-full">
                                    <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center mb-4 text-blue-400"><MoreHorizontal size={32} /></div>
                                    <p className="text-gray-200 mb-6 text-center font-medium">{otherMember ? `${otherMember.profile?.full_name || otherMember.profile?.username} wants to start a conversation with you.` : 'You have been invited to this chat.'}</p>
                                    <div className="flex gap-4">
                                        <button onClick={handleAccept} disabled={isAccepting} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/40 disabled:opacity-50 active:scale-95">{isAccepting ? 'Accepting...' : 'Accept Chat Request'}</button>
                                        <button className="px-6 py-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all font-medium">Decline</button>
                                    </div>
                                </div>
                            )}
                            {isWaitingForOthers && (
                                <div className="text-center p-6 bg-gray-800/30 rounded-xl my-4 w-full">
                                    <Loader2 className="animate-spin text-blue-500 mx-auto mb-2" size={20} />
                                    <p className="text-sm text-gray-400 italic font-medium">Waiting for acceptance...</p>
                                </div>
                            )}
                        </div>

                        {currentMessages.slice(-100).map((msg, index, array) => {
                            const isGrouped = index > 0 && 
                                array[index].sender_id === array[index - 1].sender_id && 
                                (new Date(array[index].created_at).getTime() - new Date(array[index - 1].created_at).getTime() < 60000);
                            const isSelected = selectedMessages.has(msg.id);
                            
                            return (
                                <MessageBubble 
                                    key={msg.id}
                                    msg={msg}
                                    isGrouped={isGrouped}
                                    isSelected={isSelected}
                                    isSelectionMode={isSelectionMode}
                                    currentUserId={user?.id}
                                    translations={translations}
                                    showOriginal={showOriginal}
                                    gesture={gesture}
                                    getSenderName={getSenderName}
                                    toggleMessageSelection={toggleMessageSelection}
                                    setShowOriginal={setShowOriginal}
                                    handleReport={handleReport}
                                    handleManualTranslate={handleManualTranslate}
                                    fetchSignedUrl={fetchSignedUrl}
                                    setPreviewMedia={(data) => setPreviewMedia({ ...data, isOpen: true })}
                                />
                            );
                        })}

                        <div className="flex flex-col gap-1 md:gap-2">
                            {activeConversationId && typingUsers[activeConversationId] && typingUsers[activeConversationId].length > 0 && (
                                <div className="flex justify-start items-center gap-2 mt-2 animate-in fade-in slide-in-from-left-2 w-full">
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
                            {/* Dedicated bottom spacer to serve as a ref anchor and clear the absolute composer on mobile */}
                            <div ref={messagesEndRef} className="chat-footer-spacer" />
                        </div>
                    </div>
                )}

            {showScrollDown && (
                <button 
                    onClick={() => scrollToBottom()} 
                    className="absolute right-3 md:right-6 bg-blue-600 text-white p-2.5 md:p-3 rounded-full shadow-[0_4px_20px_rgba(37,99,235,0.6)] hover:bg-blue-700 transition-all animate-in zoom-in-0 duration-200 z-30 hover:scale-110 active:scale-95 border border-blue-400/30"
                    style={{ bottom: 'calc(var(--composer-height, 80px) + 1rem)' }}
                >
                    <ArrowDown size={20} />
                    {unreadCountWhileScrolled > 0 && (
                        <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-gray-900 animate-in zoom-in-50">
                            {unreadCountWhileScrolled}
                        </span>
                    )}
                </button>
            )}

            <AnimatePresence>
                {showMediaUpload && activeConversationId && (
                    <MediaUpload onUploadComplete={handleMediaUploadComplete} onCancel={() => setShowMediaUpload(false)} />
                )}
            </AnimatePresence>



            {!isPending ? (
                <div className="chat-input-bar absolute md:relative bottom-0 inset-x-0 bg-gray-950/80 backdrop-blur-2xl border-t border-white/10 z-40" ref={composerRef}>
                    <div className="max-w-[900px] mx-auto px-3 py-2 md:p-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                        {activeConversation?.isBlocked ? (
                            <div className="flex flex-col items-center justify-center p-4 bg-gray-800/80 rounded-2xl border border-gray-700/50">
                                <p className="text-sm font-medium text-gray-300 text-center">
                                    {activeConversation.blockedByMe 
                                        ? "You blocked this user. Unblock to send a message." 
                                        : "You can no longer send messages to this user."}
                                </p>
                                {activeConversation.blockedByMe && (
                                    <button 
                                        onClick={handleBlockUser} 
                                        className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition-colors"
                                    >
                                        Unblock User
                                    </button>
                                )}
                            </div>
                        ) : (
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
                                            {replyTo && (
                                                <div className="absolute bottom-full left-0 mb-2 w-full flex flex-col justify-center bg-gray-800/80 text-gray-200 text-xs px-3 py-2 rounded-t-xl border-l-4 border-l-blue-500 border-t border-r border-gray-700 backdrop-blur-md animate-in slide-in-from-bottom-2 z-10">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-blue-400">
                                                            {replyTo.sender_id === user?.id ? 'You' : (otherMember?.profile?.full_name || otherMember?.profile?.username || 'User')}
                                                        </span>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setReplyTo(null)}
                                                            className="hover:bg-gray-700 p-1 rounded-full transition-colors"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                    <span className="truncate opacity-80 mt-1 max-w-[90%]">
                                                        {replyTo.content || (replyTo.attachment ? 'Media message' : 'Message')}
                                                    </span>
                                                </div>
                                            )}
                                            {showMentions && mentionParticipants.length > 0 && (
                                                <div className="absolute bottom-full left-0 mb-4 w-full max-w-[300px] animate-in slide-in-from-bottom-2 duration-200">
                                                    <MentionSuggestions users={mentionParticipants} onSelect={handleSelectMention} />
                                                </div>
                                            )}
                                            {/* WhatsApp-grade textarea:
                                                - Grows from 1 line to 5 lines naturally
                                                - Internal scroll activates after 5 lines
                                                - Enter sends, Shift+Enter = newline
                                                - onInput auto-resizes height
                                            */}
                                            <textarea
                                                id="chat-window-input"
                                                name="message"
                                                rows={1}
                                                value={inputValue}
                                                onChange={handleInputChange}
                                                onKeyDown={(e) => {
                                                    // Enter sends message (like WhatsApp Web)
                                                    // Shift+Enter inserts newline
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSend(e as unknown as React.FormEvent);
                                                    }
                                                }}
                                                onFocus={() => {
                                                    // Start transition lock preemptively if the device is going to open the keyboard
                                                    if (!isKeyboardTransitioning.current) {
                                                        isKeyboardTransitioning.current = true;
                                                        wasAtBottomBeforeKeyboard.current = !showScrollDownRef.current;
                                                        
                                                        // Fallback unlock if visualViewport resize doesn't fire
                                                        setTimeout(() => {
                                                            isKeyboardTransitioning.current = false;
                                                        }, 500);
                                                    }
                                                }}
                                                onInput={(e) => {
                                                    // Auto-grow: reset height then expand to scrollHeight
                                                    // This is the correct grow-then-scroll technique
                                                    const el = e.currentTarget;
                                                    el.style.height = 'auto';
                                                    // Cap at 5 lines (~130px), then scroll internally
                                                    el.style.height = Math.min(el.scrollHeight, 130) + 'px';
                                                }}
                                                placeholder="Type a message..."
                                                autoComplete="off"
                                                spellCheck={true}
                                                autoCapitalize="sentences"
                                                className="w-full bg-transparent text-white py-2.5 md:py-3 px-1 md:px-2 focus:outline-none disabled:opacity-50 text-[16px] md:text-sm placeholder:text-gray-500 font-medium leading-[1.4] resize-none overflow-y-auto"
                                                style={{
                                                    minHeight: '24px',
                                                    maxHeight: '130px', // ~5 lines
                                                    overflowY: 'auto',
                                                    scrollbarWidth: 'none', // Firefox: hide scrollbar
                                                }}
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
                        )}
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
                    } else if (type === 'block_user' && otherMember) {
                        const loadingToast = toast.loading('Blocking user...');
                        try {
                            await blockUser(otherMember.user_id);
                            toast.success('User blocked', { id: loadingToast });
                        } catch {
                            toast.error('Failed to block user', { id: loadingToast });
                        }
                    }
                }}
                title={
                    confirmModal.type === 'message' 
                        ? (selectedMessages.size > 1 ? `Delete ${selectedMessages.size} Messages` : 'Delete Message')
                        : confirmModal.type === 'clear' ? 'Clear History' 
                        : confirmModal.type === 'block_user' ? 'Block User'
                        : 'Delete Chat'
                }
                message={
                    confirmModal.type === 'message' 
                        ? (selectedMessages.size > 1 
                            ? `Are you sure you want to delete ${selectedMessages.size} selected messages? This action cannot be undone.`
                            : 'Are you sure you want to delete this message? This action cannot be undone.')
                        : confirmModal.type === 'clear' ? 'Are you sure you want to clear all messages in this chat? This only affects your view.'
                        : confirmModal.type === 'block_user' ? 'Are you sure you want to block this user? They will not be able to send you messages.'
                        : 'Are you sure you want to delete this conversation forever? All history will be lost.'
                }
                confirmText={
                    confirmModal.type === 'message' ? 'Delete' : 
                    confirmModal.type === 'clear' ? 'Clear' : 
                    confirmModal.type === 'block_user' ? 'Block' : 'Delete'
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
                            await sendMessageToConversation({ conversationId: targetConversationId, content: prefix + msg.content, type: 'text' });
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
