import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';

export interface WallpaperConfig {
  id: string;
  name: string;
  category: string;
  type: 'color' | 'gradient' | 'aurora' | 'mesh' | 'grid' | 'waves' | 'particles' | 'stars' | 'fireflies' | 'rain' | 'snow' | 'doodle' | 'amoled' | 'image' | 'video' | 'glass';
  colors?: string[]; // array of hex/rgb strings for gradient/mesh colors
  customUrl?: string; // user custom uploaded image/video url
  videoUrl?: string; // premium loop video url
  blur: number; // 0 to 40px
  brightness: number; // 50 to 150%
  contrast: number; // 50 to 150%
  saturation: number; // 50 to 150%
  dimming: number; // 0 to 100%
  zoom: number; // 1 to 2
  opacity: number; // 0 to 1
  speed: number; // 0.1 to 3 (animation speed multiplier)
  particleCount: number; // 10 to 150 (particles, stars, snow etc.)
  fontTheme?: 'sans' | 'serif' | 'mono' | 'round' | 'royal' | 'cursive' | 'typewriter' | 'fun' | string;
}

export interface AutoThemeSettings {
  enabled: boolean;
  lightWallpaperId: string;
  darkWallpaperId: string;
  timeBased: boolean; // switch based on hour
  seasonBased: boolean; // switch based on month/season
  batterySaverDimming: boolean; // dim/disable animation when low battery
}

interface WallpaperContextProps {
  presets: WallpaperConfig[];
  getWallpaper: (chatId?: string) => WallpaperConfig;
  saveWallpaper: (chatId: string | 'global', config: Partial<WallpaperConfig>) => void;
  resetWallpaper: (chatId: string | 'global') => void;
  favorites: string[];
  recentlyUsed: string[];
  toggleFavorite: (id: string) => void;
  addRecentlyUsed: (id: string) => void;
  autoThemeSettings: AutoThemeSettings;
  updateAutoThemeSettings: (settings: Partial<AutoThemeSettings>) => void;
  isBatterySaverActive: boolean;
  isReducedMotionActive: boolean;
}

const WallpaperContext = createContext<WallpaperContextProps | undefined>(undefined);

