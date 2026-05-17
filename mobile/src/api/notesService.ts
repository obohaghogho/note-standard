import * as SQLite from 'expo-sqlite';
import { supabase } from './supabase';

export interface Note {
    id: string;
    title: string;
    content: string;
    owner_id: string;
    is_private: boolean;
    is_favorite: boolean;
    tags: string[];
    created_at: string;
    updated_at: string;
    synced: number; // 0 for local-only, 1 for synced
}

// Simple UUID v4 generator for React Native
const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

const db = SQLite.openDatabaseSync('notes.db');

export const initDB = () => {
    db.execSync(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT,
      content TEXT,
      owner_id TEXT,
      is_private INTEGER,
      is_favorite INTEGER,
      tags TEXT,
      created_at TEXT,
      updated_at TEXT,
      synced INTEGER DEFAULT 0
    );
  `);
};

export const notesService = {
    /**
     * Fetches all notes, prioritizes local then syncs with remote
     */
    async getNotes(userId: string): Promise<Note[]> {
        const results = db.getAllSync<any>('SELECT * FROM notes WHERE owner_id = ? ORDER BY updated_at DESC', [userId]);
        return results.map(row => ({
            ...row,
            is_private: !!row.is_private,
            is_favorite: !!row.is_favorite,
            tags: JSON.parse(row.tags || '[]')
        }));
    },

    async saveNote(note: Partial<Note>, userId: string) {
        const id = note.id || generateUUID();
        const now = new Date().toISOString();

        db.runSync(`
      INSERT OR REPLACE INTO notes (id, title, content, owner_id, is_private, is_favorite, tags, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [
            id,
            note.title || '',
            note.content || '',
            userId,
            note.is_private ? 1 : 0,
            note.is_favorite ? 1 : 0,
            JSON.stringify(note.tags || []),
            note.created_at || now,
            now
        ]);

        // Try to sync in background
        this.syncWithRemote(userId);

        return id;
    },

    async syncWithRemote(userId: string) {
        try {
            // 1. Upload unsynced local changes
            const unsynced = db.getAllSync<any>('SELECT * FROM notes WHERE synced = 0 AND owner_id = ?', [userId]);

            for (const note of unsynced) {
                const { error } = await supabase
                    .from('notes')
                    .upsert({
                        id: note.id,
                        title: note.title,
                        content: note.content,
                        owner_id: note.owner_id,
                        is_private: !!note.is_private,
                        is_favorite: !!note.is_favorite,
                        tags: JSON.parse(note.tags),
                        updated_at: note.updated_at
                    });

                if (!error) {
                    db.runSync('UPDATE notes SET synced = 1 WHERE id = ?', [note.id]);
                }
            }

            // 2. Download remote changes
            const { data: remoteNotes } = await supabase
                .from('notes')
                .select('*')
                .eq('owner_id', userId);

            if (remoteNotes) {
                for (const rn of remoteNotes) {
                    db.runSync(`
            INSERT OR REPLACE INTO notes (id, title, content, owner_id, is_private, is_favorite, tags, created_at, updated_at, synced)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `, [
                        rn.id,
                        rn.title,
                        rn.content,
                        rn.owner_id,
                        rn.is_private ? 1 : 0,
                        rn.is_favorite ? 1 : 0,
                        JSON.stringify(rn.tags),
                        rn.created_at,
                        rn.updated_at
                    ]);
                }
            }
        } catch (err) {
            console.error('Sync failed:', err);
        }
    }
};
