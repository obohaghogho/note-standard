import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Palette, 
  Type, 
  Sliders, 
  Sparkles, 
  RotateCcw, 
  ShoppingBag, 
  Check, 
  Eye,
  Sun,
  Moon,
  Zap,
  Volume2
} from 'lucide-react';
import { useChatTheme } from '../../context/ChatThemeContext';
import type { FontChoice, WallpaperCategory } from '../../types/chatTheme';

export const ChatThemeSettingsModal: React.FC = () => {
  const { 
    activeTheme, 
    customizer, 
    availableThemes, 
    isSettingsOpen, 
    setIsSettingsOpen, 
    setIsGalleryOpen, 
    setTheme, 
    updateWallpaper, 
    updateBubble, 
    updateTypography, 
    updateCustomizer,
    resetToDefault 
  } = useChatTheme();

  const [activeTab, setActiveTab] = useState<'themes' | 'wallpaper' | 'bubbles' | 'typography' | 'performance'>('themes');

  if (!isSettingsOpen) return null;

  const fontOptions: { id: FontChoice; label: string; preview: string }[] = [
    { id: 'inter', label: 'Modern Sans (Inter)', preview: 'The quick brown fox' },
    { id: 'rounded', label: 'Rounded Sans (Quicksand)', preview: 'The quick brown fox' },
    { id: 'serif', label: 'Elegant Serif (Playfair)', preview: 'The quick brown fox' },
    { id: 'handwriting', label: 'Handwriting (Caveat)', preview: 'The quick brown fox' },
    { id: 'minimal', label: 'Minimal Tech (Space Grotesk)', preview: 'The quick brown fox' },
    { id: 'monospace', label: 'Monospace (Fira Code)', preview: 'The quick brown fox' },
    { id: 'chat_classic', label: 'Chat Classic (System)', preview: 'The quick brown fox' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* ─── Header ─── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Palette size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 leading-tight">Chat Appearance & Themes</h2>
              <p className="text-xs text-slate-400">Customize wallpapers, bubbles, typography & animations</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsGalleryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-xs font-semibold transition-all"
            >
              <ShoppingBag size={14} />
              <span>Theme Gallery</span>
            </button>

            <button
              onClick={resetToDefault}
              title="Reset to default theme"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-all"
            >
              <RotateCcw size={16} />
            </button>

            <button
              onClick={() => setIsSettingsOpen(false)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── Main Grid Layout (Preview + Controls) ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          
          {/* ── Left Column: Live Chat Preview ── */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/60 p-5 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Eye size={13} className="text-blue-400" />
                  Live Preview
                </span>
                <span className="text-[11px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {activeTheme.name}
                </span>
              </div>

              {/* Live Preview Container */}
              <div 
                className="relative rounded-xl p-4 overflow-hidden border border-slate-800 shadow-inner flex flex-col gap-3 min-h-[300px]"
                style={{
                  background: customizer.wallpaper.gradient || customizer.wallpaper.solidColor || activeTheme.colors.bgGradient || activeTheme.colors.bgSolid || '#0f172a',
                  fontFamily: customizer.typography.fontFamily === 'inter' ? 'Inter, sans-serif' : customizer.typography.fontFamily === 'serif' ? 'Playfair Display, serif' : 'Quicksand, sans-serif',
                }}
              >
                {/* Incoming Mock Bubble */}
                <div className="flex justify-start">
                  <div 
                    className="p-3 shadow-md transition-all max-w-[80%]"
                    style={{
                      backgroundColor: activeTheme.colors.receivedBubbleBg,
                      color: activeTheme.colors.receivedBubbleText,
                      borderRadius: `${customizer.bubble.borderRadius}px`,
                      fontSize: `${customizer.typography.fontSize}px`,
                      lineHeight: customizer.typography.lineHeight,
                      letterSpacing: `${customizer.typography.letterSpacing}px`,
                      opacity: customizer.bubble.opacity,
                      backdropFilter: customizer.bubble.glassmorphism ? `blur(${customizer.bubble.blur}px)` : undefined,
                    }}
                  >
                    Hey! Check out NoteStandard's new premium chat theme engine. 🎨✨
                    <div className="text-[10px] opacity-60 text-right mt-1" style={{ color: activeTheme.colors.timestampReceived }}>
                      10:42 AM
                    </div>
                  </div>
                </div>

                {/* Outgoing Mock Bubble */}
                <div className="flex justify-end">
                  <div 
                    className="p-3 shadow-md transition-all max-w-[80%]"
                    style={{
                      background: activeTheme.colors.sentBubbleBg,
                      color: activeTheme.colors.sentBubbleText,
                      borderRadius: `${customizer.bubble.borderRadius}px`,
                      fontSize: `${customizer.typography.fontSize}px`,
                      lineHeight: customizer.typography.lineHeight,
                      letterSpacing: `${customizer.typography.letterSpacing}px`,
                      opacity: customizer.bubble.opacity,
                      backdropFilter: customizer.bubble.glassmorphism ? `blur(${customizer.bubble.blur}px)` : undefined,
                    }}
                  >
                    Wow, WhatsApp-level chat wallpapers & 60 FPS animations look incredible! 🚀
                    <div className="text-[10px] opacity-75 text-right mt-1" style={{ color: activeTheme.colors.timestampSent }}>
                      10:43 AM ✓✓
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 mt-4 text-center">
              Changes apply live instantly across all chats.
            </p>
          </div>

          {/* ── Right Column: Tabbed Controls ── */}
          <div className="lg:col-span-7 flex flex-col flex-1 overflow-hidden bg-slate-900/40">
            
            {/* Tab Bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800 overflow-x-auto">
              {[
                { id: 'themes', label: 'Themes', icon: Palette },
                { id: 'wallpaper', label: 'Wallpaper', icon: Sun },
                { id: 'bubbles', label: 'Bubbles', icon: Sliders },
                { id: 'typography', label: 'Typography', icon: Type },
                { id: 'performance', label: 'Animations', icon: Zap },
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-all border-b-2 ${
                      isActive
                        ? 'text-blue-400 border-blue-500 bg-blue-500/10'
                        : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Contents */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">

              {/* ── Tab 1: Preset Themes Grid ── */}
              {activeTab === 'themes' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Choose Theme Preset</h3>
                    <span className="text-xs text-slate-500">{availableThemes.length} installed</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {availableThemes.map(t => {
                      const isSelected = activeTheme.id === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => setTheme(t.id)}
                          className={`relative rounded-xl p-3 border cursor-pointer transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20'
                              : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/40'
                          }`}
                        >
                          <div 
                            className="h-16 rounded-lg mb-2 overflow-hidden relative shadow-inner border border-white/10 flex items-center justify-center p-2"
                            style={{
                              background: t.wallpaper.gradient || t.wallpaper.solidColor || t.colors.bgGradient || t.colors.bgSolid || '#0f172a'
                            }}
                          >
                            <div className="w-full flex flex-col gap-1">
                              <div className="w-3/4 h-2.5 rounded-full" style={{ background: t.colors.receivedBubbleBg }} />
                              <div className="w-3/4 h-2.5 rounded-full self-end" style={{ background: t.colors.sentBubbleBg }} />
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-200 truncate">{t.name}</span>
                            {isSelected && <Check size={14} className="text-blue-400 flex-shrink-0" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Tab 2: Wallpaper Controls ── */}
              {activeTab === 'wallpaper' && (
                <div className="space-y-5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Wallpaper Fine-Tuning</h3>

                  {/* Brightness */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Brightness</span>
                      <span className="text-blue-400 font-mono">{customizer.wallpaper.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="150"
                      value={customizer.wallpaper.brightness}
                      onChange={(e) => updateWallpaper({ brightness: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>

                  {/* Contrast */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Contrast</span>
                      <span className="text-blue-400 font-mono">{customizer.wallpaper.contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={customizer.wallpaper.contrast}
                      onChange={(e) => updateWallpaper({ contrast: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>

                  {/* Saturation */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Saturation</span>
                      <span className="text-blue-400 font-mono">{customizer.wallpaper.saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={customizer.wallpaper.saturation}
                      onChange={(e) => updateWallpaper({ saturation: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>

                  {/* Blur */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Wallpaper Blur</span>
                      <span className="text-blue-400 font-mono">{customizer.wallpaper.blur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      value={customizer.wallpaper.blur}
                      onChange={(e) => updateWallpaper({ blur: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* ── Tab 3: Bubble Styling ── */}
              {activeTab === 'bubbles' && (
                <div className="space-y-5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Message Bubble Geometry</h3>

                  {/* Corner Radius */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Corner Roundness</span>
                      <span className="text-blue-400 font-mono">{customizer.bubble.borderRadius}px</span>
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="28"
                      value={customizer.bubble.borderRadius}
                      onChange={(e) => updateBubble({ borderRadius: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>

                  {/* Bubble Opacity */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Bubble Opacity</span>
                      <span className="text-blue-400 font-mono">{Math.round(customizer.bubble.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.3"
                      max="1.0"
                      step="0.05"
                      value={customizer.bubble.opacity}
                      onChange={(e) => updateBubble({ opacity: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>

                  {/* Glassmorphism Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div>
                      <span className="text-xs font-semibold text-slate-200">Frosted Glass Effect</span>
                      <p className="text-[11px] text-slate-400">Applies backdrop blur to message bubbles</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={customizer.bubble.glassmorphism}
                      onChange={(e) => updateBubble({ glassmorphism: e.target.checked })}
                      className="w-4 h-4 accent-blue-500 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* ── Tab 4: Typography ── */}
              {activeTab === 'typography' && (
                <div className="space-y-5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Font & Spacing</h3>

                  {/* Font Picker */}
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">Select Font Family</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {fontOptions.map(font => (
                        <button
                          key={font.id}
                          onClick={() => updateTypography({ fontFamily: font.id })}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            customizer.typography.fontFamily === font.id
                              ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                              : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 text-slate-300'
                          }`}
                        >
                          <div className="text-xs font-bold mb-0.5">{font.label}</div>
                          <div className="text-[11px] opacity-70 truncate">{font.preview}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Font Size</span>
                      <span className="text-blue-400 font-mono">{customizer.typography.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="12"
                      max="20"
                      value={customizer.typography.fontSize}
                      onChange={(e) => updateTypography({ fontSize: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>

                  {/* Bubble Spacing */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Message Spacing</span>
                      <span className="text-blue-400 font-mono">{customizer.typography.bubbleSpacing}px</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="16"
                      value={customizer.typography.bubbleSpacing}
                      onChange={(e) => updateTypography({ bubbleSpacing: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* ── Tab 5: Animations & Performance ── */}
              {activeTab === 'performance' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Performance & Animations</h3>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div>
                      <span className="text-xs font-semibold text-slate-200">Enable Background Animations</span>
                      <p className="text-[11px] text-slate-400">Renders 60 FPS particles, waves & stars</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={customizer.enableAnimations}
                      onChange={(e) => updateCustomizer({ enableAnimations: e.target.checked })}
                      className="w-4 h-4 accent-blue-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div>
                      <span className="text-xs font-semibold text-slate-200">Low Performance Mode</span>
                      <p className="text-[11px] text-slate-400">Disables canvas animations for battery saving</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={customizer.lowPerformanceMode}
                      onChange={(e) => updateCustomizer({ lowPerformanceMode: e.target.checked })}
                      className="w-4 h-4 accent-blue-500 cursor-pointer"
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};
