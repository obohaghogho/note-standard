import React, { useState, useEffect } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';

interface SecureImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    fallback?: React.ReactNode;
    containerClassName?: string;
    showLoader?: boolean;
}

/**
 * SecureImage handles cross-origin image loading more robustly.
 * It prevents CORB warnings by handling load errors and providing
 * consistent attribute management for cross-origin assets.
 */
export const SecureImage: React.FC<SecureImageProps> = ({
    src,
    alt,
    className,
    containerClassName = '',
    fallback,
    showLoader = true,
    crossOrigin,
    ...props
}) => {
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error');
    const [currentSrc, setCurrentSrc] = useState<string | undefined>(src);

    useEffect(() => {
        if (!src) {
            setStatus('error');
            return;
        }
        setStatus('loading');
        setCurrentSrc(src);
    }, [src]);

    const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        setStatus('loaded');
        if (props.onLoad) props.onLoad(e);
    };

    const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        console.warn(`[SecureImage] Failed to load: ${src}`);
        setStatus('error');
        if (props.onError) props.onError(e);
    };

    // Determine if we should use anonymous crossOrigin
    // Usually helpful for images from CDNs or external APIs to avoid CORB
    const derivedCrossOrigin = crossOrigin || (src?.startsWith('http') && !src.includes(window.location.host) ? 'anonymous' : undefined);

    return (
        <div className={`relative overflow-hidden ${containerClassName}`}>
            {status === 'loading' && showLoader && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/5 animate-pulse">
                    <Loader2 className="w-5 h-5 text-primary/50 animate-spin" />
                </div>
            )}

            {status === 'error' ? (
                fallback || (
                    <div className={`flex items-center justify-center bg-gray-800/50 text-gray-500 ${className}`}>
                        <ImageIcon size={20} />
                    </div>
                )
            ) : (
                <img
                    {...props}
                    src={currentSrc}
                    alt={alt}
                    crossOrigin={derivedCrossOrigin}
                    onLoad={handleLoad}
                    onError={handleError}
                    className={`${className} ${status === 'loading' ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
                />
            )}
        </div>
    );
};
