import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Note } from '../../api/notesService';
import { theme } from '../../styles/theme';
import { Star, ChevronRight } from 'lucide-react-native';
import { formatDistanceToNow } from 'date-fns';

interface NoteCardProps {
    note: Note;
    onPress: () => void;
}

const StarIcon = Star as any;
const ChevronRightIcon = ChevronRight as any;

export const NoteCard = ({ note, onPress }: NoteCardProps) => {
    return (
        <Pressable style={styles.card} onPress={onPress}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>{note.title || 'Untitled'}</Text>
                {note.is_favorite && <StarIcon size={16} color={theme.colors.primary} fill={theme.colors.primary} />}
            </View>
            <Text style={styles.content} numberOfLines={2}>{note.content}</Text>
            <View style={styles.footer}>
                <Text style={styles.date}>
                    {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
                </Text>
                <View style={styles.meta}>
                    {!note.synced && <View style={styles.offlineBadge} />}
                    <ChevronRightIcon size={16} color={theme.colors.textMuted} />
                </View>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md,
        borderRadius: theme.roundness,
        marginBottom: theme.spacing.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.xs,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.colors.text,
        flex: 1,
    },
    content: {
        fontSize: 14,
        color: theme.colors.textMuted,
        lineHeight: 20,
        marginBottom: theme.spacing.sm,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    date: {
        fontSize: 12,
        color: theme.colors.textMuted,
    },
    meta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    offlineBadge: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.primary,
    }
});
