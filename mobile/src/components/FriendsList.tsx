import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Image,
    ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Conversation } from '../services/ChatService';
import { AuthService, User } from '../services/AuthService';

interface FriendsListProps {
    /**
     * When provided, the component renders from this data directly (no extra API call).
     * When omitted, the component falls back to fetching on its own.
     */
    conversations?: Conversation[];
    currentUserId?: string;
}

export const FriendsList: React.FC<FriendsListProps> = ({ conversations: propConversations, currentUserId: propUserId }) => {
    // Only fetch locally when no prop conversations are provided (avoids double API call)
    const [localConversations, setLocalConversations] = useState<Conversation[]>([]);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(false);

    const navigation = useNavigation<any>();

    const loadLocal = useCallback(async () => {
        if (propConversations !== undefined) return; // parent is supplying data
        setLoading(true);
        try {
            const { ChatService } = await import('../services/ChatService');
            const [convs, userData] = await Promise.all([
                ChatService.getConversations(),
                AuthService.getUser(),
            ]);
            setLocalConversations(convs);
            setUser(userData);
        } catch (e) {
            console.error('[FriendsList] Local load failed:', e);
        } finally {
            setLoading(false);
        }
    }, [propConversations]);

    useEffect(() => {
        if (propConversations !== undefined) {
            // Parent supplied conversations — resolve user independently (cheap, local)
            AuthService.getUser().then(u => setUser(u));
        } else {
            loadLocal();
        }
    }, [loadLocal, propConversations]);

    const conversations = propConversations ?? localConversations;
    const userId = propUserId ?? user?.id;

    const renderItem = ({ item }: { item: Conversation }) => {
        const myMember = item.members?.find(m => m.user_id === userId);
        const otherMember = item.members?.find(m => m.user_id !== userId);
        const isPending = myMember?.status === 'pending';
        const profile = otherMember?.profile;
        const name = profile?.full_name || profile?.username || 'User';
        const initial = name.charAt(0).toUpperCase();

        return (
            <TouchableOpacity
                style={styles.compactItem}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Chat', { conversationId: item.id, conversation: item })}
            >
                <View style={styles.compactAvatarWrap}>
                    {profile?.avatar_url ? (
                        <Image source={{ uri: profile.avatar_url }} style={styles.compactAvatar} />
                    ) : (
                        <View style={[styles.compactAvatarPlaceholder, isPending && styles.pendingAvatar]}>
                            <Text style={styles.compactAvatarText}>{initial}</Text>
                        </View>
                    )}
                    {isPending && (
                        <View style={styles.pendingBadge}>
                            <Text style={styles.pendingBadgeText}>!</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.compactName} numberOfLines={1}>{name.split(' ')[0]}</Text>
            </TouchableOpacity>
        );
    };

    // FIX: Use fixed height loading state — flex:1 breaks inside FlatList ListHeaderComponent on Android
    if (loading && conversations.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#3b82f6" />
            </View>
        );
    }

    const pendingRequests = conversations.filter(c =>
        c.members?.find(m => m.user_id === userId)?.status === 'pending'
    );
    const friends = conversations.filter(c => {
        const me = c.members?.find(m => m.user_id === userId);
        const them = c.members?.find(m => m.user_id !== userId);
        return me?.status === 'accepted' && them?.status === 'accepted';
    });

    const displayList = [...pendingRequests, ...friends];

    return (
        <View style={styles.compactContainer}>
            <Text style={styles.sectionTitle}>Social Hub</Text>
            <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={displayList}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.compactListContent}
                ListEmptyComponent={
                    <View style={styles.emptyCompact}>
                        <Text style={styles.emptyTextCompact}>No active contacts</Text>
                    </View>
                }
            />
        </View>
    );
};

const styles = StyleSheet.create({
    compactContainer: {
        paddingTop: 10,
        backgroundColor: 'transparent',
    },
    sectionTitle: {
        color: '#666',
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    compactListContent: {
        paddingHorizontal: 15,
    },
    compactItem: {
        alignItems: 'center',
        marginRight: 15,
        width: 70,
    },
    compactAvatarWrap: {
        position: 'relative',
        marginBottom: 6,
    },
    compactAvatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 2,
        borderColor: '#6366f133',
    },
    compactAvatarPlaceholder: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#111122',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#111133',
    },
    pendingAvatar: {
        borderColor: '#3b82f688',
    },
    compactAvatarText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    pendingBadge: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: '#3b82f6',
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#060611',
    },
    pendingBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '900',
    },
    compactName: {
        color: '#eee',
        fontSize: 11,
        fontWeight: '500',
        textAlign: 'center',
    },
    emptyCompact: {
        paddingHorizontal: 5,
        justifyContent: 'center',
        alignItems: 'center',
        height: 70,
    },
    emptyTextCompact: {
        color: '#333',
        fontSize: 12,
        fontStyle: 'italic',
    },
    // FIX: Use fixed height — NOT flex:1 — inside FlatList header on Android
    loadingContainer: {
        height: 90,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
