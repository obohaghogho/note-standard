import React, { useState, useEffect } from 'react';
import { VoiceRecorder } from '../chat/VoiceRecorder';
import { Mic, Download, Trash2, Loader2, Music } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '';

interface VoiceModuleProps {
  noteId: string;
}

export const VoiceModule: React.FC<VoiceModuleProps> = ({ noteId }) => {
  const [savedAudio, setSavedAudio] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchAudioFiles();
  }, [noteId]);

  const fetchAudioFiles = async () => {
    setLoadingFiles(true);
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.get(`${API_URL}/api/notes/${noteId}/files`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Filter for audio files
      const audioFiles = data.filter((f: any) => f.mime_type.startsWith('audio/'));
      setSavedAudio(audioFiles);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleVoiceSend = async (audioBlob: Blob) => {
    setUploading(true);
    try {
      const file = new File([audioBlob], `voice-note-${Date.now()}.mp4`, { type: audioBlob.type || 'audio/mp4' });
      const formData = new FormData();
      formData.append("file", file);

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
      
      setSavedAudio(prev => [data, ...prev]);
      toast.success("Voice note saved!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to save voice note");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900/40 border border-white/10 rounded-xl p-6 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
          <Mic className="w-8 h-8 text-emerald-400" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Record Voice Note</h3>
        <p className="text-sm text-neutral-400 mb-6 max-w-md">
          Record a quick audio memo and attach it directly to this workspace. 
          Your recordings are stored securely.
        </p>

        {uploading ? (
          <div className="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-500/10 px-4 py-2 rounded-xl">
            <Loader2 className="w-5 h-5 animate-spin" />
            Saving Audio...
          </div>
        ) : (
          <VoiceRecorder 
            onSend={handleVoiceSend} 
            onCancel={() => {}} 
          />
        )}
      </div>

      {savedAudio.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Saved Recordings</h4>
          <div className="grid gap-3">
            {savedAudio.map((audio) => (
              <div key={audio.id} className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-neutral-950/20 hover:bg-neutral-950/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-pink-500/20 text-pink-400 rounded-lg">
                    <Music className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white truncate max-w-[200px]">
                      {audio.file_name}
                    </p>
                    <p className="text-[10px] text-neutral-500 font-bold">
                      {new Date(audio.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <audio
                    src={`${API_URL}/api/notes/${noteId}/files/${audio.id}/download`}
                    controls
                    className="h-8 w-40"
                    crossOrigin="use-credentials"
                  />
                  <a 
                    href={`${API_URL}/api/notes/${noteId}/files/${audio.id}/download`}
                    download={audio.file_name}
                    className="p-1.5 hover:bg-white/10 rounded text-neutral-400 hover:text-white transition-colors"
                  >
                    <Download size={16} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
