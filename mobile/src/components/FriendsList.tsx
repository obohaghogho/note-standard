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

    const renderItem = ({ item }: { item: Conversation }) => {
        const myMember = item.members.find(m => m.user_id === user?.id);
        const otherMember = item.members.find(m => m.user_id !== user?.id);
        const isPending = myMember?.status === 'pending';
        const profile = otherMember?.profile;
        const name = profile?.full_name || profile?.username || 'Unknown User';

        return (
            <View style={[styles.itemContainer, isPending && styles.pendingItem]}>
                <View style={styles.leftContent}>
                    <View style={styles.avatarContainer}>
                        {profile?.avatar_url ? (
                            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.infoContainer}>
                        <Text style={styles.name}>{name}</Text>
                        <Text style={styles.status}>
                            {isPending ? 'Wants to chat' : 'Friend'}
                        </Text>
                    </View>
                </View>
                
                {isPending && (
                    <TouchableOpacity 
                        style={styles.acceptButton}
                        onPress={() => handleAccept(item.id)}
                    >
                        <Text style={styles.acceptButtonText}>Accept</Text>
                    </TouchableOpacity>
                )}
            </View>
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
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Social Hub</Text>
            </View>
            
            <FlatList
                data={[...pendingRequests, ...friends]}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No friends or requests found.</Text>
                    </View>
                }
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        width: '100%',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a0a0a',
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    listContent: {
        padding: 15,
    },
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#111111',
        padding: 15,
        borderRadius: 15,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#1a1a1a',
    },
    pendingItem: {
        borderColor: '#3b82f644',
        backgroundColor: '#3b82f611',
    },
    leftContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatarContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        overflow: 'hidden',
        marginRight: 15,
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    avatarPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#222',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    infoContainer: {
        flex: 1,
    },
    name: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },
    status: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    acceptButton: {
        backgroundColor: '#3b82f6',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 10,
    },
    acceptButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: '#444',
        fontSize: 16,
        textAlign: 'center',
    },
});
