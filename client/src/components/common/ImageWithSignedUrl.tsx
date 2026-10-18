import React, { useState, useEffect } from 'react';
import SecureImage from './SecureImage';

interface ImageWithSignedUrlProps {
    path: string;
    fetchUrl: (p: string) => Promise<string | null>;
    onPreview?: (url: string) => void;
    onLoad?: () => void;
    className?: string;
    style?: React.CSSProperties;
}

const ImageWithSignedUrl: React.FC<ImageWithSignedUrlProps> = ({ path, fetchUrl, onPreview, onLoad, className, style }) => {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (path.startsWith('blob:') || path.startsWith('data:')) {
            setUrl(path);
            return;
        }
        fetchUrl(path).then(setUrl);
    }, [path, fetchUrl]);

    return (
        <SecureImage
            src={url || undefined}
            alt="Attached"
            onLoad={onLoad}
            style={style}
            className={className || "w-full h-full object-cover cursor-pointer hover:opacity-95 transition-opacity"}
            onClick={() => {
                if (url) {
                    if (onPreview) onPreview(url);
                    else window.open(url, '_blank');
                }
            }}
        />
    );
};

export default ImageWithSignedUrl;
