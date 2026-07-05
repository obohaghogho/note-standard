import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, Send, Loader2, Camera, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import './WhatsAppMediaPicker.css';

interface WhatsAppMediaPickerProps {
    onUploadComplete: (file: File, type: 'image' | 'video' | 'file', caption?: string) => void;
    onCancel: () => void;
    initialMode: 'menu' | 'preview';
}

export const WhatsAppMediaPicker: React.FC<WhatsAppMediaPickerProps> = ({ 
    onUploadComplete, 
    onCancel,
    initialMode
}) => {
    const [mode, setMode] = useState<'menu' | 'preview'>(initialMode);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [caption, setCaption] = useState('');
    const [isSending, setIsSending] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    // Initial Trigger for file selection if opened directly in preview mode (fallback)
    useEffect(() => {
        if (mode === 'preview' && !file && fileInputRef.current) {
            fileInputRef.current.click();
        }
    }, [mode, file]);

    // Cleanup preview URL
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    // Prevent background scroll when overlay is active
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    const ACCEPTED_DOC_TYPES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
        'application/zip',
        'application/x-zip-compressed',
    ];

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        // Reset input value so the same file can be re-selected
        e.target.value = '';
        if (!selectedFile) {
            if (!file) onCancel();
            return;
        }

        const isImage = selectedFile.type.startsWith('image/');
        const isVideo = selectedFile.type.startsWith('video/');
        const isDocument = !isImage && !isVideo;

        // Validate document MIME types against what Supabase Storage accepts.
        // Reject executables and unsupported formats (e.g. JSON, JS, etc.)
        if (isDocument && !ACCEPTED_DOC_TYPES.includes(selectedFile.type)) {
            toast.error(`File type "${selectedFile.type || 'unknown'}" is not supported. Please upload a PDF, Word, Excel, or text file.`);
            return;
        }

        if (selectedFile.size > 50 * 1024 * 1024) {
            toast.error('File size too large (max 50MB)');
            return;
        }

        setFile(selectedFile);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(selectedFile));
        setMode('preview');
    };

    const handleSend = () => {
        if (!file) return;
        setIsSending(true);
        const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
        onUploadComplete(file, type, caption.trim());
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    if (mode === 'menu') {
        return (
            <>
                <div className="fixed inset-0 z-40" onClick={onCancel} />
                <div className="wa-attach-menu">
                    <button 
                        className="wa-attach-item"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <div className="wa-attach-icon photos">
                            <ImageIcon size={20} />
                        </div>
                        <div className="wa-attach-label">
                            <span>Photos & Videos</span>
                            <span>Share media from your gallery</span>
                        </div>
                    </button>
                    
                    <button 
                        className="wa-attach-item"
                        onClick={() => docInputRef.current?.click()}
                    >
                        <div className="wa-attach-icon document">
                            <FileText size={20} />
                        </div>
                        <div className="wa-attach-label">
                            <span>Document</span>
                            <span>Share files and PDFs</span>
                        </div>
                    </button>
                    
                    <input
                        id="wa-media-upload-input"
                        name="mediaFile"
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*,video/*"
                        className="hidden"
                    />
                    <input
                        id="wa-doc-upload-input"
                        name="docFile"
                        type="file"
                        ref={docInputRef}
                        onChange={handleFileSelect}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                        className="hidden"
                    />
                </div>
            </>
        );
    }

    return createPortal(
        <div className="wa-media-overlay" onClick={(e) => { if (e.target === e.currentTarget && !isSending) onCancel(); }}>
            <div className="wa-preview-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="wa-sheet-handle" />
                
                <div className="wa-sheet-header">
                    <div className="wa-sheet-title">
                        {file?.type.startsWith('image/') ? <ImageIcon size={18} /> : file?.type.startsWith('video/') ? <Camera size={18} /> : <FileText size={18} />}
                        {file?.type.startsWith('image/') || file?.type.startsWith('video/') ? 'Send Media' : 'Send Document'}
                    </div>
                    <button className="wa-sheet-close" onClick={onCancel} disabled={isSending}>
                        <X size={20} />
                    </button>
                </div>

                <div className="wa-sheet-preview">
                    {previewUrl && (
                        <>
                            {file?.type.startsWith('image/') ? (
                                <img src={previewUrl} alt="Preview" className="wa-sheet-img" />
                            ) : file?.type.startsWith('video/') ? (
                                <video src={previewUrl} controls className="wa-sheet-video" />
                            ) : (
                                <div className="flex flex-col items-center justify-center p-12 text-gray-400 w-full h-[40dvh]">
                                    <FileText size={64} className="mb-4 opacity-50" />
                                    <div className="text-center font-medium text-white break-all max-w-[80%]">{file?.name}</div>
                                </div>
                            )}
                            
                            <div className="wa-file-badge">
                                {file?.type.startsWith('image/') || file?.type.startsWith('video/') ? file?.name : formatFileSize(file?.size || 0)} • {formatFileSize(file?.size || 0)}
                            </div>

                            <button 
                                className="wa-change-btn"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isSending}
                            >
                                <ImageIcon size={14} /> Change
                            </button>
                        </>
                    )}

                    {isSending && (
                        <div className="wa-upload-overlay">
                            <Loader2 className="animate-spin text-white mb-2" size={32} />
                            <div className="wa-upload-label">Sending media...</div>
                            <div className="wa-progress-bar">
                                <div className="wa-progress-fill" style={{ width: '100%' }} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="wa-sheet-footer">
                    <textarea 
                        className="wa-caption-input"
                        placeholder="Add a caption..."
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        disabled={isSending}
                        rows={1}
                        onInput={(e) => {
                            const el = e.currentTarget;
                            el.style.height = 'auto';
                            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />
                    <button 
                        className="wa-send-btn"
                        onClick={handleSend}
                        disabled={isSending || !file}
                    >
                        <Send size={20} className="translate-x-[2px] -translate-y-[1px]" />
                    </button>
                </div>

                <input
                    id="wa-media-reselect-input"
                    name="mediaFile"
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,video/*"
                    className="hidden"
                />
            </div>
        </div>,
        document.body
    );
};
