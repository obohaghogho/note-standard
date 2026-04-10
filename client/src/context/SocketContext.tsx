import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

// ─── Config ──────────────────────────────────────────────────────
// Vite loads the correct URL from .env.development or .env.production
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

if (!SOCKET_URL && import.meta.env.PROD) {
    console.error('❌ CRITICAL: VITE_SOCKET_URL is not defined in production environment!');
}


// ─── Types ───────────────────────────────────────────────────────
interface SocketContextValue {
    socket: Socket | null;
    connected: boolean;
    error: string | null;
}

const SocketContext = createContext<SocketContextValue>({
    socket: null,
    connected: false,
    error: null,
});

export const useSocket = () => useContext(SocketContext);

// ─── Provider ────────────────────────────────────────────────────
export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session, authReady, user } = useAuth();
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const retryCount = useRef(0);
    const MAX_RETRIES = 10;

    useEffect(() => {
        // ── Gate: wait until auth is fully ready ──────────────
        const token = session?.access_token;
        const isValidToken = token && typeof token === 'string' && token.length > 20;

        if (!authReady || !isValidToken || !user) {
            // Tear down existing socket if session is lost
            if (socketRef.current) {
                console.log('[Socket] Auth lost or token invalid — disconnecting');
                socketRef.current.disconnect();
                socketRef.current = null;
                setConnected(false);
            }
            return;
        }

        // ── Guard: prevent double creation ───────────────────
        if (socketRef.current) return;

        console.log('[Socket] Connecting to', SOCKET_URL);

        const socket = io(SOCKET_URL, {
            auth: { token: session.access_token },
            withCredentials: true,
            // IMPORTANT: start with polling, then upgrade.
            // This avoids "WebSocket closed before established" errors.
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: MAX_RETRIES,
            reconnectionDelay: 2000,
            timeout: 20000,
        });

        socket.on('connect', () => {
            const transport = socket.io.engine.transport.name;
            console.log(`[Socket] ✓ Connected via ${transport}`);
            setConnected(true);
            setError(null);
            retryCount.current = 0;

            // Log the upgrade when it happens
            socket.io.engine.on('upgrade', (t: { name: string }) => {
                console.log(`[Socket] ↑ Upgraded to ${t.name}`);
            });
        });

        socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
            setConnected(false);
            // If the server kicked us, reconnect manually
            if (reason === 'io server disconnect') {
                socket.connect();
            }
        });

        socket.on('connect_error', (err) => {
            console.error('[Socket] Connection error:', err.message);
            setError(err.message);
            setConnected(false);

            if (retryCount.current < MAX_RETRIES) {
                retryCount.current++;
                console.log(`[Socket] Retrying (${retryCount.current}/${MAX_RETRIES})…`);
            } else {
                toast.error('Real-time connection failed. Please refresh.');
            }
        });

        // ── Global Real-time Notifications ───────────────────
        socket.on('notification', (data: any) => {
            console.log('[Socket] Global notification received:', data);
            if (data?.title) {
                toast.success(`${data.title}: ${data.message || ''}`, {
                    duration: 5000,
                    icon: '🔔',
                    style: {
                        background: '#1a1a1a',
                        color: '#fff',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }
                });
            }
        });

        socketRef.current = socket;

        // ── Cleanup on unmount or dependency change ──────────
        return () => {
            console.log('[Socket] Cleaning up…');
            socket.disconnect();
            socketRef.current = null;
            setConnected(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authReady, session?.access_token, user?.id]);

    return (
        <SocketContext.Provider value={{ socket: socketRef.current, connected, error }}>
            {children}
        </SocketContext.Provider>
    );
};
