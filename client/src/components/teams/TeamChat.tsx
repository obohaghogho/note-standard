// ====================================
// TEAM CHAT COMPONENT
// Real-time team collaboration UI
// ====================================

import React, { useEffect, useRef, useState } from 'react';
import { useChatGesture } from '../../hooks/useChatGesture';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useTeamChat } from '../../context/TeamChatContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { AudioPlayer } from '../chat/AudioPlayer';
import {
  Send,
  Loader2,
  Users,
  FileText,
  AlertCircle,
  WifiOff,
  Wifi,
  ImageIcon,
  ChevronDown,
  UserPlus,
  LogOut,
  Edit3,
  Trash2,
  X,
  Share2,
  Check,
  Menu,
  Video,
  PhoneCall,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadTeamImage, uploadTeamAudio } from '../../lib/teamsApi';
import type { TeamMessage } from '../../types/teams';
import SecureImage from '../common/SecureImage';
import { VoiceRecorder } from '../chat/VoiceRecorder';
import { MediaPreviewModal } from '../chat/MediaPreviewModal';
import { AnimatePresence } from 'framer-motion';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { applyAutoCorrect } from '../../utils/textUtils';
import './TeamChat.css';

interface TeamChatProps {
  teamId: string;
  className?: string;
  activeCall?: { teamId: string; teamName: string; callerName: string } | null;
  onJoinCall?: () => void;
}

