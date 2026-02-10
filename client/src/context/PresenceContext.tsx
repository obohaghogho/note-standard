import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';

interface PresenceState {
    isOnline: boolean;
    lastSeen: string | null;
}

interface PresenceContextValue {
    presenceMap: Record<string, PresenceState>;
    isUserOnline: (userId: string) => boolean;
    getUserLastSeen: (userId: string) => string | null;
}

const PresenceContext = createContext<PresenceContextValue>({
    presenceMap: {},
    isUserOnline: () => false,
    getUserLastSeen: () => null
});

// Use named function for provider to help Fast Refresh
export function PresenceProvider({ children }: { children: React.ReactNode }) {
    const { socket, connected } = useSocket();
    const { user } = useAuth();
    const [presenceMap, setPresenceMap] = useState<Record<string, PresenceState>>({});
    const heartbeatTimer = useRef<any>(null);

    // Initial load and heartbeat
    useEffect(() => {
        if (!connected || !socket || !user) {
            if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
            return;
        }

        console.log('[Presence] Initializing presence tracking...');

        // Start heartbeat every 30 seconds
        heartbeatTimer.current = setInterval(() => {
            socket.emit('presence:heartbeat');
        }, 30000);

        // Immediate heartbeat on connect
        socket.emit('presence:heartbeat');

        // Clean up on unmount or logout
        const handleBeforeUnload = () => {
            socket.emit('presence:offline');
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [connected, socket, user]);

    // Listen for presence updates from server
    useEffect(() => {
        if (!socket) return;

        const handleInitialPresence = (onlineIds: string[]) => {
            const initialMap: Record<string, PresenceState> = {};
            onlineIds.forEach(id => {
                initialMap[id] = { isOnline: true, lastSeen: null };
            });
            setPresenceMap(prev => ({ ...prev, ...initialMap }));
        };

        const handleUserOnline = ({ userId, online, lastSeen }: { userId: string, online: boolean, lastSeen?: string }) => {
            setPresenceMap(prev => ({
                ...prev,
                [userId]: {
                    isOnline: online,
                    lastSeen: lastSeen || prev[userId]?.lastSeen || null
                }
            }));
        };

        socket.on('presence:initial', handleInitialPresence);
        socket.on('user_online', handleUserOnline);

        return () => {
            socket.off('presence:initial', handleInitialPresence);
            socket.off('user_online', handleUserOnline);
        };
    }, [socket]);

    const isUserOnline = (userId: string) => {
        return presenceMap[userId]?.isOnline || false;
    };

    const getUserLastSeen = (userId: string) => {
        return presenceMap[userId]?.lastSeen || null;
    };

    return (
        <PresenceContext.Provider value={{ presenceMap, isUserOnline, getUserLastSeen }}>
            {children}
        </PresenceContext.Provider>
    );
}

export function usePresence() {
    return useContext(PresenceContext);
}
