import React, { useEffect, useState, useCallback } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    FlatList, 
    TouchableOpacity, 
    Image, 
    ActivityIndicator,
    RefreshControl
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChatService, Conversation } from '../services/ChatService';
import { AuthService, User } from '../services/AuthService';

export const FriendsList: React.FC = () => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [user, setUser] = useState<User | null>(null);

    const loadData = useCallback(async () => {
        const [convs, userData] = await Promise.all([
            ChatService.getConversations(),
            AuthService.getUser()
        ]);
        setConversations(convs);
        setUser(userData);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, [loadData]);

    const handleAccept = async (id: string) => {
        const success = await ChatService.acceptConversation(id);
        if (success) {
            await loadData();
        }
    };

    const navigation = useNavigation<any>();

    const renderItem = ({ item }: { item: Conversation }) => {
        const myMember = item.members.find(m => m.user_id === user?.id);
        const otherMember = item.members.find(m => m.user_id !== user?.id);
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
                    {isPending && <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>!</Text></View>}
                </View>
                <Text style={styles.compactName} numberOfLines={1}>{name.split(' ')[0]}</Text>
            </TouchableOpacity>
        );
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    const pendingRequests = conversations.filter(c => c.members.find(m => m.user_id === user?.id)?.status === 'pending');
    const friends = conversations.filter(c => {
        const me = c.members.find(m => m.user_id === user?.id);
        const them = c.members.find(m => m.user_id !== user?.id);
        return me?.status === 'accepted' && them?.status === 'accepted';
    });

    return (
        <View style={styles.compactContainer}>
            <Text style={styles.sectionTitle}>Social Hub</Text>
            <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[...pendingRequests, ...friends]}
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
    },
    emptyTextCompact: {
        color: '#333',
        fontSize: 12,
        fontStyle: 'italic',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 20,
    },
});
