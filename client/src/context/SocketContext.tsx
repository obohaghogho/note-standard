import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import * as accountManager from '../utils/accountManager';
import { supabase } from '../lib/supabaseSafe';

// ─── Config ──────────────────────────────────────────────────────
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

if (!SOCKET_URL && import.meta.env.PROD) {
    console.error('❌ CRITICAL: VITE_SOCKET_URL is not defined in production environment!');
}

// Requirement 3: Stable module singleton strategy
let globalSocket: Socket | null = null;

// ─── Types ───────────────────────────────────────────────────────
interface SocketContextValue {
    socket: Socket | null;
    connected: boolean;
    error: string | null;
    teardown: () => void;
    initialize: (token: string) => Promise<void>;
}

export interface RealtimeNotification {
    id?: string;
    type: string;
    title: string;
    message?: string;
    link?: string;
    created_at?: string;
}

const SocketContext = createContext<SocketContextValue>({
    socket: null,
    connected: false,
    error: null,
    teardown: () => {},
    initialize: async () => {},
});

export const useSocket = () => useContext(SocketContext);

// ─── Provider ────────────────────────────────────────────────────
export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session, authReady, user } = useAuth();
    const [connected, setConnected] = useState(globalSocket?.connected || false);
    const [error, setError] = useState<string | null>(null);
    const retryCount = useRef(0);
    const MAX_RETRIES = 10;

    // We no longer rely on effect cleanup to manage socket lifecycle.
    // This allows the socket to persist across React component unmount/remounts and token refreshes.
    useEffect(() => {
        if (!authReady) return;

        const token = session?.access_token;
        const isValidToken = token && typeof token === 'string' && token.length > 20;

        // 1. Explicit Sign-Out Teardown
        // We ONLY destroy the socket if the user is truly signed out.
        if (!isValidToken || !user) {
            if (globalSocket) {
                console.log(`[Socket Forensic] Explicit Sign-Out — disconnecting socket at ${Date.now()}`);
                globalSocket.disconnect();
                globalSocket = null;
                setConnected(false);
            }
            return;
        }

        // 2. Token Refresh Guard
        // If already connected, just dynamically update the auth token for the next reconnect.
        // Requirement 1, 4, 5, 10
        if (globalSocket) {
            const socketWithAuth = globalSocket as Socket & { auth?: { token?: string } };
            if (socketWithAuth.auth?.token !== token) {
                console.log(`[Socket Forensic] Auth Refresh Detected at ${Date.now()}. Updating internal socket auth token without tearing down transport.`);
                socketWithAuth.auth = { token };
            }
            return;
        }

        // 3. Initial Boot Creation
        console.log(`[Socket Forensic] Initializing persistent socket singleton at ${Date.now()}`);

        const socket = io(SOCKET_URL, {
            auth: (cb) => {
                const storedAccount = user?.id ? accountManager.getAccount(user.id) : null;
                cb({
                    token: session?.access_token,
                    sessionId: storedAccount?.sessionId,
                    deviceId: storedAccount?.deviceId
                });
            },
            withCredentials: true,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: MAX_RETRIES,
            reconnectionDelay: 2000,
            timeout: 60000,
        });

        globalSocket = socket;

        socket.on('connect', () => {
            console.log(`[Socket Forensic] ✓ Connected via ${socket.io.engine.transport.name} at ${Date.now()}`);
            setConnected(true);
            setError(null);
            retryCount.current = 0;

            socket.io.engine.on('upgrade', (t: { name: string }) => {
                console.log(`[Socket Forensic] ↑ Upgraded to ${t.name} at ${Date.now()}`);
            });
        });

        socket.on('disconnect', (reason) => {
            console.log(`[Socket Forensic] Disconnected at ${Date.now()}. Reason: ${reason}`);
            setConnected(false);
            if (reason === 'io server disconnect') {
                socket.connect(); // Server kicked us, manually reconnect
            }
        });

        socket.on('connect_error', (err) => {
            console.error(`[Socket Forensic] Connection error at ${Date.now()}:`, err.message);
            setError(err.message);
            setConnected(false);

            if (retryCount.current < MAX_RETRIES) {
                retryCount.current++;
                console.log(`[Socket Forensic] Retrying (${retryCount.current}/${MAX_RETRIES})…`);
            } else {
                toast.error('Real-time connection failed. Please refresh.');
            }
        });

        // Handle server-side session revocation
        socket.on('auth:revoked', async () => {
            console.warn('[Socket Forensic] 🛑 Session revoked by server. Signing out...');
            globalSocket?.removeAllListeners();
            globalSocket?.disconnect();
            globalSocket = null;
            setConnected(false);
            await supabase.auth.signOut();
            toast.error('Your session was revoked. Please sign in again.');
        });

        // Handle soft replacement (newer tab/window took over this session)
        socket.on('session:replaced', () => {
            console.warn('[Socket Forensic] ♻️ Session replaced by newer connection. Dropping this socket.');
            globalSocket?.removeAllListeners();
            globalSocket?.disconnect();
            globalSocket = null;
            setConnected(false);
        });

        // We intentionally DO NOT return a cleanup function that calls socket.off()
        // because the early return on session refresh would prevent them from being rebound,
        // leaving the socket completely silent.
    }, [authReady, session, user]); // Re-evaluates when session refreshes

    // Sync HMR / remount state with global socket
    useEffect(() => {
        if (!globalSocket) return;
        
        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        
        globalSocket.on('connect', onConnect);
        globalSocket.on('disconnect', onDisconnect);
        
        setConnected(globalSocket.connected);
        
        return () => {
            globalSocket?.off('connect', onConnect);
            globalSocket?.off('disconnect', onDisconnect);
        };
    }, []);
    const teardown = useCallback(() => {
        if (globalSocket) {
            console.log(`[ACCOUNT_FORENSIC] SOCKET_TEARDOWN - Disconnecting socket at ${Date.now()}`);
            globalSocket.removeAllListeners();
            globalSocket.disconnect();
            globalSocket = null;
            setConnected(false);
            setError(null);
        }
    }, []);

    const initialize = useCallback((token: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (globalSocket && connected) {
                const socketWithAuth = globalSocket as Socket & { auth?: { token?: string } };
                if (socketWithAuth.auth?.token === token) {
                    resolve();
                    return;
                }
            }
            
            // Clean up any stale socket
            teardown();

            console.log(`[ACCOUNT_FORENSIC] SOCKET_INITIALIZE - Creating fresh socket at ${Date.now()}`);

            const socket = io(SOCKET_URL, {
                auth: (cb) => {
                    const storedAccount = accountManager.getActiveAccountId() 
                        ? accountManager.getAccount(accountManager.getActiveAccountId()!) 
                        : null;
                    cb({
                        token,
                        sessionId: storedAccount?.sessionId,
                        deviceId: storedAccount?.deviceId
                    });
                },
                withCredentials: true,
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: MAX_RETRIES,
                reconnectionDelay: 2000,
                timeout: 60000,
            });

            globalSocket = socket;

            // Instead of unbinding listeners on timeout, just reject the promise 
            // so the caller isn't blocked forever, but keep the listeners active
            // so when Socket.IO's built-in reconnection eventually succeeds,
            // the state (setConnected) updates properly!
            setTimeout(() => {
                reject(new Error("Socket connection timed out during initialization, but background retry continues"));
            }, 10000);

            socket.on('connect', () => {
                console.log(`[ACCOUNT_FORENSIC] SOCKET_CONNECTED - Connected via ${socket.io.engine.transport.name} at ${Date.now()}`);
                setConnected(true);
                setError(null);
                retryCount.current = 0;
                resolve();

                socket.io.engine.on('upgrade', (t: { name: string }) => {
                    console.log(`[Socket Forensic] ↑ Upgraded to ${t.name} at ${Date.now()}`);
                });
            });

            socket.on('disconnect', (reason) => {
                console.log(`[Socket Forensic] Disconnected at ${Date.now()}. Reason: ${reason}`);
                setConnected(false);
                if (reason === 'io server disconnect') {
                    socket.connect(); // Server kicked us, manually reconnect
                }
            });

            socket.on('connect_error', (err) => {
                console.error(`[Socket Forensic] Connection error at ${Date.now()}:`, err.message);
                setError(err.message);
                setConnected(false);

                if (retryCount.current < MAX_RETRIES) {
                    retryCount.current++;
                    console.log(`[Socket Forensic] Retrying (${retryCount.current}/${MAX_RETRIES})…`);
                } else {
                    toast.error('Real-time connection failed. Please refresh.');
                    reject(new Error("Socket connection failed"));
                }
            });
        });
    }, [connected, teardown]);

    return (
        <SocketContext.Provider value={{ socket: globalSocket, connected, error, teardown, initialize }}>
            {children}
        </SocketContext.Provider>
    );
};
