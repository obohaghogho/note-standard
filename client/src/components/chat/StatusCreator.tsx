import React, { useState, useRef, useEffect } from 'react';
import { useStatus } from '../../context/StatusContext';
import api from '../../api/axiosInstance';
import toast from 'react-hot-toast';
import { 
  X, Image as ImageIcon, Video, Link as LinkIcon, Type, Send, Loader2, 
  Music, AlignCenter, AlignLeft, AlignRight, Play, Pause, Trash2, FolderOpen
} from 'lucide-react';
import { parseFormattedText } from '../../lib/formatParser';

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

const FONT_PRESETS = [
  { id: 'sans', name: 'Default', family: `system-ui, -apple-system, sans-serif` },
  { id: 'serif', name: 'Serif', family: `Georgia, serif` },
  { id: 'mono', name: 'Mono', family: `monospace` },
  { id: 'cursive', name: 'Hand', family: `"Comic Sans MS", cursive` },
  { id: 'impact', name: 'Impact', family: `'Impact', sans-serif` },
];

const FONT_SIZES = [18, 22, 28, 36, 48];

interface LibrarySong {
  id: string;
  title: string;
  artist: string;
  albumArt?: string;
  url: string;
  duration: string;
}

export default function StatusCreator() {
  const { createStatus, closeCreator } = useStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [tab, setTab] = useState<'text' | 'media' | 'link'>('text');
  const [textContent, setTextContent] = useState('');
  const [bgPreset, setBgPreset] = useState(BG_PRESETS[4]);
  const [fontIndex, setFontIndex] = useState(0);
  const [fontSize, setFontSize] = useState<number>(28);
  const [textAlign, setTextAlign] = useState<'center' | 'left' | 'right'>('center');
  const [privacy, setPrivacy] = useState('contacts');

  // Media
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Link
  const [linkUrl, setLinkUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Background Music
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicPreview, setMusicPreview] = useState<string | null>(null);
  const [librarySongTitle, setLibrarySongTitle] = useState('');
  const [musicUploading, setMusicUploading] = useState(false);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<'trending' | 'pop' | 'chill' | 'electronic'>('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const [librarySongs, setLibrarySongs] = useState<LibrarySong[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(false);

  const isGradient = bgPreset.value.startsWith('linear-gradient');

  // Fetch live music catalog from iTunes API
  useEffect(() => {
    if (!showMusicPicker) return;

    const delayDebounce = setTimeout(async () => {
      setLoadingSongs(true);
      try {
        const query = searchQuery.trim() || pickerCategory;
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=15`);
        const data = await res.json();
        const tracks = (data.results || []).map((t: any) => {
          const secs = Math.floor((t.trackTimeMillis / 1000) % 60);
          const mins = Math.floor((t.trackTimeMillis / 1000) / 60);
          const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
          return {
            id: String(t.trackId),
            title: t.trackName,
            artist: t.artistName,
            albumArt: t.artworkUrl100,
            url: t.previewUrl,
            duration: durationStr
          };
        });
        setLibrarySongs(tracks);
      } catch (err) {
        console.error('Failed to fetch songs', err);
        toast.error('Failed to fetch live music catalog');
      } finally {
        setLoadingSongs(false);
      }
    }, 450);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, pickerCategory, showMusicPicker]);

  // Initialize preview audio element
  useEffect(() => {
    previewAudioRef.current = new Audio();
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const handleTogglePreview = (song: LibrarySong) => {
    const audio = previewAudioRef.current;
    if (!audio) return;

    if (playingPreviewId === song.id) {
      audio.pause();
      setPlayingPreviewId(null);
    } else {
      audio.pause();
      audio.src = song.url;
      audio.currentTime = 0;
      audio.play()
        .then(() => setPlayingPreviewId(song.id))
        .catch(() => toast.error('Could not preview track'));
    }
  };

  const handleCloseMusicPicker = () => {
    const audio = previewAudioRef.current;
    if (audio) {
      audio.pause();
    }
    setPlayingPreviewId(null);
    setShowMusicPicker(false);
  };

  const handleSelectLibrarySong = (song: LibrarySong) => {
    handleCloseMusicPicker();
    setMusicFile(null);
    setMusicPreview(song.url);
    setLibrarySongTitle(`${song.title} - ${song.artist}`);
  };

  const handleClearMusic = () => {
    const audio = previewAudioRef.current;
    if (audio) {
      audio.pause();
    }
    setMusicFile(null);
    setMusicPreview(null);
    setLibrarySongTitle('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      toast.error('Please select a valid audio file');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Audio file must be less than 20MB');
      return;
    }
    handleCloseMusicPicker();
    setMusicFile(file);
    setMusicPreview(URL.createObjectURL(file));
    setLibrarySongTitle(file.name);
  };

  const applyFormatting = (formatType: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textContent.substring(start, end);

    let replacement = '';
    let cursorOffset = 0;

    switch (formatType) {
      case 'bold':
        replacement = `*${selectedText || 'text'}*`;
        cursorOffset = selectedText ? 0 : 1;
        break;
      case 'italic':
        replacement = `_${selectedText || 'text'}_`;
        cursorOffset = selectedText ? 0 : 1;
        break;
      case 'strike':
        replacement = `~${selectedText || 'text'}~`;
        cursorOffset = selectedText ? 0 : 1;
        break;
      case 'code':
        replacement = `\`${selectedText || 'text'}\``;
        cursorOffset = selectedText ? 0 : 1;
        break;
      case 'bullet':
        replacement = `* ${selectedText || 'item'}`;
        break;
      case 'number':
        replacement = `1. ${selectedText || 'item'}`;
        break;
      case 'quote':
        replacement = `> ${selectedText || 'quote'}`;
        break;
      default:
        return;
    }

    const newText = textContent.substring(0, start) + replacement + textContent.substring(end);
    setTextContent(newText);
    setShowPreview(false);

    setTimeout(() => {
      textarea.focus();
      const newStart = start + (cursorOffset ? 1 : 0);
      const newEnd = start + replacement.length - (cursorOffset ? 1 : 0);
      textarea.setSelectionRange(newStart, newEnd);
    }, 0);
  };

  const handleSubmit = async () => {
    if (submitting) return;

    if (tab === 'text' && !textContent.trim()) {
      toast.error('Write something first');
      return;
    }
    if (tab === 'media' && !mediaFile) {
      toast.error('Select a photo or video');
      return;
    }
    if (tab === 'link' && !linkUrl.trim()) {
      toast.error('Enter a URL');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, any> = { privacy };

      // Upload background music first if selected from device
      if (musicFile) {
        setMusicUploading(true);
        const form = new FormData();
        form.append('file', musicFile);
        
        const { data: upload } = await api.post('/upload/media', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        payload.bg_music_url = upload.secure_url || upload.url;
        payload.bg_music_title = musicFile.name;
        setMusicUploading(false);
      } else if (musicPreview) {
        // Selected from built-in library, use the stream URL directly
        payload.bg_music_url = musicPreview;
        payload.bg_music_title = librarySongTitle;
      }

      if (tab === 'text') {
        payload.type = 'text';
        payload.content = textContent.trim();
        if (isGradient) payload.bg_gradient = bgPreset.value;
        else payload.bg_color = bgPreset.value;
        
        payload.font_size = fontSize;
        payload.font_style = FONT_PRESETS[fontIndex].id;
        payload.text_align = textAlign;
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
      handleClearMusic();
      closeCreator();
    } catch (err: any) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || 'Failed to post status');
    } finally {
      setSubmitting(false);
      setMediaUploading(false);
      setMusicUploading(false);
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
              <ImageIcon size={16} /> Media
            </button>
            <button 
              onClick={() => setTab('link')} 
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${tab === 'link' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
            >
              <LinkIcon size={16} /> Link
            </button>
          </div>

          <div className="flex gap-2">
            {(tab === 'text' || tab === 'media') && (
              <button 
                onClick={() => setShowMusicPicker(true)}
                className={`p-2 rounded-full transition-all active:scale-95 border ${musicPreview ? 'bg-blue-600 text-white border-blue-500' : 'text-gray-400 hover:text-white bg-gray-800 border-gray-700'}`}
                title="Add Background Music"
              >
                <Music size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Music preview badge */}
        {musicPreview && (
          <div className="bg-blue-900/40 border-b border-blue-800/50 px-4 py-2 flex items-center justify-between text-blue-300 text-xs">
            <span className="truncate flex items-center gap-1.5">
              <span className="animate-bounce">🎵</span> {librarySongTitle || 'Audio attachment'}
            </span>
            <button 
              onClick={handleClearMusic}
              className="text-blue-400 hover:text-red-400 p-1 rounded-md bg-blue-950/50 hover:bg-red-950/20 transition-colors"
              title="Remove music"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto flex flex-col no-scrollbar">
          
          {tab === 'text' && (
            <div className="flex-1 flex flex-col p-4 gap-4">
              
              {/* Text formatting toolbar */}
              <div className="flex flex-wrap items-center justify-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1.5">
                <button onClick={() => applyFormatting('bold')} className="px-2.5 py-1 text-sm font-bold text-gray-300 hover:text-white rounded hover:bg-gray-800 transition-colors" title="Bold (*text*)">B</button>
                <button onClick={() => applyFormatting('italic')} className="px-2.5 py-1 text-sm italic text-gray-300 hover:text-white rounded hover:bg-gray-800 transition-colors" title="Italic (_text_)">I</button>
                <button onClick={() => applyFormatting('strike')} className="px-2.5 py-1 text-sm line-through text-gray-300 hover:text-white rounded hover:bg-gray-800 transition-colors" title="Strike (~text~)">S</button>
                <button onClick={() => applyFormatting('code')} className="px-2.5 py-1 text-xs font-mono text-gray-300 hover:text-white rounded hover:bg-gray-800 transition-colors" title="Code (`code`)">&lt;&gt;</button>
                
                <span className="w-[1px] h-4 bg-gray-800 mx-1" />
                
                <button onClick={() => applyFormatting('bullet')} className="px-2 py-1 text-xs text-gray-300 hover:text-white rounded hover:bg-gray-800 transition-colors" title="Bullet List">• List</button>
                <button onClick={() => applyFormatting('number')} className="px-2 py-1 text-xs text-gray-300 hover:text-white rounded hover:bg-gray-800 transition-colors" title="Numbered List">1. List</button>
                <button onClick={() => applyFormatting('quote')} className="px-2 py-1 text-xs text-gray-300 hover:text-white rounded hover:bg-gray-800 transition-colors" title="Block Quote">“ Quote</button>
                
                <span className="w-[1px] h-4 bg-gray-800 mx-1" />
                
                <button 
                  onClick={() => setShowPreview(!showPreview)} 
                  disabled={!textContent.trim()}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${showPreview ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white disabled:opacity-30'}`}
                >
                  Preview
                </button>
              </div>

              {/* Layout Customizers: Font sizes and Alignments */}
              {!showPreview && (
                <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500 text-xs mr-1">Size:</span>
                    {FONT_SIZES.map(sz => (
                      <button 
                        key={sz} 
                        onClick={() => setFontSize(sz)}
                        className={`w-7 h-7 rounded text-xs font-bold transition-colors ${fontSize === sz ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-1">
                    <button 
                      onClick={() => setTextAlign('left')} 
                      className={`p-1.5 rounded transition-colors ${textAlign === 'left' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                      title="Align Left"
                    >
                      <AlignLeft size={16} />
                    </button>
                    <button 
                      onClick={() => setTextAlign('center')} 
                      className={`p-1.5 rounded transition-colors ${textAlign === 'center' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                      title="Align Center"
                    >
                      <AlignCenter size={16} />
                    </button>
                    <button 
                      onClick={() => setTextAlign('right')} 
                      className={`p-1.5 rounded transition-colors ${textAlign === 'right' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                      title="Align Right"
                    >
                      <AlignRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Status Box Preview */}
              <div 
                className="w-full aspect-[9/16] rounded-2xl flex flex-col items-center justify-center p-6 shadow-inner transition-colors duration-300 relative"
                style={previewStyle}
              >
                <div className="absolute top-4 right-4 z-10 flex gap-2">
                   <button
                     onClick={() => setFontIndex(i => (i + 1) % FONT_PRESETS.length)}
                     className="w-10 h-10 bg-black/40 hover:bg-black/60 rounded-full text-white font-bold text-sm flex items-center justify-center backdrop-blur-md transition-colors border border-white/20"
                     title={`Font: ${FONT_PRESETS[(fontIndex + 1) % FONT_PRESETS.length].name}`}
                   >
                     Aa
                   </button>
                </div>
                
                {showPreview ? (
                  <div 
                    className="w-full text-white overflow-y-auto no-scrollbar max-h-full font-medium"
                    style={{ 
                      fontFamily: FONT_PRESETS[fontIndex].family, 
                      fontSize: `${fontSize}px`,
                      textAlign: textAlign,
                      lineHeight: '1.3'
                    }}
                  >
                    {parseFormattedText(textContent)}
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    autoFocus
                    id="status-text-input"
                    name="status-text-input"
                    placeholder="Type a status"
                    value={textContent}
                    onChange={e => setTextContent(e.target.value)}
                    maxLength={700}
                    className="w-full bg-transparent border-none text-white placeholder-white/50 focus:outline-none resize-none font-medium flex-1 my-auto flex items-center"
                    style={{ 
                      fontFamily: FONT_PRESETS[fontIndex].family, 
                      fontSize: `${fontSize}px`,
                      textAlign: textAlign,
                      lineHeight: '1.3'
                    }}
                  />
                )}
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
                  <div className="flex gap-2 w-20 h-20 rounded-full bg-gray-800 items-center justify-center text-blue-500">
                    <ImageIcon size={28} />
                    <Video size={28} />
                  </div>
                  <div className="text-gray-400 font-medium">Click to select photo or video</div>
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
                id="status-media-file"
                name="status-media-file"
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                accept="image/*,video/*" 
                className="hidden" 
              />
              <input
                type="text"
                id="status-media-caption"
                name="status-media-caption"
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
                  id="status-link-url"
                  name="status-link-url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  className="w-full bg-black/40 border border-indigo-500/50 rounded-xl px-4 py-4 text-white text-center font-medium placeholder-indigo-500/50 focus:outline-none focus:border-indigo-400 shadow-inner"
                />

                <input
                  type="text"
                  id="status-link-caption"
                  name="status-link-caption"
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
            {submitting || mediaUploading || musicUploading ? (
              <><Loader2 size={18} className="animate-spin" /> {mediaUploading ? `${uploadProgress}%` : musicUploading ? 'Music...' : 'Posting'}</>
            ) : (
              <><Send size={18} /> Post</>
            )}
          </button>
        </div>

      </div>

      {/* ── Music Picker Modal ── */}
      {showMusicPicker && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[120]">
          <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl flex flex-col max-h-[80vh] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <Music size={18} /> Select Music
              </h3>
              <button className="text-gray-400 hover:text-white p-1 rounded-full bg-gray-800 hover:bg-gray-700" onClick={handleCloseMusicPicker}>
                <X size={18} />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-gray-800">
              <input
                type="text"
                id="status-music-search"
                name="status-music-search"
                placeholder="Search music, artists..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-sm"
              />
            </div>

            {/* Categories */}
            <div className="flex border-b border-gray-800 p-1 overflow-x-auto no-scrollbar gap-1 bg-gray-950/50">
              {(['trending', 'pop', 'chill', 'electronic'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => { setPickerCategory(cat); setSearchQuery(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors shrink-0 ${pickerCategory === cat && !searchQuery ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Songs List */}
            <div className="flex-1 overflow-y-auto no-scrollbar min-h-0 bg-gray-950/20">
              {loadingSongs ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 size={24} className="animate-spin text-blue-500" />
                  <span className="text-gray-500 text-xs">Searching music library...</span>
                </div>
              ) : librarySongs.length === 0 ? (
                <div className="text-center text-gray-500 py-10 text-xs">No tracks found.</div>
              ) : (
                librarySongs.map(song => (
                  <div key={song.id} className="flex items-center gap-3 p-3 hover:bg-white/5 border-b border-gray-800/40">
                    <button
                      onClick={() => handleTogglePreview(song)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/10 transition-colors ${playingPreviewId === song.id ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                    >
                      {playingPreviewId === song.id ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </button>

                    {song.albumArt && (
                      <img 
                        src={song.albumArt} 
                        alt="" 
                        className="w-10 h-10 rounded-md object-cover bg-gray-800 shrink-0" 
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-semibold truncate leading-normal">{song.title}</div>
                      <div className="text-gray-400 text-xs truncate leading-normal">{song.artist}</div>
                    </div>

                    <span className="text-gray-500 text-xs font-medium mr-1">{song.duration}</span>

                    <button
                      onClick={() => handleSelectLibrarySong(song)}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-95 transition-all"
                    >
                      Select
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Custom file upload row */}
            <div className="p-3 border-t border-gray-800 bg-gray-900 flex justify-center">
              <button 
                onClick={() => audioInputRef.current?.click()}
                className="flex items-center gap-2 text-blue-400 hover:text-white px-4 py-2 bg-blue-950/30 hover:bg-blue-600 rounded-xl transition-all border border-blue-800/30 hover:border-blue-500 text-xs font-semibold"
              >
                <FolderOpen size={14} /> Upload Custom Audio
              </button>
              <input 
                type="file" 
                id="status-music-file"
                name="status-music-file"
                ref={audioInputRef} 
                onChange={handleAudioSelect} 
                accept="audio/*" 
                className="hidden" 
              />
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
