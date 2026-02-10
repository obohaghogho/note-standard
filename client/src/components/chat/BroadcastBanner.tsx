import { useState, useEffect, useCallback } from 'react';
import { Megaphone, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import DOMPurify from 'dompurify';
import { API_URL } from '../../lib/api';
import './BroadcastBanner.css';

interface Broadcast {
    id: string;
    title: string;
    content: string;
    expires_at?: string;
}

export const BroadcastBanner = () => {
    const { session } = useAuth();
    const { socket, connected } = useSocket();
    const [activeBroadcast, setActiveBroadcast] = useState<Broadcast | null>(null);
    const [hidden, setHidden] = useState(false);

    const fetchActiveBroadcast = useCallback(async () => {
        if (!session?.access_token) return;
        try {
            const res = await fetch(`${API_URL}/api/broadcasts/active`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data.length > 0) {
                const latest = data[0];
                const isExpired = latest.expires_at ? new Date(latest.expires_at) < new Date() : false;
                if (!isExpired) {
                    setActiveBroadcast(latest);
                }
            }
        } catch (err) {
            console.error('Failed to fetch active broadcast:', err);
        }
    }, [session?.access_token]);

    useEffect(() => {
        if (!socket || !connected) return;

        const onNewBroadcast = (broadcast: Broadcast) => {
            setActiveBroadcast(broadcast);
            setHidden(false);
        };

        socket.on('new_broadcast', onNewBroadcast);
        fetchActiveBroadcast();

        return () => {
            socket.off('new_broadcast', onNewBroadcast);
        };
    }, [socket, connected, fetchActiveBroadcast]);

    if (!activeBroadcast || hidden) return null;

    return (
        <div className="broadcast-banner">
            <div className="banner-content">
                <Megaphone className="meg-icon" size={20} />
                <div className="text-content">
                    <strong>{activeBroadcast.title}:</strong>
                    <div
                        className="html-content"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeBroadcast.content) }}
                    />
                </div>
                <button className="dismiss-btn" onClick={() => setHidden(true)}>
                    <X size={18} />
                </button>
            </div>
        </div>
    );
};
