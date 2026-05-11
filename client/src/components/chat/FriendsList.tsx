import React, { useMemo } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { usePresence } from '../../context/PresenceContext';
import { UserBadge } from '../common/UserBadge';
import SecureImage from '../common/SecureImage';
import { Users, UserPlus, Check, X, MessageSquare, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const FriendsList: React.FC<{ limit?: number; showRequestsOnly?: boolean }> = ({ limit, showRequestsOnly }) => {
    const { conversations, acceptConversation, setActiveConversationId, loading } = useChat();
    const { user } = useAuth();
    const { isUserOnline } = usePresence();
    const navigate = useNavigate();

    const socialData = useMemo(() => {
        if (!conversations || !user) return { friends: [], requests: [], sentRequests: [] };

        const directChats = conversations.filter(c => c.type === 'direct');
        
        const requests = directChats.filter(c => {
            const myMember = c.members.find(m => m.user_id === user.id);
            return myMember?.status === 'pending';
        });

        const sentRequests = directChats.filter(c => {
            const myMember = c.members.find(m => m.user_id === user.id);
            const otherMember = c.members.find(m => m.user_id !== user.id);
            return myMember?.status === 'accepted' && otherMember?.status === 'pending';
        });

        const friends = directChats.filter(c => {
            const myMember = c.members.find(m => m.user_id === user.id);
            const otherMember = c.members.find(m => m.user_id !== user.id);
            return myMember?.status === 'accepted' && otherMember?.status === 'accepted';
        });

        return { 
            friends: limit ? friends.slice(0, limit) : friends, 
            requests,
            sentRequests
        };
    }, [conversations, user, limit]);

    const handleAccept = async (e: React.MouseEvent, conversationId: string) => {
        e.stopPropagation();
        try {
            await acceptConversation(conversationId);
        } catch (err) {
            console.error('Failed to accept conversation:', err);
        }
    };

    const handleChat = (conversationId: string) => {
        setActiveConversationId(conversationId);
        navigate('/dashboard/chat');
    };

    if (loading && socialData.friends.length === 0 && socialData.requests.length === 0) {
        return (
            <div className="flex flex-col gap-4 animate-pulse">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-white/5 rounded-2xl" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Pending Requests Section */}
            {socialData.requests.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <UserPlus size={12} />
                            Pending Requests ({socialData.requests.length})
                        </h4>
                    </div>
                    <div className="grid gap-2">
                        {socialData.requests.map((conv) => {
                            const otherMember = conv.members.find(m => m.user_id !== user?.id);
                            const profile = otherMember?.profile;
                            const name = profile?.full_name || profile?.username || 'Unknown User';

                            return (
                                <div 
                                    key={conv.id}
                                    className="flex items-center justify-between p-3 rounded-2xl bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 transition-all group"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center overflow-hidden border border-blue-500/20">
                                            {profile?.avatar_url ? (
                                                <SecureImage src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-blue-400 font-bold">{name.charAt(0).toUpperCase()}</span>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1">
                                                <span className="text-sm font-bold text-white truncate">{name}</span>
                                                <UserBadge planTier={profile?.plan_tier} isVerified={profile?.is_verified} />
                                            </div>
                                            <p className="text-[10px] text-blue-400/60 font-medium truncate flex items-center gap-1">
                                                <Clock size={10} /> Needs acceptance
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={(e) => handleAccept(e, conv.id)}
                                            className="p-2 bg-blue-500 text-white rounded-xl hover:bg-blue-400 transition-all shadow-lg shadow-blue-500/20 active:scale-90"
                                            title="Accept Request"
                                        >
                                            <Check size={16} strokeWidth={3} />
                                        </button>
                                        <button 
                                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all active:scale-90"
                                            title="Ignore"
                                        >
                                            <X size={16} strokeWidth={3} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Friends Section */}
            {!showRequestsOnly && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Users size={12} />
                            Social Network
                        </h4>
                        {socialData.friends.length > 5 && (
                            <button 
                                onClick={() => navigate('/dashboard/chat')}
                                className="text-[9px] font-black text-primary hover:underline uppercase tracking-widest flex items-center gap-1"
                            >
                                View All <ArrowRight size={10} />
                            </button>
                        )}
                    </div>
                    
                    {socialData.friends.length === 0 ? (
                        <div className="p-8 rounded-3xl bg-white/5 border border-dashed border-white/10 flex flex-col items-center text-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-gray-600">
                                <Users size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">No friends yet</p>
                                <p className="text-[10px] text-gray-600 mt-1">Start chatting to build your network</p>
                            </div>
                        </div>
                    ) : (
                    {/* Sent Requests Section */}
                    {socialData.sentRequests.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                Sent Requests
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            </h3>
                            <div className="grid gap-2">
                                {socialData.sentRequests.map((conv) => {
                                    const otherMember = conv.members.find(m => m.user_id !== user?.id);
                                    const profile = otherMember?.profile;
                                    const name = profile?.full_name || profile?.username || 'Unknown User';
                                    return (
                                        <div key={conv.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5 opacity-60">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden border border-white/10">
                                                    {profile?.avatar_url ? (
                                                        <SecureImage src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-gray-400 font-bold text-xs">{name.charAt(0).toUpperCase()}</span>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="text-xs font-bold text-gray-300 block truncate">{name}</span>
                                                    <span className="text-[9px] text-gray-500 font-medium uppercase tracking-tighter">Waiting for acceptance...</span>
                                                </div>
                                            </div>
                                            <Clock size={14} className="text-gray-600" />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="grid gap-2">
                            {socialData.friends.map((conv) => {
                                const otherMember = conv.members.find(m => m.user_id !== user?.id);
                                const profile = otherMember?.profile;
                                const name = profile?.full_name || profile?.username || 'Unknown User';
                                const online = otherMember ? isUserOnline(otherMember.user_id) : false;

                                return (
                                    <div 
                                        key={conv.id}
                                        onClick={() => handleChat(conv.id)}
                                        className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/30 hover:bg-white/[0.08] transition-all cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden border border-white/10">
                                                    {profile?.avatar_url ? (
                                                        <SecureImage src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-gray-400 font-bold">{name.charAt(0).toUpperCase()}</span>
                                                    )}
                                                </div>
                                                {online && (
                                                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-gray-900 rounded-full shadow-sm" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">{name}</span>
                                                    <UserBadge planTier={profile?.plan_tier} isVerified={profile?.is_verified} />
                                                </div>
                                                <p className="text-[10px] text-gray-500 font-medium truncate uppercase tracking-tighter">
                                                    {online ? 'Active Now' : 'Offline'}
                                                </p>
                                            </div>
                                        </div>
                                        <button className="p-2 text-gray-500 group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100">
                                            <MessageSquare size={16} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
