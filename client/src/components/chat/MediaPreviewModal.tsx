import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Share2, Trash2, Loader2, Minimize } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SecureImage from '../common/SecureImage';
import './MediaPreviewModal.css';

interface MediaPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    fileName?: string;
    isSender?: boolean;
    onDelete?: () => void;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
    isOpen,
    onClose,
    mediaUrl,
    mediaType,
    fileName,
    isSender,
    onDelete
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [zoom, setZoom] = useState(1);
    const [isSharing, setIsSharing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const touchStartRef = useRef<{ x: number, y: number } | null>(null);
    const lastTapRef = useRef<number>(0);

    // Prevent background scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Handle Close on Escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    if (!isOpen) return null;

    const handleDownload = async () => {
        try {
            const response = await fetch(mediaUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName || `media-${Date.now()}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download failed:', error);
        }
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                setIsSharing(true);
                await navigator.share({
                    title: fileName || 'Shared Media',
                    url: mediaUrl
                });
            } catch (error) {
                console.error('Share failed:', error);
            } finally {
                setIsSharing(false);
            }
        } else {
            // Fallback: Copy to clipboard
            navigator.clipboard.writeText(mediaUrl);
            alert('Link copied to clipboard');
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchStartRef.current) return;
        const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
        
        // Swipe down to close
        if (deltaY > 100) {
            onClose();
        }
        touchStartRef.current = null;
    };

    const handleDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
            setZoom(prev => prev === 1 ? 2 : 1);
        }
        lastTapRef.current = now;
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    className="media-preview-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) onClose();
                    }}
                >
                    <motion.div 
                        className="media-preview-container"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                        {/* Header */}
                        <div className="media-preview-header">
                            <div className="media-type-badge">
                                {mediaType === 'image' ? 'Image' : 'Video'}
                            </div>
                            <div className="media-header-actions">
                                <button className="media-header-btn close" onClick={onClose} aria-label="Close">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div 
                            className="media-preview-content"
                            ref={containerRef}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                            onDoubleClick={handleDoubleTap}
                        >
                            {isLoading && (
                                <div className="media-loading-spinner">
                                    <Loader2 className="animate-spin text-white/50" size={40} />
                                </div>
                            )}

                            {mediaType === 'image' ? (
                                <div 
                                    className="media-image-wrapper"
                                    style={{ transform: `scale(${zoom})`, transition: 'transform 0.3s ease' }}
                                >
                                    <SecureImage 
                                        src={mediaUrl} 
                                        alt={fileName || 'Preview'} 
                                        className="media-preview-image"
                                        onLoad={() => setIsLoading(false)}
                                    />
                                </div>
                            ) : (
                                <video 
                                    src={mediaUrl} 
                                    controls 
                                    className="media-preview-video"
                                    autoPlay={false}
                                    onLoadedData={() => setIsLoading(false)}
                                    playsInline
                                />
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="media-preview-footer">
                            <button className="media-footer-btn" onClick={handleDownload} title="Download">
                                <Download size={20} />
                                <span>Save</span>
                            </button>
                            <button className="media-footer-btn" onClick={handleShare} disabled={isSharing} title="Share">
                                <Share2 size={20} />
                                <span>{isSharing ? 'Sharing...' : 'Share'}</span>
                            </button>
                            {isSender && onDelete && (
                                <button className="media-footer-btn delete" onClick={onDelete} title="Delete">
                                    <Trash2 size={20} />
                                    <span>Delete</span>
                                </button>
                            )}
                        </div>

                        {/* Zoom indicators for mobile */}
                        {zoom > 1 && (
                            <button className="zoom-reset-btn" onClick={() => setZoom(1)}>
                                <Minimize size={16} /> Reset Zoom
                            </button>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
