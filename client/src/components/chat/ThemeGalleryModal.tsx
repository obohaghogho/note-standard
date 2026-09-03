import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Check, Sparkles, Tag, ShieldCheck, RefreshCw } from 'lucide-react';
import { useChatTheme } from '../../context/ChatThemeContext';
import { ThemeManifestService } from '../../services/ThemeManifestService';
import type { ChatThemePackage, WallpaperCategory } from '../../types/chatTheme';

export const ThemeGalleryModal: React.FC = () => {
  const { isGalleryOpen, setIsGalleryOpen, setTheme, availableThemes } = useChatTheme();
  const [galleryThemes, setGalleryThemes] = useState<ChatThemePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isGalleryOpen) return;

    window.history.pushState({ modal: 'themeGallery' }, '');

    const handlePopState = () => {
      setIsGalleryOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isGalleryOpen, setIsGalleryOpen]);

  useEffect(() => {
    if (!isGalleryOpen) return;
    let isMounted = true;
    setLoading(true);

    ThemeManifestService.fetchOnlineGalleryManifest()
      .then(manifest => {
        if (isMounted) {
          setGalleryThemes(manifest.themes);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('[ThemeGalleryModal] Manifest fetch error:', err);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [isGalleryOpen]);

  if (!isGalleryOpen) return null;

  const categories: { id: string; label: string }[] = [
    { id: 'all', label: 'All Themes' },
    { id: 'gradient', label: 'Gradients' },
    { id: 'glass', label: 'Glassmorphism' },
    { id: 'neon', label: 'Neon' },
    { id: 'space', label: 'Space' },
    { id: 'nature', label: 'Nature' },
    { id: 'amoled', label: 'AMOLED' },
    { id: 'luxury', label: 'Luxury' },
    { id: 'minimal', label: 'Minimal' },
  ];

  const filteredThemes = selectedCategory === 'all'
    ? galleryThemes
    : galleryThemes.filter(t => t.category === selectedCategory);

  const handleInstallAndApply = (theme: ChatThemePackage) => {
    setDownloadingId(theme.id);
    setTimeout(() => {
      ThemeManifestService.saveDownloadedTheme(theme);
      setTheme(theme.id);
      setDownloadingId(null);
      setIsGalleryOpen(false);
    }, 350);
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsGalleryOpen(false);
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] h-[92vh] sm:h-auto sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={() => setIsGalleryOpen(false)}
              className="sm:hidden p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all flex-shrink-0"
              aria-label="Close Gallery"
              title="Close"
            >
              <X size={20} />
            </button>

            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 flex-shrink-0">
              <Sparkles size={18} />
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-lg font-bold text-slate-100 leading-tight truncate">Online Theme Gallery</h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate hidden xs:block">Browse, download & hot-swap theme packages instantly</p>
            </div>
          </div>

          <button
            onClick={() => setIsGalleryOpen(false)}
            className="hidden sm:flex p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-all flex-shrink-0"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 px-3 sm:px-6 py-2.5 sm:py-3 border-b border-slate-800 overflow-x-auto bg-slate-950/40 flex-shrink-0">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
                selectedCategory === cat.id
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <RefreshCw size={24} className="animate-spin text-purple-400" />
              <span className="text-xs">Fetching theme marketplace manifest…</span>
            </div>
          ) : filteredThemes.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-xs">
              No themes available in this category.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredThemes.map(theme => {
                const isInstalled = availableThemes.some(t => t.id === theme.id);
                const isDownloading = downloadingId === theme.id;

                return (
                  <div 
                    key={theme.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 flex flex-col justify-between hover:border-purple-500/50 transition-all group shadow-lg"
                  >
                    <div>
                      {/* Theme Preview Card */}
                      <div 
                        className="h-28 rounded-xl mb-3 p-3 relative overflow-hidden shadow-inner border border-white/10 flex flex-col justify-between"
                        style={{
                          background: theme.wallpaper.gradient || theme.wallpaper.solidColor || theme.colors.bgGradient || theme.colors.bgSolid || '#0f172a'
                        }}
                      >
                        <div className="flex justify-between items-center z-10">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/40 text-white backdrop-blur-md">
                            v{theme.version}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/80 text-white backdrop-blur-md flex items-center gap-1">
                            <ShieldCheck size={10} /> Verified
                          </span>
                        </div>

                        {/* Sample Bubbles inside preview */}
                        <div className="flex flex-col gap-1.5 z-10">
                          <div className="w-2/3 p-1.5 text-[10px] rounded-lg shadow-sm" style={{ background: theme.colors.receivedBubbleBg, color: theme.colors.receivedBubbleText }}>
                            Hey there!
                          </div>
                          <div className="w-2/3 p-1.5 text-[10px] rounded-lg shadow-sm self-end" style={{ background: theme.colors.sentBubbleBg, color: theme.colors.sentBubbleText }}>
                            Looks amazing!
                          </div>
                        </div>
                      </div>

                      {/* Info */}
                      <h3 className="text-sm font-bold text-slate-100 mb-1 group-hover:text-purple-300 transition-colors">
                        {theme.name}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                        {theme.description}
                      </p>
                    </div>

                    {/* Footer Action */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">By {theme.author}</span>

                      <button
                        disabled={isDownloading}
                        onClick={() => handleInstallAndApply(theme)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50"
                      >
                        {isDownloading ? (
                          <>
                            <RefreshCw size={13} className="animate-spin" />
                            <span>Installing…</span>
                          </>
                        ) : isInstalled ? (
                          <>
                            <Check size={13} />
                            <span>Apply</span>
                          </>
                        ) : (
                          <>
                            <Download size={13} />
                            <span>Get Theme</span>
                          </>
                        )}
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
};
