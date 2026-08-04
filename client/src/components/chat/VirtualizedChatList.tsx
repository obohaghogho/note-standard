import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Message } from '../../stores/chatStore';
import MessageBubble from './MessageBubble';
import { ArrowDown } from 'lucide-react';
import { SmartScrollEngine } from '../../services/smartScrollEngine';

interface VirtualizedChatListProps {
  messages: Message[];
  currentUserId: string;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  onSelectMessage?: (msgId: string) => void;
  selectedMessageIds?: Set<string>;
  onReply?: (msg: Message) => void;
  onVisibleMessage?: (msgId: string) => void;
}

export const VirtualizedChatList: React.FC<VirtualizedChatListProps> = ({
  messages,
  currentUserId,
  onLoadMore,
  hasMore = false,
  onSelectMessage,
  selectedMessageIds,
  onReply,
  onVisibleMessage,
}) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUnreadBanner, setShowUnreadBanner] = useState(false);
  const isFirstLoadRef = useRef(true);

  const scrollEngineRef = useRef<SmartScrollEngine>(
    new SmartScrollEngine({
      onUnreadBannerToggle: (show, count) => {
        setShowUnreadBanner(show);
        setUnreadCount(count);
      },
    })
  );

  // Auto-scroll logic for new incoming messages
  const prevMessagesCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessagesCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      const isOwn = lastMsg?.sender_id === currentUserId;
      const shouldScroll = scrollEngineRef.current.handleIncomingMessage(isOwn);

      if (shouldScroll && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({
          index: messages.length - 1,
          align: 'end',
          behavior: 'smooth',
        });
      }
    }
    prevMessagesCountRef.current = messages.length;
  }, [messages, currentUserId]);

  const handleScrollToBottom = useCallback(() => {
    scrollEngineRef.current.jumpToBottom();
    if (virtuosoRef.current && messages.length > 0) {
      virtuosoRef.current.scrollToIndex({
        index: messages.length - 1,
        align: 'end',
        behavior: 'smooth',
      });
    }
  }, [messages.length]);

  const renderItem = useCallback(
    (_index: number, msg: Message) => {
      const isSelected = selectedMessageIds?.has(msg.id) || false;
      return (
        <div key={msg.id} className="px-3 py-1">
          <MessageBubble
            message={msg}
            isOwn={msg.sender_id === currentUserId}
            isSelected={isSelected}
            onSelect={() => onSelectMessage?.(msg.id)}
            onReply={() => onReply?.(msg)}
            onVisible={() => onVisibleMessage?.(msg.id)}
          />
        </div>
      );
    },
    [currentUserId, selectedMessageIds, onSelectMessage, onReply, onVisibleMessage]
  );

  const followOutput = useCallback(
    (isAtBottom: boolean) => {
      if (isAtBottom) {
        return 'smooth';
      }
      return false;
    },
    []
  );

  return (
    <div className="relative w-full h-full flex flex-col min-h-0 bg-transparent overflow-hidden">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
        followOutput={followOutput}
        itemContent={renderItem}
        startReached={onLoadMore}
        className="w-full h-full scrollbar-thin scrollbar-thumb-gray-800"
      />

      {/* Floating Unread / Scroll-to-bottom Pill */}
      {showUnreadBanner && (
        <button
          onClick={handleScrollToBottom}
          className="absolute bottom-4 right-6 z-30 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-xl shadow-blue-900/30 transition-all active:scale-95 text-sm font-semibold border border-blue-400/20"
        >
          <ArrowDown size={16} />
          <span>New messages {unreadCount > 0 && `(${unreadCount})`}</span>
        </button>
      )}
    </div>
  );
};

export default React.memo(VirtualizedChatList);
