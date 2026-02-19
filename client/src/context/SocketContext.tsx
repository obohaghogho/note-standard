import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_URL } from '../lib/api';
import toast from 'react-hot-toast';

interface SocketContextValue {
    socket: Socket | null;
    connected: boolean;
    error: string | null;
}

const SocketContext = createContext<SocketContextValue>({
    socket: null,
    connected: false,
    error: null
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session, authReady, user } = useAuth();
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const retryCount = useRef(0);
    const MAX_RETRIES = 5;

    useEffect(() => {
        // Only connect if auth is ready and we have a session
        if (!authReady || !session?.access_token || !user) {
            if (socketRef.current) {
                console.log('[Socket] Disconnecting due to session loss');
                socketRef.current.disconnect();
                socketRef.current = null;
                setConnected(false);
            }
            return;
        }

        // Enabled for Render (Supports WebSockets)

        console.log('[Socket] Initializing centralized connection...');
        
        const socket = io(API_URL, {
            auth: { token: session.access_token },
            withCredentials: true,
            reconnection: true,
            reconnectionAttempts: MAX_RETRIES,
            reconnectionDelay: 2000,
            timeout: 20000,
            transports: ['polling', 'websocket']
        });

        socket.on('connect', () => {
            const transport = socket.io.engine.transport.name;
            console.log(`[Socket] Connected to server via ${transport}`);
            setConnected(true);
            setError(null);
            retryCount.current = 0;
            
            socket.io.engine.on('upgrade', (upTrans) => {
                console.log(`[Socket] Transport upgraded to ${upTrans.name}`);
            });
        });

        socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
            setConnected(false);
            if (reason === 'io server disconnect') {
                // The server has forcefully disconnected the socket, need to reconnect manually
                socket.connect();
            }
        });

        socket.on('connect_error', (err) => {
            console.error('[Socket] Connection error:', err.message);
            setError(err.message);
            setConnected(false);
            
            if (retryCount.current < MAX_RETRIES) {
                retryCount.current++;
            } else {
                console.error('[Socket] Max retries reached');
                toast.error('Real-time connection failed. Please refresh.');
            }
        });

        socketRef.current = socket;

        return () => {
            console.log('[Socket] Cleaning up connection...');
            socket.disconnect();
            socketRef.current = null;
            setConnected(false);
        };
    }, [authReady, session?.access_token, user?.id, socketRef]);

    return (
        <SocketContext.Provider value={{ socket: socketRef.current, connected, error }}>
            {children}
        </SocketContext.Provider>
    );
};