// ─── PREMIUM PRODUCTION-READY WALLPAPER PRESETS ───
export const WALLPAPER_PRESETS: WallpaperConfig[] = [
  // 1. AMOLED Category
  {
    id: 'amoled_black',
    name: 'Pure AMOLED Black',
    category: 'AMOLED',
    type: 'amoled',
    colors: ['#000000'],
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 0,
    zoom: 1,
    opacity: 1,
    speed: 1,
    particleCount: 0,
  },
  // 2. Aurora Category
  {
    id: 'aurora_cosmic',
    name: 'Cosmic Aurora',
    category: 'Aurora',
    type: 'aurora',
    colors: ['#05060f', '#3b82f6', '#a855f7', '#1e1b4b', '#311042'],
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 30,
    zoom: 1,
    opacity: 1,
    speed: 1,
    particleCount: 50,
  },
  // 3. Neon Category
  {
    id: 'neon_matrix',
    name: 'Cyberpunk Grid',
    category: 'Neon',
    type: 'grid',
    colors: ['#04050a', '#ec4899', '#6366f1'],
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 20,
    zoom: 1,
    opacity: 1,
    speed: 0.8,
    particleCount: 0,
  },
  // 4. Nature Category
  {
    id: 'forest_rain',
    name: 'Rainforest Fireflies',
    category: 'Nature',
    type: 'fireflies',
    colors: ['#010f0b', '#064e3b', '#10b981', '#022c22'],
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 15,
    zoom: 1,
    opacity: 1,
    speed: 1,
    particleCount: 40,
  },
  // 5. Space Category
  {
    id: 'space_nebula',
    name: 'Deep Stellar Field',
    category: 'Space',
    type: 'stars',
    colors: ['#030308', '#0c0f24', '#ffffff'],
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 10,
    zoom: 1,
    opacity: 1,
    speed: 0.5,
    particleCount: 100,
  },
  // 6. Gradient Category
  {
    id: 'sunset_glow',
    name: 'Sunset Dream',
    category: 'Gradient',
    type: 'particles',
    colors: ['#14050d', '#f97316', '#db2777', '#3b0764'],
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 25,
    zoom: 1,
    opacity: 1,
    speed: 1.2,
    particleCount: 60,
  },
  // 7. Ocean Category
  {
    id: 'ocean_waves',
    name: 'Abyssal Waves',
    category: 'Ocean',
    type: 'waves',
    colors: ['#020b14', '#0c4a6e', '#0369a1', '#075985'],
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 15,
    zoom: 1,
    opacity: 1,
    speed: 0.6,
    particleCount: 3, // waves count
  },
  // 8. Abstract Category
  {
    id: 'lavender_cloud',
    name: 'Lavender Clouds',
    category: 'Abstract',
    type: 'mesh',
    colors: ['#0d081b', '#8b5cf6', '#ec4899', '#1e1b4b'],
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 30,
    zoom: 1,
    opacity: 1,
    speed: 0.7,
    particleCount: 0,
  },
  // 9. Minimal / Doodle Category
  {
    id: 'doodle_dark',
    name: 'WhatsApp Doodle Dark',
    category: 'Minimal',
    type: 'doodle',
    colors: ['#0f172a', 'rgba(255,255,255,0.025)'], // base background, stroke color
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 10,
    zoom: 1,
    opacity: 1,
    speed: 0,
    particleCount: 0,
  },
  {
    id: 'doodle_light',
    name: 'WhatsApp Doodle Light',
    category: 'Minimal',
    type: 'doodle',
    colors: ['#efeae2', 'rgba(0,0,0,0.03)'], // base background, stroke color
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 0,
    zoom: 1,
    opacity: 1,
    speed: 0,
    particleCount: 0,
  },
  // 10. Nature / Winter Category
  {
    id: 'winter_snow',
    name: 'Snowy Solitude',
    category: 'Nature',
    type: 'snow',
    colors: ['#090d16', '#1e293b', '#ffffff'],
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 20,
    zoom: 1,
    opacity: 1,
    speed: 1,
    particleCount: 70,
  },
  // 11. Minimal Category
  {
    id: 'pure_slate',
    name: 'Minimalist Slate',
    category: 'Minimal',
    type: 'color',
    colors: ['#1e293b'],
    blur: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 0,
    zoom: 1,
    opacity: 1,
    speed: 0,
    particleCount: 0,
  },
  // 12. Glassmorphism Category
  {
    id: 'glass_mesh',
    name: 'Frozen Crystal',
    category: 'Abstract',
    type: 'glass',
    colors: ['#0f1220', '#4f46e5', '#db2777'],
    blur: 15,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dimming: 20,
    zoom: 1,
    opacity: 1,
    speed: 1,
    particleCount: 0,
  }
];

