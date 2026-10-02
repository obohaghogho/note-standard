import { encryptMessage, decryptMessage } from './crypto';
import { storage } from './storage';
import { supabase } from '../api/supabase';

// In-memory public key cache: userId -> publicKey Base64 string
const publicKeyCache = new Map<string, string>();

/**
 * Handles E2E encryption independently of the message merge logic.
 * The output must always be plaintext for the merge engine.
 */
export const mobileTransportAdapter = {
    clearCache() {
        publicKeyCache.clear();
        storage.clearPrivateKeyCache();
    },

    setPublicKey(userId: string, publicKey: string) {
        if (userId && publicKey) {
            publicKeyCache.set(userId, publicKey);
        }
    },

    async resolvePublicKey(userId: string, knownMembers?: any[]): Promise<string | null> {
        if (!userId) return null;

        // 1. Check in-memory cache
        if (publicKeyCache.has(userId)) {
            return publicKeyCache.get(userId)!;
        }

        // 2. Check known conversation members
        if (knownMembers && knownMembers.length > 0) {
            const member = knownMembers.find((m: any) => m.user_id === userId || m.id === userId);
            const pubKey = member?.profile?.public_key || member?.public_key;
            if (pubKey) {
                publicKeyCache.set(userId, pubKey);
                return pubKey;
            }
        }

        // 3. Fallback to Supabase fetch only if missing
        try {
            const { data: sender } = await supabase
                .from('profiles')
                .select('public_key')
                .eq('id', userId)
                .single();

            if (sender?.public_key) {
                publicKeyCache.set(userId, sender.public_key);
                return sender.public_key;
            }
        } catch (err) {
            console.warn('[TransportAdapter] Failed to resolve public key for user:', userId, err);
        }

        return null;
    },

    async decodeIncomingMessage(msg: any, userId: string, knownMembers?: any[], cachedPrivateKey?: Uint8Array | null) {
        if (!msg.nonce) return msg.content; // Not encrypted

        try {
            // 1. Resolve sender public key (Cache -> Members -> Supabase)
            const senderPublicKey = await this.resolvePublicKey(msg.sender_id, knownMembers);
            if (!senderPublicKey) return null;

            // 2. Get own private key (Memory -> SecureStore)
            const privateKey = cachedPrivateKey !== undefined ? cachedPrivateKey : await storage.getPrivateKey();
            if (!privateKey) return null;

            // 3. Decrypt synchronously in memory
            return decryptMessage(msg.content, msg.nonce, senderPublicKey, privateKey);
        } catch (err) {
            console.error('[TransportAdapter] Decryption failed:', err);
            return '[Decryption Failed]';
        }
    },

    async decodeMessageBatch(messages: any[], userId: string, knownMembers?: any[]): Promise<any[]> {
        if (!messages || messages.length === 0) return [];

        // 1. Fetch private key ONCE for the batch
        const privateKey = await storage.getPrivateKey();

        // 2. Pre-seed public key cache from knownMembers
        if (knownMembers) {
            knownMembers.forEach((m: any) => {
                const uId = m.user_id || m.id;
                const pubKey = m.profile?.public_key || m.public_key;
                if (uId && pubKey) {
                    publicKeyCache.set(uId, pubKey);
                }
            });
        }

        // 3. Identify missing public keys for senders of encrypted messages
        const missingUserIds = new Set<string>();
        messages.forEach(msg => {
            if (msg.nonce && msg.sender_id && !publicKeyCache.has(msg.sender_id)) {
                missingUserIds.add(msg.sender_id);
            }
        });

        // Batch fetch missing public keys from Supabase in ONE query if any missing
        if (missingUserIds.size > 0) {
            try {
                const ids = Array.from(missingUserIds);
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, public_key')
                    .in('id', ids);

                if (profiles) {
                    profiles.forEach((p: any) => {
                        if (p.id && p.public_key) {
                            publicKeyCache.set(p.id, p.public_key);
                        }
                    });
                }
            } catch (err) {
                console.warn('[TransportAdapter] Batch public key fetch failed:', err);
            }
        }

        // 4. Decrypt messages synchronously in memory
        return messages.map(msg => {
            if (!msg.nonce) return msg;

            const senderPublicKey = publicKeyCache.get(msg.sender_id);
            if (!senderPublicKey || !privateKey) {
                return { ...msg, content: '[Decryption Failed]' };
            }

            const plainContent = decryptMessage(msg.content, msg.nonce, senderPublicKey, privateKey);
            return { ...msg, content: plainContent || '[Decryption Failed]' };
        });
    },

    async encodeOutgoingPayload(conversationId: string, text: string, userId: string, receiverPublicKey?: string) {
        try {
            const privateKey = await storage.getPrivateKey();

            if (receiverPublicKey && privateKey) {
                const encrypted = encryptMessage(text, receiverPublicKey, privateKey);
                return {
                    content: encrypted.content,
                    nonce: encrypted.nonce,
                    is_encrypted: true
                };
            }
        } catch (err) {
            console.error('[TransportAdapter] Encryption failed, falling back to plaintext:', err);
        }

        // Fallback to plaintext
        return { content: text };
    }
};

