import React, { useState, useMemo } from 'react';
import { X, Search, Send, Users } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import SecureImage from '../common/SecureImage';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageContent: string;
  messageType?: string;
  onForward: (conversationId: string) => Promise<void>;
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  isOpen,
  onClose,
  messageContent,
  messageType,
  onForward,
}) => {
  const { conversations } = useChat();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState(false);

  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      const otherMember = conv.members.find(m => m.user_id !== user?.id);
      const name = conv.type === 'direct' && otherMember
        ? (otherMember.profile?.full_name || otherMember.profile?.username || '')
        : (conv.name || '');
      return name.toLowerCase().includes(search.toLowerCase());
    });
  }, [conversations, search, user?.id]);

  const handleForward = async () => {
    if (!selectedConvId) return;
    setForwarding(true);
    try {
      await onForward(selectedConvId);
      onClose();
    } catch (err) {
      console.error('Forward failed:', err);
    } finally {
      setForwarding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-[90%] max-w-md max-h-[80vh] bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur-md">
          <h3 className="text-base font-bold text-white">Forward Message</h3>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Forwarded message preview */}
        <div className="px-5 py-3 border-b border-gray-800/50 bg-gray-800/30">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5">Message Preview</p>
          <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/30">
            <p className="text-xs text-gray-300 line-clamp-3 leading-relaxed">
              {messageType === 'image' ? '📷 Photo' : 
               messageType === 'video' ? '🎬 Video' : 
               messageType === 'audio' ? '🎤 Voice message' : 
               messageType === 'file' ? '📎 File' : 
               messageContent}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-800/50">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-800/60 border border-gray-700/30 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Users size={32} className="mb-2 opacity-50" />
              <p className="text-sm">No conversations found</p>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const otherMember = conv.members.find(m => m.user_id !== user?.id);
              const displayName = conv.type === 'direct' && otherMember
                ? (otherMember.profile?.full_name || otherMember.profile?.username || 'User')
                : (conv.name || 'Chat');
              const displayAvatar = conv.type === 'direct' && otherMember
                ? otherMember.profile?.avatar_url
                : null;
              const isSelected = selectedConvId === conv.id;

              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(isSelected ? null : conv.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all mb-1 ${
                    isSelected 
                      ? 'bg-blue-600/20 border border-blue-500/30 ring-1 ring-blue-500/20' 
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 border border-white/5">
                    {displayAvatar ? (
                      <SecureImage src={displayAvatar} alt={displayName} className="w-full h-full object-cover" fallbackType="profile" />
                    ) : (
                      <span className="text-white font-bold text-sm">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-300' : 'text-gray-200'}`}>
                      {displayName}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {conv.type === 'direct' ? 'Direct message' : 'Group chat'}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 animate-in zoom-in-0 duration-200">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Forward button */}
        <div className="px-5 py-4 border-t border-gray-800 bg-gray-900/80 backdrop-blur-md">
          <button
            onClick={handleForward}
            disabled={!selectedConvId || forwarding}
            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
              selectedConvId && !forwarding
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25 hover:-translate-y-0.5 active:scale-95'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Send size={16} className={selectedConvId ? 'translate-x-0.5 -translate-y-0.5' : ''} />
            {forwarding ? 'Forwarding...' : 'Forward'}
          </button>
        </div>
      </div>
    </div>
  );
};
