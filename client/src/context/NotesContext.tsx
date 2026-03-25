import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, supabaseSafe, resetRateLimiters } from '../lib/supabaseSafe';
import { useAuth } from './AuthContext';
import type { Note } from '../types/note';

interface NotesContextType {
    notes: Note[];
    stats: { totalBy: number; favorites: number };
    loading: boolean;
    refreshNotes: (searchTerm?: string, sortBy?: string) => Promise<void>;
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export const NotesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [notes, setNotes] = useState<Note[]>([]);
    const [stats, setStats] = useState({ totalBy: 0, favorites: 0 });
    const [loading, setLoading] = useState(true);

    /**
     * Fetch notes from the database with caching and rate-limiting.
     */
    const fetchNotes = useCallback(async (searchTerm = '', sortBy = 'latest') => {
        if (!user) return;
        
        try {
            // Using a unique key per user/search/sort configuration for the cache
            const results = await supabaseSafe<Note[]>(
                `notes-list-${user.id}-${searchTerm}-${sortBy}`,
                async () => {
                    let query = supabase
                        .from('notes')
                        .select('*')
                        .eq('owner_id', user.id);

                    if (sortBy === 'latest') query = query.order('updated_at', { ascending: false });
                    else if (sortBy === 'oldest') query = query.order('updated_at', { ascending: true });
                    else if (sortBy === 'title') query = query.order('title', { ascending: true });

                    if (searchTerm) {
                        query.ilike('title', `%${searchTerm}%`);
                    }
                    return query;
                },
                { fallback: [] }
            );
            
            setNotes(results || []);

            // Also update stats if it's the main list fetch
            if (!searchTerm) {
                const [totalRes, favRes] = await Promise.all([
                    supabase
                      .from('notes')
                      .select('id', { count: 'exact', head: true })
                      .eq('owner_id', user.id),
                    supabase
                      .from('notes')
                      .select('id', { count: 'exact', head: true })
                      .eq('owner_id', user.id)
                      .eq('is_favorite', true)
                ]);
                setStats({
                    totalBy: totalRes.count || 0,
                    favorites: favRes.count || 0
                });
            }
        } catch (error) {
            console.error('[NotesContext] Error fetching notes:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    /**
     * Real-time Synchronization
     * Listens for changes to the 'notes' table for the current user.
     */
    useEffect(() => {
        if (!user) {
            setNotes([]);
            setLoading(false);
            return;
        }

        // Initial fetch
        fetchNotes();

        // 1. Subscribe to changes for this user's notes
        const channel = supabase
            .channel(`notes-sync-${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notes',
                    filter: `owner_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('[NotesContext] Real-time activity detected:', payload.eventType);
                    
                    // 2. Invalidate relevant caches in supabaseSafe
                    // This ensures the NEXT fetchNotes (e.g. after a search change) gets fresh data.
                    resetRateLimiters('notes-list-');

                    // 3. Update local state immediately (Optimistic UI)
                    if (payload.eventType === 'INSERT') {
                        const newNote = payload.new as Note;
                        setNotes(prev => {
                            if (prev.some(n => n.id === newNote.id)) return prev;
                            return [newNote, ...prev];
                        });
                        setStats(prev => ({ ...prev, totalBy: prev.totalBy + 1 }));
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedNote = payload.new as Note;
                        setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
                        
                        // Recalculate favorites if changed
                        if (payload.old.is_favorite !== payload.new.is_favorite) {
                            setStats(prev => ({ 
                                ...prev, 
                                favorites: payload.new.is_favorite ? prev.favorites + 1 : prev.favorites - 1 
                            }));
                        }
                    } else if (payload.eventType === 'DELETE') {
                        const deletedId = payload.old.id;
                        const wasFavorite = notes.find(n => n.id === deletedId)?.is_favorite;
                        setNotes(prev => prev.filter(n => n.id !== deletedId));
                        setStats(prev => ({ 
                            totalBy: Math.max(0, prev.totalBy - 1),
                            favorites: wasFavorite ? Math.max(0, prev.favorites - 1) : prev.favorites
                        }));
                    }
                }
            )
            .subscribe((status) => {
               if (status === 'SUBSCRIBED') {
                   console.log('[NotesContext] Real-time subscription active.');
               }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, fetchNotes]);

    return (
        <NotesContext.Provider value={{ notes, stats, loading, refreshNotes: fetchNotes }}>
            {children}
        </NotesContext.Provider>
    );
};

export const useNotes = () => {
    const context = useContext(NotesContext);
    if (context === undefined) {
        throw new Error('useNotes must be used within a NotesProvider');
    }
    return context;
};
