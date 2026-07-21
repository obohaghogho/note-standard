import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  X, Search, Heart, History, Sliders, Upload, Check, 
  RefreshCw, ZoomIn, Sun, Layout, Eye, EyeOff, Moon 
} from 'lucide-react';
import { useWallpaper, WallpaperConfig, WALLPAPER_PRESETS } from '../../context/WallpaperContext';
import { WallpaperEngine } from './WallpaperEngine';
import { Button } from '../common/Button';
import toast from 'react-hot-toast';

interface WallpaperPickerProps {
  chatId: string | 'global';
  onClose: () => void;
}

export const WallpaperPicker: React.FC<WallpaperPickerProps> = ({ chatId, onClose }) => {
  const {
    presets,
    getWallpaper,
    saveWallpaper,
    resetWallpaper,
    favorites,
    recentlyUsed,
    toggleFavorite,
    addRecentlyUsed,
    autoThemeSettings,
    updateAutoThemeSettings
  } = useWallpaper();

  // Load active wallpaper settings for editing
  const currentSaved = useMemo(() => getWallpaper(chatId === 'global' ? undefined : chatId), [getWallpaper, chatId]);
  const [tempConfig, setTempConfig] = useState<WallpaperConfig>({ ...currentSaved });
  
  // Tabs and search filters
  const [activeCategory, setActiveCategory] = useState<string>('Minimal');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activePanel, setActivePanel] = useState<'picker' | 'adjust' | 'auto'>('picker');

  // Sync state if saved wallpaper changes
  useEffect(() => {
    setTempConfig({ ...currentSaved });
  }, [currentSaved]);

  // Categories list
  const categories = useMemo(() => {
    const list = new Set(presets.map(p => p.category));
    return Array.from(list);
  }, [presets]);

  // Filtered preset list
  const filteredPresets = useMemo(() => {
    return presets.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.category.toLowerCase().includes(searchQuery.toLowerCase());
      if (searchQuery) return matchesSearch;
      return p.category === activeCategory;
    });
  }, [presets, searchQuery, activeCategory]);

  // Handle custom local file upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File is too large! Please upload images under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setTempConfig(prev => ({
        ...prev,
        id: 'custom_upload',
        name: 'Custom Upload',
        type: 'image',
        customUrl: dataUrl
      }));
      toast.success('Custom wallpaper loaded in preview!');
    };
    reader.onerror = () => {
      toast.error('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  // Adjust config values
  const handleAdjustmentChange = (key: keyof WallpaperConfig, value: number) => {
    setTempConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Toggle favorite for currently previewed preset
  const handleFavoriteToggle = () => {
    toggleFavorite(tempConfig.id);
  };

  // Save current adjustments to local storage
  const handleApply = (target: 'current' | 'global') => {
    const finalChatId = target === 'global' ? 'global' : chatId;
    saveWallpaper(finalChatId, tempConfig);
    addRecentlyUsed(tempConfig.id);
    toast.success(`Wallpaper applied ${target === 'global' ? 'globally' : 'to this chat'} successfully!`);
    onClose();
  };

  const handleReset = () => {
    resetWallpaper(chatId);
    toast.success('Wallpaper reset to defaults');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="relative bg-gray-950 border border-gray-900 rounded-3xl shadow-2xl flex flex-col w-full max-w-5xl h-[85dvh] overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-900 bg-gray-950/80 backdrop-blur-xl z-10">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Sliders size={20} />
            </span>
            <div>
              <h3 className="text-md font-black text-white uppercase tracking-tight italic">Premium Wallpaper Engine</h3>
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Configure high-fps backgrounds and text styles</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="p-2 rounded-xl bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Split Pane */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* LEFT: Live Preview Mock (Simulated smartphone chat) */}
          <div className="flex-1 bg-gray-900/40 p-6 flex flex-col items-center justify-center border-r border-gray-900/60 relative overflow-hidden select-none">
            <div className="absolute top-4 left-6 z-10 flex gap-2">
              <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-950 text-blue-400 border border-gray-800">
                Live Preview
              </span>
              {favorites.includes(tempConfig.id) && (
                <span className="px-2.5 py-1.5 rounded-full bg-pink-500/10 text-pink-500 border border-pink-500/20">
                  <Heart size={10} className="fill-pink-500" />
                </span>
              )}
            </div>

            {/* Mock Chat Frame */}
            <div className="relative w-full max-w-[340px] h-[460px] rounded-3xl border border-gray-800 shadow-2xl bg-slate-950 overflow-hidden flex flex-col">
              
              {/* Wallpaper engine backdrop */}
              <WallpaperEngine previewConfig={tempConfig} />

              {/* Mock Chat Header */}
              <div className="relative z-10 px-4 py-3 bg-gray-950/70 backdrop-blur-md border-b border-white/5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-black text-blue-400 border border-blue-500/30">
                  NS
                </div>
                <div>
                  <div className="text-[11px] font-bold text-white leading-tight">NoteStandard Bot</div>
                  <div className="text-[9px] text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </div>
                </div>
              </div>

              {/* Mock Chat Messages */}
              <div className="relative z-10 flex-1 p-4 overflow-y-auto space-y-3 flex flex-col justify-end">
                <div className="self-start max-w-[80%] rounded-2xl rounded-tl-sm px-3.5 py-2 text-[11px] bg-slate-900/90 text-slate-100 border border-white/5 leading-relaxed">
                  Hi there! You can customize this chat room background using our premium shaders, animations, and typography!
                </div>
                <div className="self-end max-w-[80%] rounded-2xl rounded-tr-sm px-3.5 py-2 text-[11px] bg-blue-600/90 text-white leading-relaxed">
                  Wow, these mesh aurora animations look absolutely stunning! Smooth 60fps animations.
                </div>
              </div>

              {/* Mock Input Bar */}
              <div className="relative z-10 px-3 py-3.5 bg-gray-950/70 backdrop-blur-md border-t border-white/5 flex items-center gap-2">
                <div className="flex-1 h-8 rounded-xl bg-gray-900 border border-white/5 px-3 flex items-center text-[10px] text-gray-500">
                  Type a message...
                </div>
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                  <Check size={14} />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Library / Adjustment Sliders / Auto settings */}
          <div className="w-full lg:w-[480px] bg-gray-950/50 flex flex-col overflow-hidden">
            
            {/* Panel Toggles */}
            <div className="flex border-b border-gray-900 px-4 py-2 bg-gray-950">
              <button
                type="button"
                onClick={() => setActivePanel('picker')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest text-center transition-all border-b-2 ${
                  activePanel === 'picker' 
                    ? 'border-blue-500 text-blue-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                Wallpapers
              </button>
              <button
                type="button"
                onClick={() => setActivePanel('adjust')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest text-center transition-all border-b-2 ${
                  activePanel === 'adjust' 
                    ? 'border-blue-500 text-blue-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                Adjustments
              </button>
              <button
                type="button"
                onClick={() => setActivePanel('auto')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest text-center transition-all border-b-2 ${
                  activePanel === 'auto' 
                    ? 'border-blue-500 text-blue-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                Auto Settings
              </button>
            </div>

            {/* TAB PANEL 1: PICKER */}
            {activePanel === 'picker' && (
              <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-4">
                
                {/* Search / Upload Row */}
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input
                      type="text"
                      placeholder="Search wallpapers..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full h-10 pl-10 pr-4 rounded-xl bg-gray-900 border border-gray-800 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
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
                    className="h-10 px-4 rounded-xl border border-gray-800 bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white flex items-center gap-2 text-xs font-bold transition-all"
                  >
                    <Upload size={14} />
                    <span>Upload</span>
                  </button>
                </div>

                {/* Categories Scroll */}
                {!searchQuery && (
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                    {categories.map(cat => (
                      <button
                        type="button"
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider flex-shrink-0 transition-colors border ${
                          activeCategory === cat
                            ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                            : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* Wallpaper Grid */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
                  <div className="grid grid-cols-2 gap-3">
                    {filteredPresets.map(preset => (
                      <button
                        type="button"
                        key={preset.id}
                        onClick={() => setTempConfig({ ...preset, blur: tempConfig.blur, dimming: tempConfig.dimming })}
                        className={`group relative flex flex-col p-2.5 rounded-2xl border text-left overflow-hidden transition-all ${
                          tempConfig.id === preset.id 
                            ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10' 
                            : 'border-gray-900 bg-gray-900/30 hover:border-gray-800 hover:bg-gray-900/50'
                        }`}
                      >
                        <div className="relative w-full h-24 rounded-xl overflow-hidden border border-white/5 mb-2 bg-slate-950 flex items-center justify-center">
                          {/* Mini render inside block */}
                          <WallpaperEngine previewConfig={preset} />
                        </div>
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[11px] font-bold text-white truncate pr-2">{preset.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(preset.id);
                            }}
                            className={`p-1.5 rounded-lg border text-gray-500 hover:text-white transition-colors bg-gray-950/40 border-white/5`}
                          >
                            <Heart size={11} className={favorites.includes(preset.id) ? 'fill-pink-500 text-pink-500' : ''} />
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>

                  {filteredPresets.length === 0 && (
                    <div className="text-center py-12 text-gray-500 text-xs">
                      No wallpapers found matching your search.
                    </div>
                  )}

                  {/* Recently Used & Favorites section */}
                  {recentlyUsed.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1 mb-2">Recently Used</h4>
                      <div className="grid grid-cols-4 gap-2">
                        {recentlyUsed.map(id => {
                          const p = presets.find(x => x.id === id);
                          if (!p) return null;
                          return (
                            <button
                              type="button"
                              key={id}
                              onClick={() => setTempConfig({ ...p })}
                              className="relative w-full aspect-square rounded-xl overflow-hidden border border-white/5 hover:border-blue-500 transition-colors"
                            >
                              <WallpaperEngine previewConfig={p} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB PANEL 2: ADJUSTMENTS */}
            {activePanel === 'adjust' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                
                {/* Blur */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span>Blur Strength</span>
                    <span className="text-gray-400">{tempConfig.blur}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    value={tempConfig.blur}
                    onChange={e => handleAdjustmentChange('blur', parseInt(e.target.value))}
                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Dimming */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span>Wallpaper Dimming</span>
                    <span className="text-gray-400">{tempConfig.dimming}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={tempConfig.dimming}
                    onChange={e => handleAdjustmentChange('dimming', parseInt(e.target.value))}
                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Zoom */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span>Zoom Scale</span>
                    <span className="text-gray-400">{tempConfig.zoom.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="2.0"
                    step="0.1"
                    value={tempConfig.zoom}
                    onChange={e => handleAdjustmentChange('zoom', parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Speed (Animations only) */}
                {!['color', 'amoled', 'doodle', 'image'].includes(tempConfig.type) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span>Animation Speed</span>
                      <span className="text-gray-400">{tempConfig.speed.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="3.0"
                      step="0.1"
                      value={tempConfig.speed}
                      onChange={e => handleAdjustmentChange('speed', parseFloat(e.target.value))}
                      className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                )}

                {/* Advanced Sliders Toggle */}
                <div className="pt-4 border-t border-gray-900 space-y-4">
                  
                  {/* Brightness */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                      <span>Brightness</span>
                      <span>{tempConfig.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={tempConfig.brightness}
                      onChange={e => handleAdjustmentChange('brightness', parseInt(e.target.value))}
                      className="w-full h-1 bg-gray-900 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                      <span>Contrast</span>
                      <span>{tempConfig.contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={tempConfig.contrast}
                      onChange={e => handleAdjustmentChange('contrast', parseInt(e.target.value))}
                      className="w-full h-1 bg-gray-900 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  {/* Saturation */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                      <span>Saturation</span>
                      <span>{tempConfig.saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={tempConfig.saturation}
                      onChange={e => handleAdjustmentChange('saturation', parseInt(e.target.value))}
                      className="w-full h-1 bg-gray-900 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  {/* Custom URL Option */}
                  <div className="space-y-2 pt-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Custom Image or Video URL</label>
                    <input
                      type="text"
                      placeholder="Paste link to image or loop video..."
                      value={tempConfig.type === 'image' || tempConfig.type === 'video' ? tempConfig.customUrl || '' : ''}
                      onChange={e => {
                        const val = e.target.value;
                        const isVideo = val.endsWith('.mp4') || val.endsWith('.webm') || val.includes('video');
                        setTempConfig(prev => ({
                          ...prev,
                          id: 'custom_url',
                          name: 'Custom URL',
                          type: isVideo ? 'video' : 'image',
                          customUrl: val
                        }));
                      }}
                      className="w-full h-10 px-4 rounded-xl bg-gray-900 border border-gray-800 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB PANEL 3: AUTOMATIC SWITCHING */}
            {activePanel === 'auto' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                
                {/* Auto Switch Master Toggle */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-900/40 border border-gray-900">
                  <div>
                    <h4 className="text-xs font-black text-white uppercase tracking-tight italic">Automatic Mode</h4>
                    <p className="text-[9px] text-gray-500 uppercase tracking-wide mt-1 font-semibold">Switch backgrounds dynamically based on environmental conditions</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAutoThemeSettings({ enabled: !autoThemeSettings.enabled })}
                    className={`w-12 h-6 rounded-full p-1 transition-all ${
                      autoThemeSettings.enabled ? 'bg-blue-600 flex justify-end' : 'bg-gray-800 flex justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-md" />
                  </button>
                </div>

                {autoThemeSettings.enabled && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    
                    {/* Time-Based override */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl border border-gray-900 bg-gray-950/40">
                      <div className="flex gap-3">
                        <span className="text-gray-400 mt-0.5"><Sun size={15} /></span>
                        <div>
                          <h5 className="text-[11px] font-bold text-white">Time of Day (Sun & Moon)</h5>
                          <p className="text-[9px] text-gray-500 mt-0.5">Applies light wallpaper by day and dark at night</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={autoThemeSettings.timeBased}
                        onChange={e => updateAutoThemeSettings({ timeBased: e.target.checked })}
                        className="rounded border-gray-800 text-blue-600 focus:ring-blue-500/20 bg-gray-900"
                      />
                    </div>

                    {/* Season-Based override */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl border border-gray-900 bg-gray-950/40">
                      <div className="flex gap-3">
                        <span className="text-gray-400 mt-0.5"><Layout size={15} /></span>
                        <div>
                          <h5 className="text-[11px] font-bold text-white">Seasonal Visuals</h5>
                          <p className="text-[9px] text-gray-500 mt-0.5">Automatically trigger holiday or winter presets</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={autoThemeSettings.seasonBased}
                        onChange={e => updateAutoThemeSettings({ seasonBased: e.target.checked })}
                        className="rounded border-gray-800 text-blue-600 focus:ring-blue-500/20 bg-gray-900"
                      />
                    </div>

                    {/* Preferences Selection */}
                    <div className="space-y-3 pt-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Light Mode Background</label>
                      <select
                        value={autoThemeSettings.lightWallpaperId}
                        onChange={e => updateAutoThemeSettings({ lightWallpaperId: e.target.value })}
                        className="w-full h-10 px-3 rounded-xl bg-gray-900 border border-gray-800 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {presets.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Dark Mode Background</label>
                      <select
                        value={autoThemeSettings.darkWallpaperId}
                        onChange={e => updateAutoThemeSettings({ darkWallpaperId: e.target.value })}
                        className="w-full h-10 px-3 rounded-xl bg-gray-900 border border-gray-800 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {presets.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                  </div>
                )}
              </div>
            )}

            {/* Actions Panel */}
            <div className="p-6 border-t border-gray-900 bg-gray-950 flex flex-col gap-3">
              <div className="flex gap-3">
                <Button
                  onClick={() => handleApply('current')}
                  className="flex-1 h-12 font-black rounded-2xl text-[10px] uppercase tracking-wider"
                >
                  Apply to this Chat
                </Button>
                <Button
                  onClick={() => handleApply('global')}
                  className="flex-1 h-12 font-black rounded-2xl text-[10px] uppercase tracking-wider bg-gray-900 border border-gray-800 text-white hover:bg-gray-800"
                >
                  Apply Globally
                </Button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 py-2 text-[10px] font-bold text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-wider text-center"
                >
                  Restore Defaults
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
