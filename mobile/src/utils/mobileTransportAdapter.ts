import { encryptMessage, decryptMessage } from './crypto';
import { storage } from './storage';
import { supabase } from '../api/supabase';

/**
 * Handles E2E encryption independently of the message merge logic.
 * The output must always be plaintext for the merge engine.
 */
export const mobileTransportAdapter = {
    async decodeIncomingMessage(msg: any, userId: string) {
        if (!msg.nonce) return msg.content; // Not encrypted

        try {
            // 1. Get sender's public key
            const { data: sender } = await supabase
                .from('profiles')
                .select('public_key')
                .eq('id', msg.sender_id)
                .single();

            if (!sender?.public_key) return null;

            // 2. Get own private key
            const privateKey = await storage.getPrivateKey();
            if (!privateKey) return null;

            // 3. Decrypt
            return decryptMessage(msg.content, msg.nonce, sender.public_key, privateKey);
        } catch (err) {
            console.error('[TransportAdapter] Decryption failed:', err);
            return '[Decryption Failed]';
        }
    },

    async encodeOutgoingPayload(conversationId: string, text: string, userId: string) {
        try {
            // Get other participant to encrypt for them
            const { data: members } = await supabase
                .from('conversation_members')
                .select('user_id, profiles(public_key)')
                .eq('conversation_id', conversationId)
                .neq('user_id', userId)
                .single();

            const receiverPublicKey = (members?.profiles as any)?.public_key;
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
