import React, { useState, useRef } from 'react';
import { useStatus } from '../../context/StatusContext';
import api from '../../api/axiosInstance';
import toast from 'react-hot-toast';
import { X, Image as ImageIcon, Link as LinkIcon, Type, Send, Loader2 } from 'lucide-react';

const BG_PRESETS = [
  { label: 'Purple', value: '#1a0a2e' },
  { label: 'Ocean', value: '#0a1628' },
  { label: 'Forest', value: '#0a1f0a' },
  { label: 'Sunset', value: 'linear-gradient(135deg,#ff6b35,#f7931e,#ffcd3c)' },
  { label: 'Aurora', value: 'linear-gradient(135deg,#667eea,#764ba2)' },
  { label: 'Rose', value: 'linear-gradient(135deg,#f43f5e,#fb923c)' },
  { label: 'Mint', value: 'linear-gradient(135deg,#11998e,#38ef7d)' },
  { label: 'Night', value: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)' },
  { label: 'Gold', value: 'linear-gradient(135deg,#f7971e,#ffd200)' },
  { label: 'Deep', value: 'linear-gradient(135deg,#141e30,#243b55)' },
];

const FONT_FAMILIES = [
  { name: 'System', value: 'system-ui, sans-serif' },
  { name: 'Serif', value: 'Georgia, serif' },
  { name: 'Mono', value: 'monospace' },
  { name: 'Hand', value: '"Comic Sans MS", cursive' },
];

