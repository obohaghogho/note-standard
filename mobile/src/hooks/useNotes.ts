import { useState, useEffect } from 'react';
import { Note, notesService, initDB } from '../api/notesService';
import { useAuth } from '../context/AuthContext';

export const useNotes = () => {
    const { user } = useAuth();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        initDB();
        if (user) loadNotes();
    }, [user]);

    const loadNotes = async () => {
        if (!user) return;
        setLoading(true);
        const localNotes = await notesService.getNotes(user.id);
        setNotes(localNotes);
        setLoading(false);

        // Background sync
        await notesService.syncWithRemote(user.id);
        const refreshedNotes = await notesService.getNotes(user.id);
        setNotes(refreshedNotes);
    };

    const addNote = async (note: Partial<Note>) => {
        if (!user) return;
        const id = await notesService.saveNote(note, user.id);
        await loadNotes();
        return id;
    };

    return { notes, loading, addNote, refresh: loadNotes };
};
