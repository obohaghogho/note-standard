import React, { useState, useEffect } from 'react';
import { Loader2, Maximize } from 'lucide-react';

interface VideoWithSignedUrlProps {
    path: string;
    fetchUrl: (p: string) => Promise<string | null>;
    onPreview?: (url: string) => void;
    onLoad?: () => void;
    className?: string;
}

const VideoWithSignedUrl: React.FC<VideoWithSignedUrlProps> = ({ path, fetchUrl, onPreview, onLoad, className }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (path.startsWith('blob:') || path.startsWith('data:')) {
            setUrl(path);
            setIsLoading(false);
            return;
        }
        fetchUrl(path).then(u => {
            setUrl(u);
            if (u) setIsLoading(false);
        });
    }, [path, fetchUrl]);

    if (isLoading) {
        return (
            <div className="w-full h-full min-h-[160px] bg-gray-700 animate-pulse flex items-center justify-center rounded-xl">
                <Loader2 className="animate-spin text-gray-500" />
            </div>
        );
    }

    if (!url) {
        return <div className="p-4 text-center text-xs text-gray-500">Video failed to load</div>;
    }

    return (
        <div className={`relative group cursor-pointer w-full h-full overflow-hidden rounded-xl ${className || ''}`} onClick={() => onPreview && onPreview(url)}>
            <video src={url} className="w-full h-full object-cover" onLoadedData={onLoad} />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white border border-white/30">
                    <Maximize size={20} />
                </div>
            </div>
        </div>
    );
};

export default VideoWithSignedUrl;