export const WallpaperProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  
  // Scope keys per user so multi-session support does not pollute settings
  const storagePrefix = useMemo(() => {
    return user?.id ? `ns_wp_${user.id}_` : 'ns_wp_anon_';
  }, [user?.id]);

  // ─── STATE MANAGEMENT WITH CROSS-REFRESH PERSISTENCE ───
  const [globalWallpaper, setGlobalWallpaper] = useState<WallpaperConfig>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}global`) || localStorage.getItem('ns_wp_global');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse global wallpaper preference:', e);
    }
    const savedFont = localStorage.getItem('chat_font_theme');
    const base = WALLPAPER_PRESETS.find(p => p.id === 'doodle_dark') || WALLPAPER_PRESETS[0];
    return savedFont ? { ...base, fontTheme: savedFont } : base;
  });

  const [chatWallpapers, setChatWallpapers] = useState<Record<string, WallpaperConfig>>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}chats`) || localStorage.getItem('ns_wp_chats');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse chat wallpaper preferences:', e);
    }
    return {};
  });

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}favorites`) || localStorage.getItem('ns_wp_favorites');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse wallpaper favorites:', e);
    }
    return [];
  });

  const [recentlyUsed, setRecentlyUsed] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}recently_used`) || localStorage.getItem('ns_wp_recently_used');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse recently used wallpapers:', e);
    }
    return [];
  });

  const [autoThemeSettings, setAutoThemeSettings] = useState<AutoThemeSettings>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}auto_theme`) || localStorage.getItem('ns_wp_auto_theme');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse auto theme settings:', e);
    }
    return {
      enabled: false,
      lightWallpaperId: 'doodle_light',
      darkWallpaperId: 'doodle_dark',
      timeBased: true,
      seasonBased: false,
      batterySaverDimming: true
    };
  });

  // Re-sync from localStorage when storagePrefix resolves after user auth
  useEffect(() => {
    try {
      const savedGlobal = localStorage.getItem(`${storagePrefix}global`) || localStorage.getItem('ns_wp_global');
      if (savedGlobal) {
        const parsed = JSON.parse(savedGlobal);
        if (parsed && parsed.id) setGlobalWallpaper(parsed);
      }

      const savedChats = localStorage.getItem(`${storagePrefix}chats`) || localStorage.getItem('ns_wp_chats');
      if (savedChats) {
        const parsed = JSON.parse(savedChats);
        if (parsed) setChatWallpapers(parsed);
      }

      const savedFavs = localStorage.getItem(`${storagePrefix}favorites`) || localStorage.getItem('ns_wp_favorites');
      if (savedFavs) {
        const parsed = JSON.parse(savedFavs);
        if (Array.isArray(parsed)) setFavorites(parsed);
      }

      const savedRecent = localStorage.getItem(`${storagePrefix}recently_used`) || localStorage.getItem('ns_wp_recently_used');
      if (savedRecent) {
        const parsed = JSON.parse(savedRecent);
        if (Array.isArray(parsed)) setRecentlyUsed(parsed);
      }

      const savedAuto = localStorage.getItem(`${storagePrefix}auto_theme`) || localStorage.getItem('ns_wp_auto_theme');
      if (savedAuto) {
        const parsed = JSON.parse(savedAuto);
        if (parsed) setAutoThemeSettings(parsed);
      }
    } catch (e) {
      console.warn('Failed to sync wallpaper settings on prefix update:', e);
    }
  }, [storagePrefix]);

  // ─── PERF & SYSTEM TRIGGERS ───
  const [isBatterySaverActive, setIsBatterySaverActive] = useState(false);
  const [isReducedMotionActive, setIsReducedMotionActive] = useState(false);

  // Monitor battery saver (using standard battery status API)
  useEffect(() => {
    const monitorBattery = async () => {
      if ('getBattery' in navigator) {
        try {
          const battery = await (navigator as any).getBattery();
          const checkStatus = () => {
            // Standard triggers: charging disables saver, discharging below 20% or lowPowerMode flags it
            const lowBattery = battery.level <= 0.20 && !battery.charging;
            setIsBatterySaverActive(lowBattery);
          };
          checkStatus();
          battery.addEventListener('levelchange', checkStatus);
          battery.addEventListener('chargingchange', checkStatus);
          return () => {
            battery.removeEventListener('levelchange', checkStatus);
            battery.removeEventListener('chargingchange', checkStatus);
          };
        } catch {
          // ignore
        }
      }
    };
    
    // Check save data headers
    if ('connection' in navigator) {
      const conn = (navigator as any).connection;
      if (conn.saveData) {
        setIsBatterySaverActive(true);
      }
    }
    
    monitorBattery();
  }, []);

  // Monitor prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotionActive(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => {
      setIsReducedMotionActive(e.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // ─── CORE GET / SET / SAVE LOGIC ───
  const getWallpaper = useCallback((chatId?: string): WallpaperConfig => {
    // 1. Check if auto-theme switching is enabled and conditions are met
    if (autoThemeSettings.enabled) {
      const isDarkMode = document.documentElement.classList.contains('dark') || 
                         window.matchMedia('(prefers-color-scheme: dark)').matches;
      
      let themeWallpaperId = isDarkMode 
        ? autoThemeSettings.darkWallpaperId 
        : autoThemeSettings.lightWallpaperId;

      // Time based overrides (night hours 7PM to 7AM get dark mode)
      if (autoThemeSettings.timeBased) {
        const hour = new Date().getHours();
        const isNight = hour >= 19 || hour < 7;
        themeWallpaperId = isNight ? autoThemeSettings.darkWallpaperId : autoThemeSettings.lightWallpaperId;
      }

      // Season based overrides (example: December winter snow)
      if (autoThemeSettings.seasonBased) {
        const month = new Date().getMonth();
        if (month === 11) { // December
          const winterSnowPreset = WALLPAPER_PRESETS.find(p => p.id === 'winter_snow');
          if (winterSnowPreset) return winterSnowPreset;
        }
      }

      const activePreset = WALLPAPER_PRESETS.find(p => p.id === themeWallpaperId);
      if (activePreset) {
        // Overlay any custom adjustments configured on the active preset
        const customAdjustments = chatId ? chatWallpapers[chatId] : globalWallpaper;
        if (customAdjustments && customAdjustments.id === themeWallpaperId) {
          return { ...activePreset, ...customAdjustments };
        }
        return activePreset;
      }
    }

    // 2. Custom wallpaper per chat
    if (chatId && chatWallpapers[chatId]) {
      return chatWallpapers[chatId];
    }

    // 3. Fallback to global setting
    return globalWallpaper;
  }, [globalWallpaper, chatWallpapers, autoThemeSettings]);

  const saveWallpaper = useCallback((chatId: string | 'global', config: Partial<WallpaperConfig>) => {
    if (config.fontTheme) {
      localStorage.setItem('chat_font_theme', config.fontTheme);
    }
    if (chatId === 'global') {
      setGlobalWallpaper(prev => {
        const next = { ...prev, ...config } as WallpaperConfig;
        const json = JSON.stringify(next);
        localStorage.setItem(`${storagePrefix}global`, json);
        localStorage.setItem('ns_wp_global', json);
        return next;
      });
    } else {
      setChatWallpapers(prev => {
        // Get existing or derive from global
        const base = prev[chatId] || { ...globalWallpaper };
        const next = { ...prev, [chatId]: { ...base, ...config } as WallpaperConfig };
        const json = JSON.stringify(next);
        localStorage.setItem(`${storagePrefix}chats`, json);
        localStorage.setItem('ns_wp_chats', json);
        return next;
      });
    }
  }, [globalWallpaper, storagePrefix]);

  const resetWallpaper = useCallback((chatId: string | 'global') => {
    if (chatId === 'global') {
      const defaultWp = WALLPAPER_PRESETS.find(p => p.id === 'doodle_dark') || WALLPAPER_PRESETS[0];
      setGlobalWallpaper(defaultWp);
      localStorage.removeItem(`${storagePrefix}global`);
    } else {
      setChatWallpapers(prev => {
        const next = { ...prev };
        delete next[chatId];
        localStorage.setItem(`${storagePrefix}chats`, JSON.stringify(next));
        return next;
      });
    }
  }, [storagePrefix]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      localStorage.setItem(`${storagePrefix}favorites`, JSON.stringify(next));
      return next;
    });
  }, [storagePrefix]);

  const addRecentlyUsed = useCallback((id: string) => {
    setRecentlyUsed(prev => {
      const filtered = prev.filter(r => r !== id);
      const next = [id, ...filtered].slice(0, 8); // Max 8 recently used
      localStorage.setItem(`${storagePrefix}recently_used`, JSON.stringify(next));
      return next;
    });
  }, [storagePrefix]);

  const updateAutoThemeSettings = useCallback((settings: Partial<AutoThemeSettings>) => {
    setAutoThemeSettings(prev => {
      const next = { ...prev, ...settings };
      localStorage.setItem(`${storagePrefix}auto_theme`, JSON.stringify(next));
      return next;
    });
  }, [storagePrefix]);

  // Value memoization
  const contextValue = useMemo(() => ({
    presets: WALLPAPER_PRESETS,
    getWallpaper,
    saveWallpaper,
    resetWallpaper,
    favorites,
    recentlyUsed,
    toggleFavorite,
    addRecentlyUsed,
    autoThemeSettings,
    updateAutoThemeSettings,
    isBatterySaverActive,
    isReducedMotionActive
  }), [
    getWallpaper,
    saveWallpaper,
    resetWallpaper,
    favorites,
    recentlyUsed,
    toggleFavorite,
    addRecentlyUsed,
    autoThemeSettings,
    updateAutoThemeSettings,
    isBatterySaverActive,
    isReducedMotionActive
  ]);

  return (
    <WallpaperContext.Provider value={contextValue}>
      {children}
    </WallpaperContext.Provider>
  );
};

export const useWallpaper = () => {
  const context = useContext(WallpaperContext);
  if (!context) {
    throw new Error('useWallpaper must be used within a WallpaperProvider');
  }
  return context;
};
