import React, { useState, useRef } from 'react';
import { X, Upload, Video, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { API_URL } from '../../lib/api';

interface ReelUploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const ReelUploadModal: React.FC<ReelUploadModalProps> = ({ onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('video/')) {
      setError('Please select a valid video file (MP4, WebM, MOV).');
      return;
    }

    const sizeMB = (selectedFile.size / (1024 * 1024)).toFixed(1);
    if (selectedFile.size > 1024 * 1024 * 1024) {
      setError(`Video file size (${sizeMB}MB) exceeds 1GB limit. Please select a video file under 1GB.`);
      return;
    }

    setError(null);
    setFile(selectedFile);

    const url = URL.createObjectURL(selectedFile);
    setVideoPreview(url);

    // Calculate video duration
    const tempVideo = document.createElement('video');
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      const dur = Math.round(tempVideo.duration);
      setVideoDuration(dur);
    };
  };

  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadedBytesMB, setUploadedBytesMB] = useState<string>('0');
  const [totalBytesMB, setTotalBytesMB] = useState<string>('0');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a video file to post a Reel.');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);
    setUploadedBytesMB('0');
    setTotalBytesMB((file.size / (1024 * 1024)).toFixed(1));

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'video');

      // Execute upload with live progress listener via XHR
      const uploadData: any = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/api/upload/media`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
            setUploadedBytesMB((event.loaded / (1024 * 1024)).toFixed(1));
            setTotalBytesMB((event.total / (1024 * 1024)).toFixed(1));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              resolve({});
            }
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || `Upload failed (${xhr.status})`));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during video upload. Please check connection.'));
        xhr.ontimeout = () => reject(new Error('Video upload timed out. Please try again.'));
        xhr.timeout = 600000; // 10 minute timeout

        xhr.send(formData);
      });

      const videoUrl = uploadData.secure_url || uploadData.url || uploadData.media_url;
      if (!videoUrl) {
        throw new Error('Video upload succeeded but no video URL was returned by server.');
      }

      // Post Reel
      const parsedTags = tags
        .split(',')
        .map(t => t.trim().replace(/^#/, ''))
        .filter(Boolean);

      const reelRes = await fetch(`${API_URL}/api/community/reels`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          videoUrl,
          duration: Math.min(videoDuration || 90, 90),
          aspectRatio: '9:16',
          tags: parsedTags,
        }),
      });

      if (!reelRes.ok) {
        const errData = await reelRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to publish Reel.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error publishing Reel.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-white text-base">
            <Sparkles className="text-yellow-400" size={18} />
            <span>Create NoteStandard Reel</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Video Selector / Preview */}
          <div className="relative rounded-xl border-2 border-dashed border-white/20 hover:border-primary/50 transition-colors overflow-hidden bg-black/40 flex flex-col items-center justify-center min-h-[220px]">
            {videoPreview ? (
              <div className="relative w-full h-64 bg-black flex items-center justify-center">
                <video src={videoPreview} controls className="max-h-full max-w-full object-contain" />
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setVideoPreview(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-black"
                >
                  <X size={16} />
                </button>
                {videoDuration > 0 && (
                  <div className="absolute bottom-2 left-2 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 flex items-center gap-1.5 shadow-lg">
                    {videoDuration > 90 ? (
                      <>
                        <span className="text-blue-400 font-bold">⚡ Auto-trimmed to first 90s</span>
                        <span className="text-gray-400">({Math.floor(videoDuration / 60)}m {videoDuration % 60}s original)</span>
                      </>
                    ) : (
                      <>
                        <span className="text-green-400 font-bold">Duration: {videoDuration}s</span>
                        <span className="text-gray-400">✅ Ready</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer p-6 text-center space-y-2"
              >
                <div className="p-3 rounded-full bg-primary/10 text-primary inline-block">
                  <Video size={28} />
                </div>
                <div className="text-sm font-semibold text-white">Click to upload Reel video</div>
                <div className="text-xs text-gray-400">Supports MP4, WebM, MOV (Auto-trimmed to 90s, Max 1GB)</div>
              </div>
            )}
            <input
              ref={fileInputRef}
              id="reel-video-file-input"
              name="reel_file"
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Caption Textarea */}
          <div>
            <label htmlFor="reel-caption-textarea" className="block text-xs font-semibold text-gray-300 mb-1">
              Reel Caption
            </label>
            <textarea
              id="reel-caption-textarea"
              name="reel_caption"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="What's this reel about? Share a quick summary, tip, or note..."
              rows={3}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary"
            />
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="reel-tags-input" className="block text-xs font-semibold text-gray-300 mb-1">
              Topic Tags (comma separated)
            </label>
            <input
              id="reel-tags-input"
              name="reel_tags"
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="e.g. python, studyhacks, finance"
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary"
            />
          </div>

          {/* Live Upload Progress Indicator */}
          {uploading && (
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 space-y-2 shadow-inner">
              <div className="flex items-center justify-between text-xs text-white">
                <span className="font-semibold flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  Uploading Reel video...
                </span>
                <span className="text-primary font-bold">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary via-indigo-500 to-emerald-400 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className="text-[11px] text-gray-300 text-right font-mono">
                {uploadedBytesMB} MB of {totalBytesMB} MB uploaded
              </div>
            </div>
          )}

          {/* Footer Submit Button */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-primary hover:bg-primary/90 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-lg"
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Publishing Reel...
                </>
              ) : (
                <>
                  <Upload size={16} /> Publish Reel
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default ReelUploadModal;
