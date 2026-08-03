import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

export const OfflineBanner: React.FC = () => {
    const { connected } = useSocket();
    const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const isOffline = !isOnline || !connected;

    if (!isOffline) return null;

    return (
        <div 
            className="w-full bg-amber-500/15 border-b border-amber-500/30 px-3 py-2 text-amber-300 text-xs sm:text-sm font-medium flex items-center justify-between gap-2 backdrop-blur-md sticky top-0 z-50 animate-pulse"
            aria-live="polite"
        >
            <div className="flex items-center gap-2">
                <WifiOff size={16} className="text-amber-400 shrink-0" />
                <span>
                    {!isOnline 
                        ? 'Internet connection lost. Retrying...' 
                        : 'Realtime updates disconnected. Attempting reconnect...'}
                </span>
            </div>
            <button 
                onClick={() => window.location.reload()} 
                className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs flex items-center gap-1 transition-colors min-h-[36px]"
            >
                <RefreshCw size={12} />
                <span>Reload</span>
            </button>
        </div>
    );
};

export default OfflineBanner;
