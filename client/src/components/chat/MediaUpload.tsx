import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { X, Image as ImageIcon, Film, Send, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

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
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        // Validation
        const isImage = selectedFile.type.startsWith('image/');
        const isVideo = selectedFile.type.startsWith('video/');

        if (!isImage && !isVideo) {
            toast.error('Please select an image or video file');
            return;
        }

        if (selectedFile.size > 50 * 1024 * 1024) { // 50MB limit
            toast.error('File size too large (max 50MB)');
            return;
        }

        setFile(selectedFile);
        setPreviewUrl(URL.createObjectURL(selectedFile));
    };

    const handleUpload = async () => {
        if (!file || !session) return;

        setUploading(true);
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${conversationId}/${fileName}`;

        try {
            // 1. Upload to Supabase Storage
            const { error: uploadError, data } = await supabase.storage
                .from('chat-media')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) throw uploadError;

            // 2. Create attachment record in our DB via Backend
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
                    metadata: {} // Could add image dimensions or video duration here
                })
            });

            if (!res.ok) throw new Error('Failed to create attachment record');

            const attachment = await res.json();
            
            // 3. Callback to parent to send the actual chat message
            onUploadComplete(attachment.id, type, attachment.file_name);
            
            toast.success('File uploaded successfully');
        } catch (err: any) {
            console.error('Upload failed:', err);
            toast.error(err.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-medium flex items-center gap-2">
                    {file?.type.startsWith('image/') ? <ImageIcon size={20} /> : <Film size={20} />}
                    Preview attachment
                </h3>
                <button onClick={onCancel} className="text-gray-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="relative aspect-video bg-black/50 rounded-lg overflow-hidden border border-gray-700 mb-4 flex items-center justify-center">
                {previewUrl ? (
                    file?.type.startsWith('image/') ? (
                        <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain" />
                    ) : (
                        <video src={previewUrl} controls className="max-w-full max-h-full" />
                    )
                ) : (
                    <div className="text-gray-500 flex flex-col items-center">
                        <ImageIcon size={48} className="mb-2 opacity-20" />
                        <p>No file selected</p>
                    </div>
                )}
                
                {uploading && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-4">
                        <Loader2 className="animate-spin mb-3 text-blue-500" size={32} />
                        <p className="text-sm font-medium">Uploading your media...</p>
                        <div className="w-full max-w-[200px] h-1.5 bg-gray-700 rounded-full mt-4 overflow-hidden">
                            <div className="h-full bg-blue-500 animate-[shimmer_2s_infinite]" style={{ width: '100%' }}></div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-3">
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,video/*"
                    className="hidden"
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors disabled:opacity-50"
                >
                    Change file
                </button>

                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        disabled={uploading}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50"
                    >
                        {uploading ? 'Uploading...' : 'Send Media'}
                        {!uploading && <Send size={18} />}
                    </button>
                </div>
            </div>
        </div>
    );
};
