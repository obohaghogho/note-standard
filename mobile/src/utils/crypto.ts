import nacl from 'tweetnacl';
import { toByteArray, fromByteArray } from 'base64-js';

/**
 * Generates a new X25519 keypair for E2EE
 */
export const generateKeyPair = () => {
    return nacl.box.keyPair();
};

/**
 * Encrypts a message for a specific receiver
 */
export const encryptMessage = (
    message: string,
    receiverPublicKeyBase64: string,
    senderPrivateKey: Uint8Array
) => {
    const receiverPublicKey = toByteArray(receiverPublicKeyBase64);
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageUint8 = new TextEncoder().encode(message);

    const encrypted = nacl.box(
        messageUint8,
        nonce,
        receiverPublicKey,
        senderPrivateKey
    );

    return {
        content: fromByteArray(encrypted),
        nonce: fromByteArray(nonce)
    };
};

/**
 * Decrypts a message from a specific sender
 */
export const decryptMessage = (
    encryptedBase64: string,
    nonceBase64: string,
    senderPublicKeyBase64: string,
    receiverPrivateKey: Uint8Array
) => {
    try {
        const encrypted = toByteArray(encryptedBase64);
        const nonce = toByteArray(nonceBase64);
        const senderPublicKey = toByteArray(senderPublicKeyBase64);

        const decrypted = nacl.box.open(
            encrypted,
            nonce,
            senderPublicKey,
            receiverPrivateKey
        );

        return decrypted ? new TextDecoder().decode(decrypted) : null;
    } catch (err) {
        console.error('Decryption failed:', err);
        return null;
    }
};
