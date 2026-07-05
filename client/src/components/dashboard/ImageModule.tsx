import React, { useRef, useState, useEffect } from 'react';
import { UploadCloud, Loader2, Image as ImageIcon, Trash2, Download } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '';

interface ImageModuleProps {
  noteId: string;
}

export const ImageModule: React.FC<ImageModuleProps> = ({ noteId }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchImages();
  }, [noteId]);

  const fetchImages = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.get(`${API_URL}/api/notes/${noteId}/files`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const imgFiles = data.filter((f: any) => f.mime_type.startsWith('image/'));
      setImages(imgFiles);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File exceeds 50MB size limit.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.post(
        `${API_URL}/api/notes/${noteId}/files`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data"
          }
        }
      );
      setImages((prev) => [data, ...prev]);
      toast.success("Image uploaded!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!window.confirm("Are you sure you want to delete this image?")) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API_URL}/api/notes/${noteId}/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImages((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("Image deleted");
    } catch (err) {
      toast.error("Failed to delete image");
    }
  };

  return (
    <div className="space-y-6">
      <div 
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${uploading ? 'bg-neutral-900/60 pointer-events-none' : 'hover:bg-white/5 bg-neutral-900/40'}`}
      >
        <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4 text-blue-400">
          {uploading ? <Loader2 className="w-8 h-8 animate-spin" /> : <UploadCloud className="w-8 h-8" />}
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Upload an Image</h3>
        <p className="text-sm text-neutral-400">
          {uploading ? 'Uploading your image...' : 'Click or tap to browse your files. Supports JPG, PNG, GIF, WEBP up to 50MB.'}
        </p>
        <input 
          ref={fileInputRef}
          type="file" 
          accept="image/*" 
          className="hidden" 
          onChange={handleFileChange}
        />
      </div>

      {loading ? (
        <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-neutral-500" /></div>
      ) : images.length > 0 ? (
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Image Gallery</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {images.map((img) => (
              <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden bg-black/50 border border-white/5">
                <img 
                  src={`${API_URL}/api/notes/${noteId}/files/${img.id}/download`} 
                  alt={img.file_name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  crossOrigin="use-credentials"
                />
                
                {/* Overlay actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                  <div className="flex justify-end">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                      className="p-1.5 bg-red-500/80 hover:bg-red-500 rounded-lg text-white backdrop-blur-sm transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white font-medium truncate pr-2 max-w-[80%] drop-shadow-md">
                      {img.file_name}
                    </p>
                    <a 
                      href={`${API_URL}/api/notes/${noteId}/files/${img.id}/download`}
                      download={img.file_name}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white backdrop-blur-sm transition-colors"
                      title="Download"
                    >
                      <Download size={16} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
