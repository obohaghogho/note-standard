import React, { useState, useEffect, useRef } from "react";
import { Paperclip, Trash2, Download, Plus, Loader2, FileText, FileImage, FileVideo, Music } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API_URL = import.meta.env.VITE_API_URL || '';

export interface NoteFile {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_key: string;
  created_at: string;
}

interface AttachmentsListProps {
  noteId: string;
}

export const AttachmentsList: React.FC<AttachmentsListProps> = ({ noteId }) => {
  const [files, setFiles] = useState<NoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.get(
        `${API_URL}/api/notes/${noteId}/files`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setFiles(data);
    } catch (err) {
      console.error("[Attachments] Fetch failed:", err);
      toast.error("Failed to load attachments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
  }, [noteId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    // 50MB size limit check
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
      setFiles((prev) => [data, ...prev]);
      toast.success("Attachment uploaded successfully!");
    } catch (err: any) {
      console.error("[Attachments] Upload failed:", err);
      toast.error(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.get(
        `${API_URL}/api/notes/${noteId}/files/${fileId}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data.url) {
        // Trigger browser download by creating an anchor element
        const a = document.createElement("a");
        a.href = data.url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error("[Attachments] Download failed:", err);
      toast.error("Failed to download file");
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!window.confirm("Are you sure you want to delete this attachment?")) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API_URL}/api/notes/${noteId}/files/${fileId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("Attachment deleted");
    } catch (err) {
      console.error("[Attachments] Delete failed:", err);
      toast.error("Failed to delete attachment");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (mime: string) => {
    if (mime.startsWith("image/")) return <FileImage className="w-4 h-4 text-emerald-400" />;
    if (mime.startsWith("video/")) return <FileVideo className="w-4 h-4 text-indigo-400" />;
    if (mime.startsWith("audio/")) return <Music className="w-4 h-4 text-pink-400" />;
    return <FileText className="w-4 h-4 text-blue-400" />;
  };

  return (
    <div className="space-y-4">
      {/* Upload button header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
          <Paperclip className="w-4 h-4" />
          Attachments List
        </span>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs text-emerald-300 font-bold cursor-pointer disabled:opacity-50 transition-all duration-200"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          Upload File
        </button>
        <input
          id={`attach-file-${noteId}`}
          name="attachment"
          type="file"
          ref={fileInputRef}
          onChange={handleUpload}
          className="hidden"
          accept="image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        />
      </div>

      {/* Files List */}
      {loading ? (
        <div className="text-center py-6 text-neutral-500 text-xs">Loading attachments...</div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-white/10 rounded-2xl bg-neutral-950/20">
          <p className="text-neutral-500 text-xs font-semibold">No attachments uploaded yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-1 scrollbar-thin">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-neutral-950/20 hover:bg-neutral-950/40 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {getFileIcon(file.mime_type)}
                <div className="text-left min-w-0">
                  <p className="text-sm font-semibold text-white truncate max-w-[180px] sm:max-w-[240px]">
                    {file.file_name}
                  </p>
                  <p className="text-[10px] text-neutral-500 font-bold mt-0.5">
                    {formatSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleDownload(file.id, file.file_name)}
                  className="p-1.5 rounded hover:bg-white/5 text-neutral-400 hover:text-white cursor-pointer"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(file.id)}
                  className="p-1.5 rounded hover:bg-red-500/10 text-red-400 hover:text-red-300 cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
