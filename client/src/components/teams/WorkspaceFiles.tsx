import React, { useEffect, useState, useRef } from 'react';
import { 
  getWorkspaceFiles, createFolder, uploadFileMetadata, 
  toggleFileFavorite, recycleFile, getRecycledFiles 
} from '../../lib/collaborationApi';
import type { WorkspaceFile } from '../../types/collaboration';
import { 
  Folder, File, Plus, Upload, Trash2, Heart, Download, 
  ArrowLeft, FolderPlus, Clock, Loader2, HardDrive, RefreshCw, X, ShieldAlert
} from 'lucide-react';
import { Button } from '../common/Button';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseSafe';

interface WorkspaceFilesProps {
  teamId: string;
}

export const WorkspaceFiles: React.FC<WorkspaceFilesProps> = ({ teamId }) => {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [recycledFiles, setRecycledFiles] = useState<WorkspaceFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async () => {
    setLoading(true);
    try {
      if (showRecycleBin) {
        const data = await getRecycledFiles(teamId);
        setRecycledFiles(data);
      } else {
        const data = await getWorkspaceFiles(teamId, currentFolderId);
        setFiles(data);
      }
    } catch {
      toast.error('Failed to load files.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [teamId, currentFolderId, showRecycleBin]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await createFolder(teamId, newFolderName.trim(), currentFolderId);
      toast.success('Folder created.');
      setNewFolderName('');
      setShowFolderModal(false);
      await loadFiles();
    } catch {
      toast.error('Failed to create folder.');
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error('Files must be less than 20MB.');
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading('Uploading file...');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${teamId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `files/${fileName}`;

      // Upload file directly to Supabase storage bucket
      const { error: uploadError } = await supabase.storage
        .from('team-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Save file metadata in db table
      await uploadFileMetadata(teamId, {
        name: file.name,
        filePath,
        fileSize: file.size,
        mime_type: file.type || 'application/octet-stream',
        parentFolderId: currentFolderId
      });

      toast.success('File uploaded successfully!', { id: toastId });
      await loadFiles();
    } catch (err: any) {
      console.error('[Upload] Failed:', err);
      toast.error(err?.message || 'Upload failed.', { id: toastId });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleFavorite = async (file: WorkspaceFile) => {
    try {
      await toggleFileFavorite(file.id, !file.is_favorite);
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, is_favorite: !f.is_favorite } : f));
      toast.success(file.is_favorite ? 'Removed from favorites.' : 'Added to favorites.');
    } catch {
      toast.error('Failed to favorite file.');
    }
  };

  const handleRecycle = async (file: WorkspaceFile, recycle: boolean) => {
    try {
      await recycleFile(teamId, file.id, recycle);
      toast.success(recycle ? 'Moved to Recycle Bin.' : 'File restored.');
      await loadFiles();
    } catch {
      toast.error('Failed to update file state.');
    }
  };

  const handleDownload = async (file: WorkspaceFile) => {
    if (!file.file_path) return;
    const toastId = toast.loading('Fetching download link...');
    try {
      const { data, error } = await supabase.storage
        .from('team-assets')
        .createSignedUrl(file.file_path, 60);

      if (error || !data?.signedUrl) throw error || new Error('No url');
      toast.success('Download ready.', { id: toastId });
      window.open(data.signedUrl, '_blank');
    } catch {
      toast.error('Download failed.', { id: toastId });
    }
  };

  const navigateToFolder = (folderId: string) => {
    setFolderHistory(prev => [...prev, currentFolderId || 'root']);
    setCurrentFolderId(folderId);
  };

  const navigateBack = () => {
    const prev = [...folderHistory];
    const target = prev.pop();
    setFolderHistory(prev);
    setCurrentFolderId(target === 'root' ? null : (target || null));
  };

  return (
    <div className="p-6 md:p-8 space-y-6 overflow-y-auto h-full scrollbar-hide bg-black text-white relative">
      {/* File Action Bar */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          {currentFolderId && !showRecycleBin && (
            <button onClick={navigateBack} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white">
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <h3 className="text-lg font-black italic uppercase tracking-tight">
              {showRecycleBin ? 'Recycle Bin' : 'Cloud File Manager'}
            </h3>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
              {showRecycleBin ? 'Recycled storage trash list' : 'Traverse folders & manage documents'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {!showRecycleBin ? (
            <>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
              />
              <Button size="sm" onClick={handleUploadClick} disabled={isUploading} className="rounded-xl flex items-center gap-2">
                <Upload size={16} /> {isUploading ? 'Uploading...' : 'Upload File'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowFolderModal(true)} className="rounded-xl border border-white/5 flex items-center gap-2">
                <FolderPlus size={16} /> New Folder
              </Button>
              <button 
                onClick={() => setShowRecycleBin(true)}
                className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl active:scale-95 transition-all text-gray-400 hover:text-white border border-white/5"
              >
                <Trash2 size={16} />
              </button>
            </>
          ) : (
            <Button size="sm" onClick={() => setShowRecycleBin(false)} className="rounded-xl flex items-center gap-2">
              <ArrowLeft size={16} /> Active Files
            </Button>
          )}
          <button onClick={loadFiles} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl active:scale-95 transition-all text-gray-400 hover:text-white border border-white/5">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-500 uppercase tracking-widest text-xs font-black">
          <Loader2 className="animate-spin" size={24} /> Syncing Cloud...
        </div>
      ) : showRecycleBin ? (
        /* Recycle Bin List */
        recycledFiles.length === 0 ? (
          <div className="p-16 rounded-[2.5rem] bg-white/[0.01] border border-dashed border-white/5 text-center max-w-sm mx-auto mt-12 space-y-4">
            <ShieldAlert size={36} className="text-gray-600 mx-auto" />
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest leading-loose">Recycle Bin is Empty</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recycledFiles.map(f => (
              <div key={f.id} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex justify-between items-center group">
                <div className="flex items-center gap-3 min-w-0">
                  <File size={20} className="text-red-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs truncate">{f.name}</h4>
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">
                      {(f.file_size / 1024).toFixed(1)} KB • Recycled
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleRecycle(f, false)} className="rounded-lg text-[10px] px-3 h-8 bg-green-500/10 hover:bg-green-500/20 text-green-400">Restore</Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : files.length === 0 ? (
        <div className="p-16 rounded-[2.5rem] bg-white/[0.01] border border-dashed border-white/5 text-center max-w-sm mx-auto mt-12 space-y-4">
          <HardDrive size={36} className="text-gray-600 mx-auto" />
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest leading-loose">
            No files or folders found.<br/>Upload documents or create directories.
          </p>
        </div>
      ) : (
        /* Files Grid list */
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {files.map(f => (
            <div 
              key={f.id}
              onClick={() => f.is_folder && navigateToFolder(f.id)}
              className={`p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-primary/20 transition-all flex flex-col justify-between h-36 group ${
                f.is_folder ? 'cursor-pointer hover:bg-white/[0.04]' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <div className={`p-2.5 rounded-xl ${
                  f.is_folder ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {f.is_folder ? <Folder size={18} /> : <File size={18} />}
                </div>
                
                {!f.is_folder && (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleToggleFavorite(f); }}
                      className={`p-1.5 rounded-lg hover:bg-white/5 ${
                        f.is_favorite ? 'text-red-400' : 'text-gray-600 hover:text-white'
                      }`}
                    >
                      <Heart size={12} fill={f.is_favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDownload(f); }}
                      className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/5"
                    >
                      <Download size={12} />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-xs text-white truncate">{f.name}</h4>
                <div className="flex justify-between items-center text-[8px] font-bold text-gray-600 uppercase tracking-widest mt-1">
                  <span>{f.is_folder ? 'Directory' : `${(f.file_size / 1024).toFixed(1)} KB`}</span>
                  {!f.is_folder && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleRecycle(f, true); }}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Folder Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowFolderModal(false)} />
          <div className="bg-gray-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-sm shadow-2xl relative z-10 space-y-6">
            <h3 className="text-xl font-black italic uppercase tracking-tight text-white pl-1">New Folder</h3>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1">Folder Name</label>
                <input 
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Marketing Resources"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-xs text-white focus:outline-none"
                  required
                />
              </div>
              <Button type="submit" fullWidth className="h-12 font-black rounded-2xl text-sm">Create Folder</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default WorkspaceFiles;
