import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, Pressable, Text, ScrollView } from 'react-native';
import { theme } from '../../styles/theme';
import { useNotes } from '../../hooks/useNotes';
import { Save, ArrowLeft } from 'lucide-react-native';

export const NoteEditor = ({ route, navigation }: any) => {
    const { noteId } = route.params || {};
    const { notes, addNote } = useNotes();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');

    useEffect(() => {
        if (noteId) {
            const note = notes.find(n => n.id === noteId);
            if (note) {
                setTitle(note.title);
                setContent(note.content);
            }
        }
    }, [noteId, notes]);

    const handleSave = async () => {
        await addNote({ id: noteId, title, content });
        navigation.goBack();
    };

    return (
        <View style={styles.container}>
            <View style={styles.appBar}>
                <Pressable onPress={() => navigation.goBack()}>
                    <ArrowLeft color={theme.colors.text} size={24} />
                </Pressable>
                <Text style={styles.appBarTitle}>{noteId ? 'Edit Note' : 'New Note'}</Text>
                <Pressable onPress={handleSave}>
                    <Save color={theme.colors.primary} size={24} />
                </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.editor}>
                <TextInput
                    style={styles.titleInput}
                    placeholder="Title"
                    placeholderTextColor={theme.colors.textMuted}
                    value={title}
                    onChangeText={setTitle}
                />
                <TextInput
                    style={styles.contentInput}
                    placeholder="Start typing..."
                    placeholderTextColor={theme.colors.textMuted}
                    value={content}
                    onChangeText={setContent}
                    multiline
                />
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    appBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: theme.spacing.md,
        backgroundColor: theme.colors.surface,
    },
    appBarTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '700' },
    editor: { padding: theme.spacing.lg },
    titleInput: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: theme.spacing.md
    },
    contentInput: {
        fontSize: 16,
        color: theme.colors.text,
        minHeight: 300,
        textAlignVertical: 'top'
    }
});
