// ====================================
// TEAM CHAT COMPONENT
// Real-time team collaboration UI
// ====================================

import React, { useEffect, useRef, useState } from 'react';
import { useTeamChat } from '../../context/TeamChatContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadTeamImage } from '../../lib/teamsApi';
import type { TeamMessage } from '../../types/teams';
import SecureImage from '../common/SecureImage';
import './TeamChat.css';

interface TeamChatProps {
  teamId: string;
  className?: string;
}

export const TeamChat: React.FC<TeamChatProps> = ({ teamId, className = '' }) => {
  const { user } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { messages, members, loading, connected, sendMessage, shareNote, loadMoreMessages, hasMore, error } =
    useTeamChat();

  // teamId is used in effect via useTeamChat, but if it causes issues we can just log it
  console.log('[TeamChat] ID:', teamId, user?.id, !!shareNote);

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

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
      await sendMessage(input.trim());
      setInput('');
      inputRef.current?.focus();
    } catch (err: any) {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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

      await sendMessage('', { image_url: imageUrl });
      toast.success('Image sent', { id: loadingToast });
    } catch (err: any) {
      console.error('[TeamChat] Image upload error:', err);
      toast.error('Failed to upload image', { id: loadingToast });
    } finally {
      setIsSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ====================================
  // RENDER MESSAGE
  // ====================================

  const renderMessage = (msg: TeamMessage, index: number) => {
    const isOwn = msg.isOwn;
    const showAvatar = index === 0 || messages[index - 1].sender_id !== msg.sender_id;
    const showName = showAvatar;

    // Get sender info
    const sender = msg.sender || members.find((m) => m.user_id === msg.sender_id)?.profile;
    const senderName = sender?.full_name || sender?.username || sender?.email || 'Unknown';
    const senderAvatar = sender?.avatar_url;

    // Different rendering based on message type
    if (msg.message_type === 'system') {
      return (
        <div key={msg.id} className="team-chat__message--system">
          <span className="team-chat__message-system-text flex items-center gap-2">
            {msg.metadata?.event === 'member_joined' && (
              <>
                <UserPlus size={14} className="text-green-400" />
                <span>New member joined the team</span>
              </>
            )}
            {msg.metadata?.event === 'member_left' && (
              <>
                <LogOut size={14} className="text-red-400" />
                <span>A member left the team</span>
              </>
            )}
            {msg.metadata?.event === 'note_updated' && (
              <>
                <Edit3 size={14} className="text-blue-400" />
                <span>A shared note was updated</span>
              </>
            )}
          </span>
          <span className="team-chat__message-time">{formatTime(msg.created_at)}</span>
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
              <Button size="sm" variant="ghost" className="mt-2">
                Open Note
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Regular text or image message
    return (
      <div
        key={msg.id}
        className={`team-chat__message ${isOwn ? 'team-chat__message--own' : ''} ${
          msg.isOptimistic ? 'team-chat__message--optimistic' : ''
        } ${msg.failed ? 'team-chat__message--failed' : ''}`}
      >
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
          <div className="team-chat__message-bubble">
            {msg.message_type === 'image' && msg.metadata?.image_url && (
              <div className="team-chat__message-image-container">
                <SecureImage 
                  src={msg.metadata.image_url} 
                  alt="Shared image" 
                  className="team-chat__message-image"
                />
              </div>
            )}
            {msg.content && <div className="team-chat__message-text">{msg.content}</div>}
            <div className="team-chat__message-time">
              {msg.isOptimistic && <Loader2 size={12} className="animate-spin mr-1" />}
              {msg.failed && <AlertCircle size={12} className="text-red-400 mr-1" />}
              {formatTime(msg.created_at)}
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
    <div className={`team-chat ${className}`}>
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
      {/* Header */}
      <div className="team-chat__header">
        <div className="team-chat__header-title">
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
        <div className="team-chat__header-members">
          <Users size={16} />
          <span>{members.length} members</span>
        </div>
      </div>

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className="team-chat__messages"
        onScroll={handleScroll}
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
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button className="team-chat__scroll-button" onClick={() => scrollToBottom()}>
          <ChevronDown size={20} />
        </button>
      )}

      {/* Input Area */}
      <div className="team-chat__input-container">
        <textarea
          id="team-chat-input"
          name="message"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          className="team-chat__input"
          rows={1}
          disabled={isSending || !connected}
        />
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
        </div>
      </div>
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
