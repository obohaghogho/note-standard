import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  ArrowLeft, Search, Star, History, Upload, Check, 
  RotateCcw, Sliders, Image as ImageIcon, Sparkles, X, Sun, Moon, Eye, Crop, ZoomIn
} from 'lucide-react';
import { useWallpaper, type WallpaperConfig, WALLPAPER_PRESETS } from '../../context/WallpaperContext';
import { useChatTheme } from '../../context/ChatThemeContext';
import { WallpaperEngine } from './WallpaperEngine';
import toast from 'react-hot-toast';

interface WallpaperPickerProps {
  chatId: string | 'global';
  onClose: () => void;
}

// ── EXTENDED PRESETS FOR ALL CATEGORIES ──
const CATEGORY_PRESETS: WallpaperConfig[] = [
  // 1. Colors Category (Solid Colors)
  {
    id: 'color_slate',
    name: 'Deep Slate',
    category: 'Colors',
    type: 'color',
    colors: ['#0f172a'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 0, zoom: 1, opacity: 1, speed: 0, particleCount: 0,
  },
  {
    id: 'color_midnight',
    name: 'Midnight Blue',
    category: 'Colors',
    type: 'color',
    colors: ['#0b132b'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 0, zoom: 1, opacity: 1, speed: 0, particleCount: 0,
  },
  {
    id: 'color_crimson',
    name: 'Royal Velvet',
    category: 'Colors',
    type: 'color',
    colors: ['#4c0519'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 0, zoom: 1, opacity: 1, speed: 0, particleCount: 0,
  },
  {
    id: 'color_emerald',
    name: 'Emerald Forest',
    category: 'Colors',
    type: 'color',
    colors: ['#022c22'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 0, zoom: 1, opacity: 1, speed: 0, particleCount: 0,
  },
  {
    id: 'color_amber',
    name: 'Dark Amber',
    category: 'Colors',
    type: 'color',
    colors: ['#451a03'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 0, zoom: 1, opacity: 1, speed: 0, particleCount: 0,
  },
  {
    id: 'color_violet',
    name: 'Deep Plum',
    category: 'Colors',
    type: 'color',
    colors: ['#2e1065'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 0, zoom: 1, opacity: 1, speed: 0, particleCount: 0,
  },

  // 2. Gradients Category
  {
    id: 'grad_sunset',
    name: 'Sunset Dream',
    category: 'Gradients',
    type: 'particles',
    colors: ['#14050d', '#f97316', '#db2777', '#3b0764'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 20, zoom: 1, opacity: 1, speed: 1, particleCount: 50,
  },
  {
    id: 'grad_ocean',
    name: 'Deep Oceanic',
    category: 'Gradients',
    type: 'waves',
    colors: ['#020b14', '#0c4a6e', '#0369a1', '#075985'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 15, zoom: 1, opacity: 1, speed: 0.6, particleCount: 3,
  },
  {
    id: 'grad_neon_aurora',
    name: 'Cyberpunk Neon',
    category: 'Gradients',
    type: 'aurora',
    colors: ['#090514', '#ec4899', '#8b5cf6', '#06b6d4'],
    blur: 0, brightness: 100, contrast: 100, saturation: 110, dimming: 20, zoom: 1, opacity: 1, speed: 1, particleCount: 40,
  },
  {
    id: 'grad_lavender',
    name: 'Soft Lavender Mesh',
    category: 'Gradients',
    type: 'mesh',
    colors: ['#0d081b', '#8b5cf6', '#ec4899', '#1e1b4b'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 25, zoom: 1, opacity: 1, speed: 0.8, particleCount: 0,
  },

  // 3. Nature Category
  {
    id: 'nature_fireflies',
    name: 'Rainforest Fireflies',
    category: 'Nature',
    type: 'fireflies',
    colors: ['#010f0b', '#064e3b', '#10b981', '#022c22'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 15, zoom: 1, opacity: 1, speed: 1, particleCount: 40,
  },
  {
    id: 'nature_winter',
    name: 'Snowy Solitude',
    category: 'Nature',
    type: 'snow',
    colors: ['#090d16', '#1e293b', '#ffffff'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 20, zoom: 1, opacity: 1, speed: 1, particleCount: 60,
  },
  {
    id: 'nature_stars',
    name: 'Starlight Canopy',
    category: 'Nature',
    type: 'stars',
    colors: ['#030308', '#0c0f24', '#ffffff'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 10, zoom: 1, opacity: 1, speed: 0.5, particleCount: 90,
  },

  // 4. Abstract Category
  {
    id: 'abstract_aurora',
    name: 'Cosmic Aurora',
    category: 'Abstract',
    type: 'aurora',
    colors: ['#05060f', '#3b82f6', '#a855f7', '#1e1b4b', '#311042'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 30, zoom: 1, opacity: 1, speed: 1, particleCount: 50,
  },
  {
    id: 'abstract_glass',
    name: 'Frozen Crystal Glass',
    category: 'Abstract',
    type: 'glass',
    colors: ['#0f1220', '#4f46e5', '#db2777'],
    blur: 15, brightness: 100, contrast: 100, saturation: 100, dimming: 20, zoom: 1, opacity: 1, speed: 1, particleCount: 0,
  },
  {
    id: 'abstract_grid',
    name: 'Synthwave Matrix',
    category: 'Abstract',
    type: 'grid',
    colors: ['#04050a', '#ec4899', '#6366f1'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 20, zoom: 1, opacity: 1, speed: 0.8, particleCount: 0,
  },

  // 5. Dark Category
  {
    id: 'amoled_black',
    name: 'Pure AMOLED Black',
    category: 'Dark',
    type: 'amoled',
    colors: ['#000000'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 0, zoom: 1, opacity: 1, speed: 1, particleCount: 0,
  },
  {
    id: 'doodle_dark',
    name: 'WhatsApp Doodle Dark',
    category: 'Dark',
    type: 'doodle',
    colors: ['#0f172a', 'rgba(255,255,255,0.035)'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 10, zoom: 1, opacity: 1, speed: 0, particleCount: 0,
  },
  {
    id: 'dark_space',
    name: 'Deep Stellar Void',
    category: 'Dark',
    type: 'stars',
    colors: ['#020205', '#080914', '#e2e8f0'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 10, zoom: 1, opacity: 1, speed: 0.4, particleCount: 110,
  },

  // 6. Light Category
  {
    id: 'doodle_light',
    name: 'WhatsApp Doodle Light',
    category: 'Light',
    type: 'doodle',
    colors: ['#efeae2', 'rgba(0,0,0,0.04)'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 0, zoom: 1, opacity: 1, speed: 0, particleCount: 0,
  },
  {
    id: 'light_slate',
    name: 'Minimal Light Slate',
    category: 'Light',
    type: 'color',
    colors: ['#f8fafc'],
    blur: 0, brightness: 100, contrast: 100, saturation: 100, dimming: 0, zoom: 1, opacity: 1, speed: 0, particleCount: 0,
  },
  {
    id: 'light_pastel',
    name: 'Pastel Sunset Sky',
    category: 'Light',
    type: 'particles',
    colors: ['#fdf2f8', '#fbcfe8', '#bae6fd', '#fef08a'],
    blur: 0, brightness: 105, contrast: 100, saturation: 100, dimming: 0, zoom: 1, opacity: 1, speed: 0.5, particleCount: 30,
  },
];

export const WallpaperPicker: React.FC<WallpaperPickerProps> = ({ chatId, onClose }) => {
  const { setIsSettingsOpen } = useChatTheme();
  const {
    presets: contextPresets,
    getWallpaper,
    saveWallpaper,
    resetWallpaper,
    favorites,
    recentlyUsed,
    toggleFavorite,
    addRecentlyUsed,
    setPreviewWallpaper,
    clearPreviewWallpaper,
  } = useWallpaper();

  // Combine context presets and extended category presets cleanly
  const allPresets = useMemo(() => {
    const map = new Map<string, WallpaperConfig>();
    [...contextPresets, ...CATEGORY_PRESETS].forEach(p => map.set(p.id, p));
    return Array.from(map.values());
  }, [contextPresets]);

  // Saved wallpaper config for initial state
  const currentSaved = useMemo(() => {
    return getWallpaper(chatId === 'global' ? undefined : chatId);
  }, [getWallpaper, chatId]);

  // Selected transient wallpaper configuration (for live editing & previewing)
  const [selectedConfig, setSelectedConfig] = useState<WallpaperConfig>(() => ({ ...currentSaved }));

  // UI tabs & states
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAdjustments, setShowAdjustments] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set live preview on initial load or selection change
  const handleSelectWallpaper = useCallback((wp: WallpaperConfig) => {
    const updated = {
      ...wp,
      blur: selectedConfig.blur !== undefined ? selectedConfig.blur : wp.blur,
      dimming: selectedConfig.dimming !== undefined ? selectedConfig.dimming : wp.dimming,
      zoom: selectedConfig.zoom !== undefined ? selectedConfig.zoom : wp.zoom,
      brightness: selectedConfig.brightness !== undefined ? selectedConfig.brightness : wp.brightness,
    };
    setSelectedConfig(updated);
    setPreviewWallpaper(updated);
  }, [selectedConfig, setPreviewWallpaper]);

  // Update live adjustments (blur, dimming, zoom, brightness)
  const handleAdjustmentChange = useCallback((key: keyof WallpaperConfig, value: number) => {
    setSelectedConfig(prev => {
      const next = { ...prev, [key]: value };
      setPreviewWallpaper(next);
      return next;
    });
  }, [setPreviewWallpaper]);

  // Handle Cancel action: clear live preview and close bottom sheet
  const handleCancel = useCallback(() => {
    clearPreviewWallpaper();
    onClose();
  }, [clearPreviewWallpaper, onClose]);

  // Handle Apply action: save wallpaper, add to recent, show toast, close sheet
  const handleApply = useCallback(() => {
    saveWallpaper(chatId, selectedConfig);
    addRecentlyUsed(selectedConfig.id);
    clearPreviewWallpaper();
    toast.success('✓ Wallpaper updated', {
      duration: 2000,
      position: 'bottom-center',
      style: {
        background: '#0f172a',
        color: '#38bdf8',
        border: '1px solid #1e293b',
        fontWeight: 'bold',
        fontSize: '13px',
      }
    });
    onClose();
  }, [saveWallpaper, chatId, selectedConfig, addRecentlyUsed, clearPreviewWallpaper, onClose]);

  // Handle Reset to Default
  const handleReset = useCallback(() => {
    resetWallpaper(chatId);
    clearPreviewWallpaper();
    toast.success('✓ Restored default wallpaper', { duration: 2000 });
    onClose();
  }, [resetWallpaper, chatId, clearPreviewWallpaper, onClose]);

  // Handle Custom File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5MB. Please choose a smaller photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const customConfig: WallpaperConfig = {
        id: `custom_${Date.now()}`,
        name: 'Custom Photo',
        category: 'Custom Photo',
        type: 'image',
        customUrl: dataUrl,
        blur: 0,
        brightness: 100,
        contrast: 100,
        saturation: 100,
        dimming: 10,
        zoom: 1,
        opacity: 1,
        speed: 0,
        particleCount: 0,
      };
      setSelectedConfig(customConfig);
      setPreviewWallpaper(customConfig);
      toast.success('Photo loaded! Tap Apply to save.');
    };
    reader.readAsDataURL(file);
  };

  // Keyboard navigation & ESC listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel]);

  // Mobile Drag / Swipe-down gesture support
  const touchStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;
    if (deltaY > 0) {
      setDragOffset(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (dragOffset > 120) {
      handleCancel();
    } else {
      setDragOffset(0);
    }
    touchStartY.current = null;
  };

  // Category Tabs List
  const categoryTabs = useMemo(() => {
    const tabs = ['All', 'Colors', 'Gradients', 'Nature', 'Abstract', 'Dark', 'Light', 'Custom Photo'];
    if (favorites.length > 0) {
      return ['⭐ Favorites', ...tabs];
    }
    return tabs;
  }, [favorites]);

  // Filtered Presets
  const filteredPresets = useMemo(() => {
    return allPresets.filter(p => {
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        return p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query);
      }

      if (activeCategory === '⭐ Favorites') {
        return favorites.includes(p.id);
      }

      if (activeCategory === 'All') return true;
      if (activeCategory === 'Custom Photo') return p.type === 'image' || p.category === 'Custom Photo';

      return p.category.toLowerCase() === activeCategory.toLowerCase();
    });
  }, [allPresets, activeCategory, searchQuery, favorites]);

  // Recent Presets List (Requirement 9: Last 10 wallpapers)
  const recentPresets = useMemo(() => {
    return recentlyUsed
      .map(id => allPresets.find(p => p.id === id))
      .filter((p): p is WallpaperConfig => p !== undefined)
      .slice(0, 10);
  }, [recentlyUsed, allPresets]);

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] flex flex-col justify-end bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={handleCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Chat Wallpaper Picker"
    >
      {/* ── BOTTOM SHEET CONTAINER ── */}
      <div 
        className="relative w-full max-w-4xl mx-auto h-[82vh] md:h-[80vh] rounded-t-3xl bg-gray-950 border-t border-x border-gray-800/80 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-250 ease-out"
        style={{ transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : 'none', transition: dragOffset === 0 ? 'transform 0.2s ease-out' : 'none' }}
        onClick={e => e.stopPropagation()}
      >
        
        {/* ── DRAG HANDLE ── */}
        <div 
          className="w-full py-2.5 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-12 h-1.5 bg-gray-700 hover:bg-gray-600 rounded-full transition-colors" />
        </div>

        {/* ── TOP NAVIGATION BAR ── */}
        <div className="px-6 pb-3 flex items-center justify-between border-b border-gray-900 bg-gray-950">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="p-2 rounded-xl bg-gray-900/80 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              aria-label="Close Wallpaper Picker"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-wide italic">Chat Wallpaper</h2>
              <p className="text-[10px] text-gray-500 font-semibold">Tap to live preview background before applying</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                handleCancel();
                setIsSettingsOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl border border-blue-500/30 bg-blue-600/20 text-[11px] font-bold text-blue-300 hover:bg-blue-600/30 transition-all flex items-center gap-1.5"
            >
              <Sparkles size={12} />
              <span>Font & Write-up Style</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded-xl border border-gray-800 bg-gray-900/50 text-[11px] font-bold text-gray-400 hover:text-red-400 hover:border-red-500/30 transition-all flex items-center gap-1.5"
            >
              <RotateCcw size={12} />
              <span>Restore Default</span>
            </button>
          </div>
        </div>

        {/* ── SEARCH & CATEGORY BAR ── */}
        <div className="px-6 pt-3 pb-2 space-y-3 bg-gray-950/80 border-b border-gray-900">
          
          {/* Search Input & Custom Upload Button */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Search wallpapers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-4 rounded-xl bg-gray-900 border border-gray-800 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-9 px-3.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 flex items-center gap-1.5 text-xs font-bold transition-all flex-shrink-0"
            >
              <Upload size={14} />
              <span>Upload Photo</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAdjustments(!showAdjustments)}
              className={`h-9 px-3 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-bold ${
                showAdjustments 
                  ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                  : 'border-gray-800 bg-gray-900 text-gray-400 hover:text-white'
              }`}
              title="Fine-tune blur & brightness"
            >
              <Sliders size={14} />
            </button>
          </div>

          {/* Horizontal Category Scroll Tabs */}
          {!searchQuery && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categoryTabs.map(tab => (
                <button
                  type="button"
                  key={tab}
                  onClick={() => setActiveCategory(tab)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider flex-shrink-0 transition-all border ${
                    activeCategory === tab
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-sm'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── FINE TUNING SLIDERS DRAWER ── */}
        {showAdjustments && (
          <div className="px-6 py-3 bg-gray-900/60 border-b border-gray-900 grid grid-cols-2 sm:grid-cols-4 gap-4 animate-in fade-in duration-150">
            {/* Blur */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold text-gray-300">
                <span>Blur</span>
                <span className="text-blue-400">{selectedConfig.blur || 0}px</span>
              </div>
              <input
                type="range" min="0" max="30"
                value={selectedConfig.blur || 0}
                onChange={e => handleAdjustmentChange('blur', parseInt(e.target.value))}
                className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            {/* Dimming */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold text-gray-300">
                <span>Dimming</span>
                <span className="text-blue-400">{selectedConfig.dimming || 0}%</span>
              </div>
              <input
                type="range" min="0" max="80"
                value={selectedConfig.dimming || 0}
                onChange={e => handleAdjustmentChange('dimming', parseInt(e.target.value))}
                className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            {/* Zoom */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold text-gray-300">
                <span>Zoom</span>
                <span className="text-blue-400">{(selectedConfig.zoom || 1).toFixed(1)}x</span>
              </div>
              <input
                type="range" min="1.0" max="2.0" step="0.1"
                value={selectedConfig.zoom || 1}
                onChange={e => handleAdjustmentChange('zoom', parseFloat(e.target.value))}
                className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            {/* Brightness */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold text-gray-300">
                <span>Brightness</span>
                <span className="text-blue-400">{selectedConfig.brightness || 100}%</span>
              </div>
              <input
                type="range" min="50" max="150"
                value={selectedConfig.brightness || 100}
                onChange={e => handleAdjustmentChange('brightness', parseInt(e.target.value))}
                className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>
        )}

        {/* ── WALLPAPER GALLERY GRID CONTENT ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 custom-scrollbar">
          
          {/* RECENTLY USED SECTION (Requirement 9: Last 10 wallpapers) */}
          {!searchQuery && recentPresets.length > 0 && activeCategory === 'All' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <History size={13} className="text-blue-400" />
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">Recently Used</h3>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 gap-2">
                {recentPresets.map(preset => (
                  <button
                    type="button"
                    key={`recent_${preset.id}`}
                    onClick={() => handleSelectWallpaper(preset)}
                    className={`relative aspect-square rounded-xl overflow-hidden border transition-all ${
                      selectedConfig.id === preset.id
                        ? 'border-blue-500 ring-2 ring-blue-500/30 scale-105'
                        : 'border-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <WallpaperEngine previewConfig={preset} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MAIN WALLPAPER PRESETS GRID */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredPresets.map(preset => {
              const isSelected = selectedConfig.id === preset.id;
              const isFav = favorites.includes(preset.id);
              
              return (
                <div
                  key={preset.id}
                  onClick={() => handleSelectWallpaper(preset)}
                  className={`group relative flex flex-col p-2.5 rounded-2xl border text-left overflow-hidden cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20 shadow-lg'
                      : 'border-gray-900 bg-gray-900/40 hover:border-gray-800 hover:bg-gray-900/70'
                  }`}
                >
                  {/* Thumbnail Frame */}
                  <div className="relative w-full h-28 rounded-xl overflow-hidden border border-white/5 mb-2 bg-slate-950 flex items-center justify-center">
                    <WallpaperEngine previewConfig={preset} />
                    {isSelected && (
                      <div className="absolute inset-0 bg-blue-600/20 backdrop-blur-xs flex items-center justify-center">
                        <span className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg">
                          <Check size={18} />
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info Footer */}
                  <div className="flex items-center justify-between w-full px-1">
                    <span className="text-xs font-bold text-white truncate pr-1">{preset.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(preset.id);
                      }}
                      className="p-1 rounded-lg text-gray-500 hover:text-yellow-400 transition-colors"
                      title={isFav ? 'Remove Favorite' : 'Save Favorite'}
                    >
                      <Star size={13} className={isFav ? 'fill-yellow-400 text-yellow-400' : ''} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredPresets.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-xs">
              No wallpapers found in this category.
            </div>
          )}
        </div>

        {/* ── STICKY ACTION BAR (Requirement 3) ── */}
        <div className="sticky bottom-0 z-20 px-6 py-4 border-t border-gray-900 bg-gray-950/95 backdrop-blur-md flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 py-3 px-4 rounded-xl border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white text-xs font-extrabold uppercase tracking-wider transition-all"
          >
            Cancel
          </button>
          
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-extrabold uppercase tracking-wider shadow-lg shadow-blue-500/20 hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
          >
            <Check size={16} />
            <span>Apply Wallpaper</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};