export const TeamChat: React.FC<TeamChatProps> = ({ teamId, className = '', activeCall, onJoinCall }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { 
    messages, members, loading, connected, sendMessage, loadMoreMessages, 
    hasMore, deleteMessage, editMessage, clearChatHistory, error, typingUsers, sendTypingStatus 
  } = useTeamChat();
  const { openMobileMenu } = useOutletContext<{ openMobileMenu: () => void }>() || {};

  const myMember = members.find(m => m.user_id === user?.id);
  const myRole = myMember?.role || 'member';

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<TeamMessage | null>(null);

  // ── WhatsApp-Style Selection System ──────────────────────
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const isSelectionMode = selectedMessages.size > 0;

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const clearSelection = () => setSelectedMessages(new Set());

  // Gesture hook — scroll always wins, long-press fires after 480ms of no movement
  const gesture = useChatGesture({
    onLongPress: (id) => toggleMessageSelection(id),
    moveThreshold: 8,
    delay: 480,
  });

  // Layout Offset Management
  useEffect(() => {
    document.documentElement.style.setProperty('--floating-ui-offset', '110px');
    document.documentElement.style.setProperty('--chat-input-height', '130px');
    return () => {
      document.documentElement.style.setProperty('--floating-ui-offset', '0px');
      document.documentElement.style.setProperty('--chat-input-height', '0px');
    };
  }, []);
  
  // Confirmation state
  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    type: 'message' | 'history';
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

  const [bgTheme, setBgTheme] = useState(() => localStorage.getItem('chat_bg_theme') || 'classic');
  const [fontTheme, setFontTheme] = useState(() => localStorage.getItem('chat_font_theme') || 'sans');
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ====================================
  // AUTO-SCROLL TO BOTTOM
  // ====================================

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.isOwn || lastMessage.isOptimistic) {
        scrollToBottom();
      }
    }
  }, [messages]);

  // ====================================
  // SCROLL DETECTION
  // ====================================

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

    setShowScrollButton(!isNearBottom);

    // Load more when scrolled to top
    if (scrollTop < 100 && hasMore && !loading) {
      loadMoreMessages();
    }
  };

  // ====================================
  // SEND MESSAGE HANDLER
  // ====================================

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    setIsSending(true);

    try {
      if (editingMessageId) {
        await editMessage(editingMessageId, input.trim());
        setEditingMessageId(null);
      } else {
        await sendMessage(input.trim(), {}, 'text', replyTo?.id);
        setReplyTo(null);
      }
      setInput('');
      sendTypingStatus(false);
      inputRef.current?.focus();
      const textarea = document.getElementById('team-chat-input') as HTMLTextAreaElement | null;
      if (textarea) {
          textarea.style.height = 'auto';
      }
    } catch (err: unknown) {
        const error = err as { response?: { data?: { error?: string } }; message?: string };
        setInput(input); // or restore original text if you prefer
        setEditingMessageId(editingMessageId);
        const serverMsg = error.response?.data?.error || error.message;
        toast.error(serverMsg ? `Error: ${serverMsg}` : (editingMessageId ? 'Failed to edit message' : 'Failed to send message'));
    } finally {
      setIsSending(false);
    }
  };

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = applyAutoCorrect(e.target.value);
    setInput(val);
    
    // Typing indicator logic
    sendTypingStatus(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 3000);
  };



  // ====================================
  // IMAGE UPLOAD HANDLER
  // ====================================

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsSending(true);
    const loadingToast = toast.loading('Uploading image...');

    try {
      const imageUrl = await uploadTeamImage(teamId, file);

      if (!imageUrl) throw new Error('Upload failed');

      await sendMessage('', { image_url: imageUrl }, 'image');
      toast.success('Image sent', { id: loadingToast });
    } catch (err: unknown) {
      console.error('[TeamChat] Image upload error:', err);
      const error = err as Error;
      toast.error(error.message || 'Failed to upload image', { id: loadingToast });
    } finally {
      setIsSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ====================================
  // AUDIO UPLOAD HANDLER
  // ====================================

  const handleSendAudio = async (audioBlob: Blob) => {
    if (isSending) return;

    if (audioBlob.size > 10 * 1024 * 1024) {
      toast.error('Audio note must be less than 10MB');
      return;
    }

    setIsSending(true);
    const loadingToast = toast.loading('Sending voice note...');

    try {
      const audioUrl = await uploadTeamAudio(teamId, audioBlob);

      if (!audioUrl) throw new Error('Upload failed');

      await sendMessage('', { audio_url: audioUrl }, 'audio');
      toast.success('Voice note sent', { id: loadingToast });
      setShowRecorder(false);
    } catch (err: unknown) {
      console.error('[TeamChat] Audio upload error:', err);
      const error = err as Error;
      toast.error(error.message || 'Failed to send voice note', { id: loadingToast });
    } finally {
      setIsSending(false);
    }
  };

  // ====================================
  // RENDER MESSAGE
  // ====================================

  const isSameSender = (index: number) => {
    if (index === 0) return false;
    const current = messages[index];
    const previous = messages[index - 1];
    if (!current || !previous || current.message_type === 'system' || previous.message_type === 'system') return false;
    
    const timeDiff = new Date(current.created_at).getTime() - new Date(previous.created_at).getTime();
    return current.sender_id === previous.sender_id && timeDiff < 60000;
  };

  const renderMessage = (msg: TeamMessage, index: number) => {
    const isOwn = msg.isOwn;
    const isGrouped = isSameSender(index);
    const showAvatar = !isGrouped && !isOwn && msg.message_type !== 'system';
    const showName = showAvatar;

    // Get sender info with fallback
    const sender = msg?.sender || members?.find((m) => m?.user_id === msg?.sender_id)?.profile;
    const senderName = String(sender?.full_name || sender?.username || sender?.email || 'Unknown');
    const senderAvatar = sender?.avatar_url;

    // Different rendering based on message type
    if (msg?.message_type === 'system') {
      const inviterName = String(msg?.sender?.full_name || msg?.sender?.username || 'Some member');
      const inviteeName = String(msg?.metadata?.user_name || 'a new member');

      return (
        <div key={msg.id} className="team-chat__message--system">
          <span className="team-chat__message-system-text flex items-center gap-2">
            {msg.metadata?.event === 'member_joined' && (
              <>
                <UserPlus size={14} className="text-green-400" />
                <span><strong>{inviterName}</strong> invited <strong>{inviteeName}</strong> to the team</span>
              </>
            )}
            {msg.metadata?.event === 'member_left' && (
              <>
                <LogOut size={14} className="text-red-400" />
                <span><strong>{inviteeName}</strong> left the team</span>
              </>
            )}
            {msg.metadata?.event === 'note_updated' && (
              <>
                <Edit3 size={14} className="text-blue-400" />
                <span>A shared note was updated</span>
              </>
            )}
          </span>
          <span className="team-chat__message-time">{formatTime(msg?.created_at || new Date().toISOString())}</span>
        </div>
      );
    }

    if (msg.message_type === 'note_share') {
      return (
        <div key={msg.id} className={`team-chat__message ${isOwn ? 'team-chat__message--own' : ''}`}>
          {!isOwn && showAvatar && (
            <div className="team-chat__message-avatar">
              {senderAvatar ? (
                <SecureImage src={senderAvatar} alt={senderName} fallbackType="profile" />
              ) : (
                <div className="team-chat__message-avatar-placeholder">
                  {senderName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          )}
          <div className="team-chat__message-content">
            {showName && !isOwn && <div className="team-chat__message-name">{senderName}</div>}
            <div className="team-chat__message-note-card">
              <div className="team-chat__message-note-header">
                <FileText size={16} />
                <span>Shared a note</span>
              </div>
              <div className="team-chat__message-note-title">
                {msg.metadata?.note_title || 'Untitled Note'}
              </div>
              <div className="team-chat__message-note-meta">
                <span>{msg.metadata?.permission === 'edit' ? '✏️ Can Edit' : '👁️ Read Only'}</span>
                <span>•</span>
                <span>{formatTime(msg.created_at)}</span>
              </div>
              <Button 
                size="sm" 
                variant="ghost" 
                className="mt-2 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                onClick={() => navigate(`/dashboard/notes?id=${msg.metadata?.note_id as string}`)}
              >
                Open Note
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Regular text or image message
    const isSelected = selectedMessages.has(msg.id);

    return (
      <div
        key={msg.id}
        className={`team-chat__message ${isOwn ? 'team-chat__message--own' : ''} ${
          isGrouped ? 'team-chat__message--grouped' : ''
        } ${
          msg.isOptimistic ? 'team-chat__message--optimistic' : ''
        } ${msg.failed ? 'team-chat__message--failed' : ''} ${
          isSelected ? 'team-chat__message--selected' : ''
        } group relative`}
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
        {/* Selection checkbox */}
        {isSelectionMode && (
          <div className={`flex items-center flex-shrink-0 self-center transition-all duration-200 ${isOwn ? 'order-2 ml-2' : 'mr-2'}`}>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
              isSelected 
                ? 'bg-blue-500 border-blue-500 scale-110' 
                : 'border-gray-500 bg-transparent hover:border-gray-400'
            }`}>
              {isSelected && (
                <Check size={12} className="text-white" style={{ animation: 'fadeIn 0.15s ease' }} />
              )}
            </div>
          </div>
        )}
        {!isOwn && showAvatar && (
          <div className="team-chat__message-avatar">
            {senderAvatar ? (
              <SecureImage src={senderAvatar} alt={senderName} fallbackType="profile" />
            ) : (
              <div className="team-chat__message-avatar-placeholder">
                {senderName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        )}
        <div className="team-chat__message-content">
          {showName && !isOwn && <div className="team-chat__message-name">{senderName}</div>}
          <div className={`team-chat__message-bubble ${isSelected ? 'ring-1 ring-blue-500/40 bg-blue-600/15' : ''}`}>
            {msg.message_type === 'image' && msg.metadata?.image_url && (
              <div 
                className="team-chat__message-image-container cursor-pointer hover:opacity-90 transition-opacity"
                onClick={(e) => { if (!isSelectionMode) { e.stopPropagation(); setPreviewMedia({
                  isOpen: true,
                  url: msg.metadata!.image_url as string,
                  type: 'image',
                  isSender: isOwn
                }); } }}
              >
                <SecureImage 
                  src={msg.metadata.image_url as string} 
                  alt="Shared image" 
                  className="team-chat__message-image"
                />
              </div>
            )}
            {msg.message_type === 'audio' && msg.metadata?.audio_url && (
              <div className="team-chat__message-audio-container mt-1 mb-2">
                <AudioPlayer 
                  path={msg.metadata.audio_url as string} 
                  fetchUrl={async (p) => p}
                />
              </div>
            )}
            {msg.reply_to && (
              <div className="team-chat__message-reply-preview mb-2 p-2 rounded bg-white/5 border-l-2 border-blue-500 text-[10px] opacity-80">
                <div className="font-bold text-blue-400 mb-0.5">
                  {msg.reply_to.sender_id === user?.id ? 'You' : (members.find(m => m.user_id === msg.reply_to?.sender_id)?.profile?.full_name || 'Member')}
                </div>
                <div className="truncate text-gray-300">
                  {msg.reply_to.content}
                </div>
              </div>
            )}
            {msg.content && <div className="team-chat__message-text">{msg.content}</div>}
            <div className="team-chat__message-time">
              {msg.isOptimistic && <Loader2 size={12} className="animate-spin mr-1" />}
              {msg.failed && <AlertCircle size={12} className="text-red-400 mr-1" />}
              {msg.is_edited && <span className="italic mr-1">(edited)</span>}
              {formatTime(msg?.created_at || new Date().toISOString())}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ====================================
  // RENDER
  // ====================================

  if (error) {
    return (
      <Card className={`team-chat ${className}`}>
        <div className="team-chat__error">
          <AlertCircle size={48} />
          <h3>Failed to Load Chat</h3>
          <p>{error}</p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className={`team-chat ${className} relative overflow-hidden`}>
      {/* Custom Chat Wallpaper Background */}
      <div className={`absolute inset-0 pointer-events-none z-0 ${bgTheme === 'classic' ? 'bg-theme-classic' : `bg-theme-${bgTheme}`}`} style={{ transition: 'all 0.5s ease' }} />
      {/* Hidden File Input */}
      <input
        id="team-chat-file-upload"
        name="teamImageFile"
        type="file"
        ref={fileInputRef}
        onChange={handleImageChange}
        accept="image/*"
        style={{ display: 'none' }}
      />
      {/* Header - Selection Action Bar or Normal Header */}
      {isSelectionMode ? (
        <div className="team-chat__header" style={{ background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%)', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
          <div className="flex items-center gap-3">
            <button 
              onClick={clearSelection}
              className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-all"
            >
              <X size={20} />
            </button>
            <span className="text-white font-bold text-base">
              {selectedMessages.size} selected
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => {
                const selectedMsgs = messages
                  .filter(m => selectedMessages.has(m.id))
                  .map(m => m.content);
                const text = selectedMsgs.join('\n');
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(text);
                  toast.success('Copied to clipboard');
                }
                clearSelection();
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-blue-300 hover:text-blue-200 hover:bg-blue-500/15 rounded-xl transition-all"
            >
              <Share2 size={16} />
              <span className="hidden sm:inline">Copy</span>
            </button>
            <button 
              onClick={() => {
                const msgId = Array.from(selectedMessages)[0];
                const msg = messages.find(m => m.id === msgId);
                if (msg) {
                  setReplyTo(msg);
                  clearSelection();
                  inputRef.current?.focus();
                }
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-blue-300 hover:text-blue-200 hover:bg-blue-500/15 rounded-xl transition-all"
            >
              <Share2 size={16} className="rotate-180" />
              <span className="hidden sm:inline">Reply</span>
            </button>
            {selectedMessages.size === 1 && (
              (() => {
                const msgId = Array.from(selectedMessages)[0];
                const msg = messages.find(m => m.id === msgId);
                if (msg && msg.isOwn && msg.message_type === 'text') {
                  return (
                    <button 
                      onClick={() => {
                        setEditingMessageId(msg.id);
                        setInput(msg.content || '');
                        clearSelection();
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-green-400 hover:text-green-300 hover:bg-green-500/15 rounded-xl transition-all"
                    >
                      <Edit3 size={16} />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                  );
                }
                return null;
              })()
            )}
            <button 
              onClick={() => {
                setConfirmDelete({ isOpen: true, type: 'message', messageId: Array.from(selectedMessages)[0] });
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/15 rounded-xl transition-all"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="team-chat__header">
          <div className="team-chat__header-title">
            <button 
              onClick={openMobileMenu}
              className="p-1.5 -ml-1 text-gray-400 hover:text-white md:hidden mr-2"
              aria-label="Open sidebar"
            >
              <Menu size={22} />
            </button>
            <h2>Team Chat</h2>
            <div className="team-chat__header-status">
              {connected ? (
                <>
                  <Wifi size={14} className="text-green-400" />
                  <span className="text-green-400">Live</span>
                </>
              ) : (
                <>
                  <WifiOff size={14} className="text-yellow-400" />
                  <span className="text-yellow-400">Reconnecting...</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="team-chat__header-members">
              <Users size={16} />
              <span>{members.length} members</span>
            </div>
            <Button 
              size="sm" 
              variant="ghost" 
              className="text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
              onClick={() => setShowCustomizeModal(true)}
              title="Theme & Fonts"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.3974 19.5492 5.66681 19.8238 5.66681 20C5.66681 20.4437 5.2974 21.0567 4.928 21.6703C4.60677 22.2039 4.88716 22 5.66681 22H12Z"/><circle cx="7.5" cy="10.5" r="1.5"/><circle cx="11.5" cy="7.5" r="1.5"/><circle cx="16.5" cy="9.5" r="1.5"/><circle cx="15.5" cy="14.5" r="1.5"/></svg>
            </Button>
            {myRole === 'owner' && (
              <Button 
                size="sm" 
                variant="ghost" 
                className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                onClick={() => setConfirmDelete({ isOpen: true, type: 'history' })}
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Active Call Banner */}
      {activeCall && (
        <div className="flex-shrink-0 relative mx-3 mt-2 mb-1 rounded-2xl overflow-hidden border border-green-500/30 bg-gradient-to-r from-green-950/80 via-emerald-950/80 to-green-950/80 backdrop-blur-sm shadow-lg shadow-green-500/10 animate-in slide-in-from-top-2 duration-300">
          {/* Animated glow pulse */}
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 via-emerald-400/10 to-green-500/5 animate-pulse" />
          <div className="relative flex items-center gap-3 px-4 py-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center">
              <PhoneCall size={16} className="text-green-400 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-green-300 uppercase tracking-widest">Call in Progress</p>
              <p className="text-xs text-gray-300 truncate">{activeCall.callerName} started a conference call</p>
            </div>
            <button
              id="team-chat-join-call-banner-btn"
              onClick={onJoinCall}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500 hover:bg-green-400 text-white text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-green-500/30"
            >
              <Video size={12} />
              Join
            </button>
          </div>
        </div>
      )}

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className={`team-chat__messages transition-all font-theme-${fontTheme}`}
        onScroll={handleScroll}
        style={{ paddingBottom: 'var(--chat-input-height, 24px)' }}
      >
        {loading && messages.length === 0 ? (
          <div className="team-chat__loading">
            <Loader2 size={32} className="animate-spin" />
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="team-chat__empty">
            <FileText size={48} />
            <h3>No messages yet</h3>
            <p>Start the conversation by sending a message below.</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="team-chat__load-more">
                <Button size="sm" variant="ghost" onClick={loadMoreMessages}>
                  Load older messages
                </Button>
              </div>
            )}
            {messages.map((msg, i) => renderMessage(msg, i))}
            
            {/* Typing Indicator */}
            <AnimatePresence>
              {typingUsers.length > 0 && (
                <div className="flex justify-start items-center gap-2 mt-2 ml-10 animate-in fade-in slide-in-from-left-2">
                  <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-2.5 flex gap-1 border border-white/5 shadow-lg">
                    <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"></div>
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium italic">
                    {typingUsers.join(', ')} {typingUsers.length > 1 ? 'are' : 'is'} typing...
                  </span>
                </div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button 
          className="team-chat__scroll-button hover:scale-110 active:scale-95 z-50" 
          onClick={() => scrollToBottom()}
          style={{ bottom: 'calc(110px + var(--floating-ui-offset, 0px))' }}
        >
          <ChevronDown size={20} />
        </button>
      )}

      {/* Input Area */}
      <div className="team-chat__input-container z-40 shadow-[0_-15px_40px_rgba(0,0,0,0.4)]">
        {editingMessageId && (
            <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 flex items-center justify-between bg-blue-900/40 text-blue-200 text-xs px-3 py-2 rounded-lg border border-blue-500/20 backdrop-blur-md animate-in slide-in-from-bottom-2 mx-4">
                <span className="font-medium flex items-center gap-1.5 flex-1">
                    <Edit3 size={14} />
                    Editing Message
                </span>
                <button 
                    type="button" 
                    onClick={() => { setEditingMessageId(null); setInput(''); }}
                    className="hover:bg-blue-500/20 p-1.5 rounded-full transition-colors active:scale-95 text-blue-300 hover:text-white"
                >
                    <X size={14} />
                </button>
            </div>
        )}
        {replyTo && (
            <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 flex items-center justify-between bg-gray-900/60 text-gray-200 text-xs px-3 py-2 rounded-lg border border-white/10 backdrop-blur-md animate-in slide-in-from-bottom-2 mx-4">
                <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
                    <span className="font-bold text-blue-400 flex items-center gap-1.5">
                        <Share2 size={12} className="rotate-180" />
                        Replying to {replyTo.sender_id === user?.id ? 'yourself' : (replyTo.sender?.full_name || 'Member')}
                    </span>
                    <span className="truncate opacity-70 italic text-[11px]">{replyTo.content}</span>
                </div>
                <button 
                    type="button" 
                    onClick={() => setReplyTo(null)}
                    className="hover:bg-white/10 p-1.5 rounded-full transition-colors active:scale-95 ml-2"
                >
                    <X size={14} />
                </button>
            </div>
        )}
        {showRecorder ? (
            <div className="flex-1">
                <VoiceRecorder 
                    onSend={handleSendAudio} 
                    onCancel={() => setShowRecorder(false)} 
                />
            </div>
        ) : (
            <textarea
              id="team-chat-input"
              name="message"
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onTouchStart={(e) => {
                if (document.activeElement !== e.currentTarget) {
                  e.preventDefault();
                  e.currentTarget.focus({ preventScroll: true });
                }
              }}
              onMouseDown={(e) => {
                if (document.activeElement !== e.currentTarget) {
                  e.preventDefault();
                  e.currentTarget.focus({ preventScroll: true });
                }
              }}
              onKeyDown={() => {
                  // By product requirement, Enter inserts a newline instead of sending.
                  // Sending is done exclusively via the explicit Send button.
              }}
              onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 130) + 'px';
              }}
              placeholder="Type a message..."
              className={`team-chat__input font-theme-${fontTheme}`}
              rows={1}
              disabled={isSending || !connected}
              spellCheck={true}
              autoCapitalize="sentences"
              autoCorrect="on"
              autoComplete="on"
              style={{
                  minHeight: '44px',
                  maxHeight: '130px',
                  overflowY: 'auto',
                  scrollbarWidth: 'none',
              }}
            />
        )}
        <div className="team-chat__input-actions">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleImageClick}
            disabled={isSending || !connected}
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
          </Button>
          <Button
            size="sm"
            disabled={!input.trim() || isSending || !connected}
            onClick={handleSend}
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </Button>
          {!showRecorder && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowRecorder(true)}
              disabled={isSending || !connected}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mic"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            </Button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {previewMedia.isOpen && (
          <MediaPreviewModal 
            isOpen={previewMedia.isOpen}
            onClose={() => setPreviewMedia(prev => ({ ...prev, isOpen: false }))}
            mediaUrl={previewMedia.url}
            mediaType={previewMedia.type}
            fileName={previewMedia.fileName}
            isSender={previewMedia.isSender}
          />
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        onClose={() => setConfirmDelete({ isOpen: false, type: 'message' })}
        onConfirm={async () => {
          const type = confirmDelete.type;
          setConfirmDelete(prev => ({ ...prev, isOpen: false }));
          
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
          } else if (type === 'history') {
            const toastId = toast.loading('Clearing chat history...');
            try {
              await clearChatHistory();
              toast.success('Chat history cleared', { id: toastId });
            } catch {
              toast.error('Failed to clear chat', { id: toastId });
            }
          }
        }}
        title={
          confirmDelete.type === 'message' 
            ? (selectedMessages.size > 1 ? `Delete ${selectedMessages.size} Messages` : 'Delete Message')
            : 'Wipe Chat History'
        }
        message={
          confirmDelete.type === 'message' 
            ? (selectedMessages.size > 1 
              ? `Are you sure you want to delete ${selectedMessages.size} selected messages? This action cannot be undone.`
              : 'Are you sure you want to delete this message? This action cannot be undone.')
            : 'Are you sure you want to wipe ALL messages in this team chat? This will clear the chat for everyone and cannot be recovered.'
        }
        confirmText={confirmDelete.type === 'message' ? 'Delete' : 'Wipe Everything'}
        variant="danger"
      />
      {showCustomizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowCustomizeModal(false)}>
          <div className="relative bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] w-full max-w-md p-6 animate-in zoom-in-95 duration-200 overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <button 
              type="button"
              onClick={() => setShowCustomizeModal(false)}
              className="absolute right-4 top-4 p-2 rounded-full text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-black text-white uppercase tracking-tight italic mb-6">Customize Chat Room</h3>
            
            {/* Wallpaper Selection */}
            <div className="space-y-3 mb-6">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Premium Animated Backgrounds</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'classic', label: 'Classic Dark', preview: 'bg-gray-950' },
                  { id: 'aurora', label: 'Midnight Aurora', preview: 'bg-theme-aurora' },
                  { id: 'grid', label: 'Cyberpunk Grid', preview: 'bg-theme-grid' },
                  { id: 'sunset', label: 'Sunset Glow', preview: 'bg-theme-sunset' },
                  { id: 'forest', label: 'Forest Rain', preview: 'bg-theme-forest' },
                  { id: 'lavender', label: 'Lavender Dream', preview: 'bg-theme-lavender' },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setBgTheme(item.id);
                      localStorage.setItem('chat_bg_theme', item.id);
                    }}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-xs text-left transition-all relative overflow-hidden ${
                      bgTheme === item.id 
                        ? 'border-blue-500 bg-blue-500/10 font-bold text-white shadow-lg shadow-blue-500/20' 
                        : 'border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${item.preview} border border-white/10 flex-shrink-0 relative overflow-hidden`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Selection */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Beautiful Handwriting & Text Styles</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'sans', label: 'Modern Sans', styleClass: 'font-theme-sans' },
                  { id: 'serif', label: 'Editorial Serif', styleClass: 'font-theme-serif' },
                  { id: 'mono', label: 'Developer Mono', styleClass: 'font-theme-mono' },
                  { id: 'round', label: 'Premium Round', styleClass: 'font-theme-round' },
                  { id: 'royal', label: 'Royal Classic', styleClass: 'font-theme-royal' },
                  { id: 'cursive', label: 'Dancing Script', styleClass: 'font-theme-cursive' },
                  { id: 'typewriter', label: 'Retro Typewriter', styleClass: 'font-theme-typewriter' },
                  { id: 'fun', label: 'Fun Pacifico', styleClass: 'font-theme-fun' },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setFontTheme(item.id);
                      localStorage.setItem('chat_font_theme', item.id);
                    }}
                    className={`flex flex-col gap-1 p-3 rounded-xl border text-left transition-all ${
                      fontTheme === item.id 
                        ? 'border-blue-500 bg-blue-500/10 text-white shadow-lg shadow-blue-500/15' 
                        : 'border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="text-xs font-bold truncate">{item.label}</span>
                    <span className={`text-[11px] opacity-90 truncate leading-relaxed ${item.styleClass}`}>Aesthetic style</span>
                  </button>
                ))}
              </div>
            </div>

            <Button 
              onClick={() => setShowCustomizeModal(false)}
              className="mt-8 h-12 font-black rounded-2xl text-xs uppercase tracking-wider"
            >
              Apply Settings
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================
// HELPER FUNCTIONS
// ====================================

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
