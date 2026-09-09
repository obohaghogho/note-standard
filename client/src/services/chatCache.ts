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

  public static async saveConversations(conversations: Conversation[], userId?: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      conversations.forEach((conv) => {
        const toSave = userId ? { ...conv, owner_user_id: userId } : conv;
        store.put(toSave);
      });
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
      });
    } catch (err) {
      console.warn('[ChatCache] Failed to save conversations:', err);
    }
  }

  public static async getConversations(userId?: string): Promise<Conversation[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_CONVERSATIONS, 'readonly');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      const request = store.getAll();
      return new Promise((resolve) => {
        request.onsuccess = () => {
          const result: (Conversation & { owner_user_id?: string })[] = request.result || [];
          if (!userId) return resolve(result);
          const filtered = result.filter(conv => {
            if (conv.owner_user_id && conv.owner_user_id !== userId) {
              return false;
            }
            if (conv.members && Array.isArray(conv.members) && conv.members.length > 0) {
              return conv.members.some(m => m && (m.user_id === userId || (m.profile && (m.profile as any).id === userId)));
            }
            return conv.owner_user_id === userId;
          });
          resolve(filtered);
        };
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

  public static async replaceMessagesForConversation(conversationId: string, freshMessages: Message[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const msgStore = tx.objectStore(STORE_MESSAGES);
      const index = msgStore.index('conversation_id');
      
      // Step 1: Delete old cached messages for this conversation
      const request = index.openKeyCursor(IDBKeyRange.only(conversationId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          msgStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      // Step 2: Put fresh server messages into the store
      freshMessages.forEach((msg) => {
        if (msg && msg.id) {
          msgStore.put(msg);
        }
      });

      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
      });
    } catch (err) {
      console.warn('[ChatCache] Failed to replace messages for conversation:', err);
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
        request.onsuccess = () => {
          const list: Message[] = request.result || [];
          list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          resolve(list);
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * High-speed single-transaction batch retrieval of stored messages grouped by conversation_id.
   * Enables instant 0ms rendering of recent message threads on boot.
   */
  public static async batchGetMessagesForAllConversations(validConversationIds?: string[]): Promise<Record<string, Message[]>> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_MESSAGES, 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.getAll();
      const validSet = validConversationIds ? new Set(validConversationIds) : null;
      return new Promise((resolve) => {
        request.onsuccess = () => {
          const allMsgs: Message[] = request.result || [];
          const grouped: Record<string, Message[]> = {};
          for (const msg of allMsgs) {
            if (msg.conversation_id && (!validSet || validSet.has(msg.conversation_id))) {
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

