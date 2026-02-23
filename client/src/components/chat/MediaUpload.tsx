import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { X, Image as ImageIcon, Send, Loader2, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import SecureImage from '../common/SecureImage';
import './MediaUpload.css';

interface MediaUploadProps {
    conversationId: string;
    onUploadComplete: (attachmentId: string, type: string, content: string) => void;
    onCancel: () => void;
}

export const MediaUpload: React.FC<MediaUploadProps> = ({ conversationId, onUploadComplete, onCancel }) => {
    const { session } = useAuth();
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const touchStartRef = useRef<{ x: number, y: number } | null>(null);

    // Initial Trigger for file selection if nothing is selected
    useEffect(() => {
        if (!file && fileInputRef.current) {
            // timeout to allow animation to start
            setTimeout(() => {
                // fileInputRef.current?.click();
            }, 300);
        }
    }, [file]);

    // Cleanup preview URL
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    // Prevent background scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        const isImage = selectedFile.type.startsWith('image/');
        const isVideo = selectedFile.type.startsWith('video/');

        if (!isImage && !isVideo) {
            toast.error('Please select an image or video file');
            return;
        }

        if (selectedFile.size > 50 * 1024 * 1024) {
            toast.error('File size too large (max 50MB)');
            return;
        }

        setFile(selectedFile);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(selectedFile));
    };

    const handleUpload = async () => {
        if (!file || !session) return;

        setUploading(true);
        setUploadProgress(10);
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${conversationId}/${fileName}`;

        try {
            setUploadProgress(30);
            const { error: uploadError, data } = await supabase.storage
                .from('chat-media')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) throw uploadError;
            setUploadProgress(70);

            const type = file.type.startsWith('image/') ? 'image' : 'video';
            
            const res = await fetch(`${API_URL}/api/media/attachments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    conversationId,
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size,
                    storagePath: data.path,
                    metadata: {}
                })
            });

            if (!res.ok) throw new Error('Failed to create attachment record');

            const attachment = await res.json();
            setUploadProgress(100);
            
            onUploadComplete(attachment.id, type, attachment.file_name);
            toast.success('Media sent');
        } catch (err: any) {
            console.error('Upload failed:', err);
            toast.error(err.message || 'Upload failed');
        } finally {
            setUploading(false);
            setUploadProgress(0);
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
        if (deltaY > 100 && !uploading) {
            onCancel();
        }
        touchStartRef.current = null;
    };

    return (
        <div 
            className="media-upload-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget && !uploading) onCancel();
            }}
        >
            <motion.div 
                className="media-upload-container"
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                {/* Header */}
                <div className="media-upload-header">
                    <div className="header-left">
                        <span className="media-upload-title">
                            {file ? 'Preview Media' : 'Send Media'}
                        </span>
                    </div>
                    <button 
                        onClick={onCancel} 
                        className="media-close-btn"
                        disabled={uploading}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Preview Area */}
                <div className="media-upload-preview">
                    {previewUrl ? (
                        <div className="preview-media-wrapper">
                            {file?.type.startsWith('image/') ? (
                                <SecureImage src={previewUrl} alt="Preview" className="media-preview-img" />
                            ) : (
                                <video src={previewUrl} controls className="media-preview-vid" />
                            )}
                        </div>
                    ) : (
                        <div 
                            className="upload-dropzone"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="dropzone-content">
                                <div className="dropzone-icon">
                                    <Upload size={32} />
                                </div>
                                <p className="dropzone-text">Tap to select image or video</p>
                                <span className="dropzone-sub">Max size: 50MB</span>
                            </div>
                        </div>
                    )}
                    
                    {uploading && (
                        <div className="upload-progress-overlay">
                            <div className="progress-content">
                                <Loader2 className="animate-spin text-blue-500 mb-4" size={40} />
                                <span className="progress-text">Uploading {uploadProgress}%</span>
                                <div className="progress-bar-container">
                                    <motion.div 
                                        className="progress-bar-fill"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="media-upload-footer">
                    <input
                        id="media-upload-input"
                        name="mediaFile"
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*,video/*"
                        className="hidden"
                    />

                    {file ? (
                        <div className="footer-actions">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="action-btn secondary"
                            >
                                <ImageIcon size={18} />
                                <span>Change</span>
                            </button>
                            <div className="flex-1" />
                            <button
                                onClick={handleUpload}
                                disabled={!file || uploading}
                                className="action-btn primary"
                            >
                                {uploading ? 'Sending...' : 'Send Media'}
                                {!uploading && <Send size={18} />}
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="action-btn primary full"
                        >
                            <Upload size={18} />
                            <span>Select Media</span>
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
