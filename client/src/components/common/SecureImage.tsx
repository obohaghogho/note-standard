import React, { useState, useEffect, type ImgHTMLAttributes } from 'react';
import { getFallbackImage, isValidImageSrc } from '../../utils/imageUtils';
import { ImageOff, Loader2 } from 'lucide-react'; // Assuming lucide-react is available given previous files used it

interface SecureImageProps extends ImgHTMLAttributes<HTMLImageElement> {
    fallbackSrc?: string;
    fallbackType?: 'profile' | 'banner' | 'card' | 'hero' | 'default';
    showSkeleton?: boolean;
}

const SecureImage: React.FC<SecureImageProps> = ({ 
    src, 
    alt, 
    fallbackSrc, 
    fallbackType = 'default', 
    className, 
    showSkeleton = true,
    onError,
    ...props 
}) => {
    const [imgSrc, setImgSrc] = useState<string | undefined>(undefined);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [hasError, setHasError] = useState<boolean>(false);

    // Reset state when src changes
    useEffect(() => {
        let effectiveSrc = src;
        
        // Auto-fix for known broken seed images
        const brokenUrls: Record<string, string> = {
            'https://images.unsplash.com/photo-1523437113738-bbd3ee09abb1?auto=format&fit=crop&q=80&w=800': 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&q=80&w=800',
            'https://images.unsplash.com/photo-14997503101fd-c7ca260b0f21?auto=format&fit=crop&q=80&w=800': 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=800'
        };

        if (src && brokenUrls[src]) {
            effectiveSrc = brokenUrls[src];
        }

        if (isValidImageSrc(effectiveSrc)) {
            setImgSrc(effectiveSrc);
            setIsLoading(true);
            setHasError(false);
        } else {
             // Invalid src immediately goes to fallback
            setImgSrc(fallbackSrc || getFallbackImage(fallbackType));
            setIsLoading(false);
            setHasError(true);
        }
    }, [src, fallbackSrc, fallbackType]);

    const handleLoad = () => {
        setIsLoading(false);
    };

    const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        // Prevent infinite loops
        if (hasError) return;

        console.warn(`[SecureImage] Failed to load image: ${src}`);
        setHasError(true);
        setIsLoading(false);
        setImgSrc(fallbackSrc || getFallbackImage(fallbackType));
        
        if (onError) onError(e);
    };

    return (
        <div className={`relative overflow-hidden ${className || ''} ${isLoading && showSkeleton ? 'bg-gray-200 dark:bg-gray-800 animate-pulse' : ''}`}>
            {isLoading && showSkeleton && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                </div>
            )}
            
            <img
                src={imgSrc}
                alt={alt}
                className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                onLoad={handleLoad}
                onError={handleError}
                {...props}
            />
            
            {hasError && !isLoading && !imgSrc && (
                 <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400">
                    <ImageOff className="w-1/3 h-1/3 opacity-20" />
                 </div>
            )}
        </div>
    );
};

export default SecureImage;
