import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import * as accountManager from '../utils/accountManager';
import { resolveLocalUrl } from '../lib/networkUtils';
import { getDeviceId } from '../utils/deviceId';

// ─── Config ──────────────────────────────────────────────────────
const rawSocketUrl = import.meta.env.VITE_SOCKET_URL;
const SOCKET_URL = resolveLocalUrl(rawSocketUrl, 'http://localhost:5001');

if (!SOCKET_URL && import.meta.env.PROD) {
    console.error('❌ CRITICAL: VITE_SOCKET_URL is not defined in production environment!');
}

// Global debug guard for real-time forensics
declare global {
    interface Window {
        __realtimeDebug: {
            sockets: number;
            authEvents: unknown[];
            listeners: Record<string, number>;
        };
    }
}
window.__realtimeDebug = window.__realtimeDebug || { sockets: 0, authEvents: [], listeners: {} };

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
    const initializedUserId = useRef<string | null>(null);
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
                console.log(
                    "[SOCKET_DISCONNECT]",
                    "explicit sign-out",
                    Date.now()
                );
                globalSocket.disconnect();
                globalSocket = null;
                setConnected(false);
                initializedUserId.current = null;
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

        // 3. Removed auto-connect boot creation to enforce strict Boot Contract ordering.
        // The socket is now exclusively instantiated via the explicit initialize() method
        // called by ChatContext *after* the session is successfully registered.
    }, [authReady, session, user]); // Re-evaluates when session refreshes

    // Sync HMR / remount state with global socket
    useEffect(() => {
        // Foreground Wake-up Listeners for iOS
        const handleWakeup = () => {
            if (globalSocket && !globalSocket.connected) {
                console.log(`[FORENSIC][CLIENT] Socket Reconnected via wakeup event (visibility/focus)`);
                globalSocket.connect();
            }
        };
        
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') handleWakeup();
            });
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('focus', handleWakeup);
        }

        if (!globalSocket) return;
        
        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        
        globalSocket.on('connect', onConnect);
        globalSocket.on('disconnect', onDisconnect);
        
        setConnected(globalSocket.connected);
        
        return () => {
            globalSocket?.off('connect', onConnect);
            globalSocket?.off('disconnect', onDisconnect);
            // We intentionally do not remove the handleWakeup listeners here because this effect
            // only mounts once globally, and we want iOS wake-up logic to persist across session switches.
        };
    }, []);
    const teardown = useCallback(() => {
        if (globalSocket) {
            console.log(`[ACCOUNT_FORENSIC] SOCKET_TEARDOWN - Disconnecting socket at ${Date.now()}`);
            console.log(
                "[SOCKET_DISCONNECT]",
                "teardown",
                Date.now()
            );
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
                if (socketWithAuth.auth?.token === token && initializedUserId.current === user?.id) {
                    resolve();
                    return;
                }
            }
            
            // Clean up any stale socket
            teardown();

            const storedAccount = accountManager.getActiveAccountId() 
                ? accountManager.getAccount(accountManager.getActiveAccountId()!) 
                : null;
            const sessionId = storedAccount?.sessionId || localStorage.getItem('chat_session_id');

            getDeviceId().then(fallbackDeviceId => {
                const deviceId = storedAccount?.deviceId || fallbackDeviceId;

            if (!sessionId || !deviceId) {
                console.warn('[ACCOUNT_FORENSIC] SOCKET_INITIALIZE_REJECTED - Missing sessionId or deviceId at ' + Date.now());
                reject(new Error("Socket connection rejected: sessionId or deviceId missing"));
                return;
            }

            console.log(`[ACCOUNT_FORENSIC] SOCKET_INITIALIZE - Creating fresh socket at ${Date.now()}`);
            console.log(
                "[SOCKET_CONNECT]",
                sessionId,
                deviceId,
                Date.now()
            );

            initializedUserId.current = user?.id || null;

            const socket = io(SOCKET_URL, {
                auth: (cb) => {
                    cb({
                        token,
                        sessionId,
                        deviceId
                    });
                },
                withCredentials: true,
                transports: ['polling', 'websocket'],
                reconnection: true,  // Fix: Enable auto-reconnect for iOS background suspends
                reconnectionDelay: 1000,
                reconnectionDelayMax: 10000,
                autoConnect: true,
                timeout: 20000,
            });

            globalSocket = socket;
            // Track whether this socket was intentionally replaced by a newer session.
            // If so, it must NOT attempt to reconnect — doing so would cause infinite churn.
            let replacedByNewerSession = false;
            socket.on('session:replaced', () => {
                console.log('[Socket Forensic] session:replaced received — this socket is superseded, will not reconnect.');
                replacedByNewerSession = true;
            });

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
                console.log(
                    "[SOCKET_DISCONNECT]",
                    reason,
                    Date.now()
                );
                setConnected(false);
                // Socket.IO auto-reconnects on network drops. 
                // Only manually reconnect on server disconnect if not intentionally replaced.
                if (reason === 'io server disconnect' && !replacedByNewerSession) {
                    socket.connect();
                }
            });

            socket.on('connect_error', (err) => {
                console.error(`[Socket Forensic] Connection error at ${Date.now()}:`, err.message);
                setError(err.message);
                setConnected(false);

                const isFatal =
                    err.message.includes('BOOT_NOT_READY') ||
                    err.message.includes('Session ID and Device ID required') ||
                    err.message.includes('Authentication error');

                if (isFatal) {
                    console.warn(`[Socket Forensic] Fatal error (${err.message}). Halting retries permanently.`);
                    socket.io.reconnection(false);
                    socket.disconnect();
                    reject(new Error(err.message));
                } else if (retryCount.current < MAX_RETRIES) {
                    retryCount.current++;
                    console.log(`[Socket Forensic] Retrying (${retryCount.current}/${MAX_RETRIES})…`);
                } else {
                    toast.error('Real-time connection failed. Please refresh.');
                    reject(new Error("Socket connection failed"));
                }
            });
            }).catch(err => reject(err));
        });
    }, [connected, teardown, user?.id]);

    return (
        <SocketContext.Provider value={{ socket: globalSocket, connected, error, teardown, initialize }}>
            {children}
        </SocketContext.Provider>
    );
};
