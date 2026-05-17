import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList } from 'react-native';
import { useNotes } from '../../hooks/useNotes';
import { NoteCard } from '../../components/notes/NoteCard';
import { theme } from '../../styles/theme';
import { Plus } from 'lucide-react-native';

export const NotesDashboard = ({ navigation }: any) => {
    const { notes, loading, refresh } = useNotes();

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>My Notes</Text>
                <Text style={styles.subtitle}>{notes.length} total notes</Text>
            </View>

            {loading && notes.length === 0 ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={notes}
                    renderItem={({ item }) => (
                        <NoteCard
                            note={item}
                            onPress={() => navigation.navigate('NoteEditor', { noteId: item.id })}
                        />
                    )}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    onRefresh={refresh}
                    refreshing={loading}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>No notes found. Start by creating your first note!</Text>
                        </View>
                    }
                />
            )}

            <Pressable
                style={styles.fab}
                onPress={() => navigation.navigate('NoteEditor')}
            >
                <Plus size={32} color="#fff" />
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        padding: theme.spacing.lg,
        paddingBottom: 0,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    subtitle: {
        fontSize: 14,
        color: theme.colors.textMuted,
        marginTop: 4,
        marginBottom: theme.spacing.md,
    },
    list: {
        padding: theme.spacing.lg,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: theme.colors.textMuted,
        textAlign: 'center',
        fontSize: 16,
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    }
});
