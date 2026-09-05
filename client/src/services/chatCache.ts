import type { Message, Conversation } from '../stores/chatStore';

const DB_NAME = 'NoteStandardChatDB';
const DB_VERSION = 1;
const STORE_CONVERSATIONS = 'conversations';
const STORE_MESSAGES = 'messages';

/**
 * IndexedDB Local Cache Engine
 * Stores recent conversations and message frames locally for instant chat open (<100ms warm load).
 */
export class ChatCacheEngine {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
          db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
          msgStore.createIndex('conversation_id', 'conversation_id', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  public static async saveConversations(conversations: Conversation[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      conversations.forEach((conv) => store.put(conv));
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
      });
    } catch (err) {
      console.warn('[ChatCache] Failed to save conversations:', err);
    }
  }

  public static async getConversations(): Promise<Conversation[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_CONVERSATIONS, 'readonly');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      const request = store.getAll();
      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch {
      return [];
    }
  }

  public static async saveMessages(messages: Message[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      messages.forEach((msg) => store.put(msg));
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
      });
    } catch (err) {
      console.warn('[ChatCache] Failed to save messages:', err);
    }
  }

  public static async getMessagesForConversation(conversationId: string): Promise<Message[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_MESSAGES, 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index('conversation_id');
      const request = index.getAll(conversationId);
      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch {
      return [];
    }
  }

  /**
   * High-speed single-transaction batch retrieval of all stored messages grouped by conversation_id.
   * Enables instant 0ms rendering of recent message threads on boot.
   */
  public static async batchGetMessagesForAllConversations(): Promise<Record<string, Message[]>> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_MESSAGES, 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.getAll();
      return new Promise((resolve) => {
        request.onsuccess = () => {
          const allMsgs: Message[] = request.result || [];
          const grouped: Record<string, Message[]> = {};
          for (const msg of allMsgs) {
            if (msg.conversation_id) {
              if (!grouped[msg.conversation_id]) {
                grouped[msg.conversation_id] = [];
              }
              grouped[msg.conversation_id].push(msg);
            }
          }
          resolve(grouped);
        };
      });
    } catch {
      return {};
    }
  }

  /**
   * Single-transaction eviction of a conversation and all its messages.
   */
  public static async deleteConversation(conversationId: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction([STORE_CONVERSATIONS, STORE_MESSAGES], 'readwrite');
      const convStore = tx.objectStore(STORE_CONVERSATIONS);
      const msgStore = tx.objectStore(STORE_MESSAGES);

      convStore.delete(conversationId);

      const index = msgStore.index('conversation_id');
      const request = index.openKeyCursor(IDBKeyRange.only(conversationId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          msgStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      if (import.meta.env.DEV) {
        const remainingMsgs = await this.getMessagesForConversation(conversationId);
        const remainingConvs = await this.getConversations();
        const convExists = remainingConvs.some((c) => c.id === conversationId);
        console.log(`[ChatCache] Read-back verification for deleted conv ${conversationId}: convExists=${convExists}, remainingMsgs=${remainingMsgs.length}`);
      }
    } catch (err) {
      console.warn('[ChatCache] Failed to delete conversation:', err);
    }
  }

  /**
   * Single-transaction clearing of all messages belonging to a conversation.
   */
  public static async clearMessagesForConversation(conversationId: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const msgStore = tx.objectStore(STORE_MESSAGES);
      const index = msgStore.index('conversation_id');
      const request = index.openKeyCursor(IDBKeyRange.only(conversationId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          msgStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      if (import.meta.env.DEV) {
        const remainingMsgs = await this.getMessagesForConversation(conversationId);
        console.log(`[ChatCache] Read-back verification for cleared conv ${conversationId}: remainingMsgs=${remainingMsgs.length}`);
      }
    } catch (err) {
      console.warn('[ChatCache] Failed to clear messages for conversation:', err);
    }
  }
}