export default function StatusCreator() {
  const { createStatus, closeCreator } = useStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [tab, setTab] = useState<'text' | 'media' | 'link'>('text');
  const [textContent, setTextContent] = useState('');
  const [bgPreset, setBgPreset] = useState(BG_PRESETS[4]);
  const [fontIndex, setFontIndex] = useState(0);
  const [privacy, setPrivacy] = useState('contacts');
  
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [linkUrl, setLinkUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isGradient = bgPreset.value.startsWith('linear-gradient');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (submitting) return;

    if (tab === 'text' && !textContent.trim()) {
      toast.error('Write something first');
      return;
    }
    if (tab === 'media' && !mediaFile) {
      toast.error('Select an image');
      return;
    }
    if (tab === 'link' && !linkUrl.trim()) {
      toast.error('Enter a URL');
      return;
    }

    setSubmitting(true);
    try {
      let payload: any = { privacy };

      if (tab === 'text') {
        payload.type = 'text';
        payload.content = textContent.trim();
        if (isGradient) payload.bg_gradient = bgPreset.value;
        else payload.bg_color = bgPreset.value;
        
        // Auto-scale font size like WhatsApp based on character count
        const len = textContent.length;
        payload.font_size = len < 50 ? 40 : len < 100 ? 32 : len < 200 ? 24 : 18;
        payload.font_style = FONT_FAMILIES[fontIndex].value;
      }

      if (tab === 'media' && mediaFile) {
        setMediaUploading(true);
        const form = new FormData();
        form.append('file', mediaFile);
        
        const { data: upload } = await api.post('/upload/media', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
          },
        });
        setMediaUploading(false);

        payload.type = upload.resource_type === 'video' ? 'video' : 'image';
        payload.media_url = upload.secure_url || upload.url;
        payload.content = caption.trim() || null;
      }

      if (tab === 'link') {
        payload.type = 'link';
        payload.link_url = linkUrl.trim();
        payload.content = caption.trim() || null;
      }

      await createStatus(payload);
      toast.success('Status posted! 🚀');
      closeCreator();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to post status');
    } finally {
      setSubmitting(false);
      setMediaUploading(false);
    }
  };

  const previewStyle = isGradient
    ? { background: bgPreset.value }
    : { backgroundColor: bgPreset.value };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col md:flex-row items-center justify-center p-4">
      <div className="w-full h-full md:w-[400px] md:h-[800px] md:max-h-[90vh] bg-gray-950 border border-gray-800 relative md:rounded-3xl flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50 backdrop-blur-md">
          <button onClick={closeCreator} className="text-gray-400 hover:text-white p-2 bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button 
              onClick={() => setTab('text')} 
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${tab === 'text' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
            >
              <Type size={16} /> Text
            </button>
            <button 
              onClick={() => setTab('media')} 
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${tab === 'media' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
            >
              <ImageIcon size={16} /> Image
            </button>
            <button 
              onClick={() => setTab('link')} 
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${tab === 'link' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
            >
              <LinkIcon size={16} /> Link
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto flex flex-col no-scrollbar">
          {tab === 'text' && (
            <div className="flex-1 flex flex-col p-4 gap-6">
              <div 
                className="w-full aspect-[9/16] rounded-2xl flex flex-col items-center justify-center p-6 shadow-inner transition-colors duration-300 relative"
                style={previewStyle}
              >
                <div className="absolute top-4 right-4 z-10 flex gap-2">
                   <button
                     onClick={() => setFontIndex(i => (i + 1) % FONT_FAMILIES.length)}
                     className="w-10 h-10 bg-black/40 hover:bg-black/60 rounded-full text-white font-bold text-lg flex items-center justify-center backdrop-blur-md transition-colors border border-white/20"
                     title="Change Font"
                   >
                     T
                   </button>
                </div>
                
                <textarea
                  autoFocus
                  placeholder="Type a status"
                  value={textContent}
                  onChange={e => setTextContent(e.target.value)}
                  maxLength={700}
                  className="w-full bg-transparent border-none text-white text-center placeholder-white/50 focus:outline-none resize-none font-medium flex-1 my-auto flex items-center"
                  style={{ 
                    fontFamily: FONT_FAMILIES[fontIndex].value, 
                    fontSize: `${textContent.length < 50 ? 40 : textContent.length < 100 ? 32 : textContent.length < 200 ? 24 : 18}px`,
                    lineHeight: '1.3'
                  }}
                />
              </div>

              <div>
                <p className="text-gray-400 text-xs font-semibold mb-3 uppercase tracking-wider">Background</p>
                <div className="flex flex-wrap gap-3">
                  {BG_PRESETS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setBgPreset(p)}
                      className={`w-10 h-10 rounded-full border-2 transition-transform ${bgPreset.label === p.label ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                      style={p.value.startsWith('linear') ? { background: p.value } : { backgroundColor: p.value }}
                      title={p.label}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'media' && (
            <div className="flex-1 flex flex-col p-4 gap-4">
              {!mediaPreview ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-[9/16] border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer bg-gray-900/50 hover:bg-gray-800/50 transition-colors"
                >
                  <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center text-blue-500">
                    <ImageIcon size={32} />
                  </div>
                  <div className="text-gray-400 font-medium">Click to select image</div>
                </div>
              ) : (
                <div className="w-full aspect-[9/16] relative rounded-2xl overflow-hidden group bg-black flex items-center justify-center">
                  {mediaFile?.type.startsWith('video/') ? (
                    <video src={mediaPreview} controls className="w-full h-full object-contain" />
                  ) : (
                    <img src={mediaPreview} alt="Preview" className="w-full h-full object-contain" />
                  )}
                  <button 
                    onClick={() => { setMediaFile(null); setMediaPreview(null); }}
                    className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md border border-white/20 hover:bg-red-500/80 z-20"
                  >
                    <X size={20} />
                  </button>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                accept="image/*,video/*" 
                className="hidden" 
              />
              <input
                type="text"
                placeholder="Add a caption..."
                value={caption}
                onChange={e => setCaption(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          )}

          {tab === 'link' && (
            <div className="flex-1 flex flex-col p-4 gap-6">
              <div className="w-full aspect-[9/16] bg-indigo-900/20 border border-indigo-500/20 rounded-2xl flex flex-col p-6 relative justify-center gap-6">
                <div className="w-20 h-20 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto border border-indigo-500/30">
                  <LinkIcon size={40} />
                </div>
                
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  className="w-full bg-black/40 border border-indigo-500/50 rounded-xl px-4 py-4 text-white text-center font-medium placeholder-indigo-500/50 focus:outline-none focus:border-indigo-400 shadow-inner"
                />

                <input
                  type="text"
                  placeholder="Optional caption..."
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  className="w-full bg-black/20 border-b border-indigo-500/30 px-4 py-3 text-white text-center text-sm placeholder-indigo-500/40 focus:outline-none focus:border-indigo-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900 flex justify-between items-center">
          <select 
            value={privacy} 
            onChange={e => setPrivacy(e.target.value)}
            className="bg-gray-800 text-sm text-gray-300 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="contacts">👥 Contacts & Friends</option>
            <option value="everyone">🌎 Everyone</option>
            <option value="private">🔒 Only Me</option>
          </select>

          <button 
            onClick={handleSubmit} 
            disabled={submitting || (tab === 'text' && !textContent.trim()) || (tab === 'media' && !mediaFile)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-6 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-lg shadow-blue-900/20"
          >
            {submitting || mediaUploading ? (
              <><Loader2 size={18} className="animate-spin" /> {mediaUploading ? `${uploadProgress}%` : 'Posting'}</>
            ) : (
              <><Send size={18} /> Post</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
