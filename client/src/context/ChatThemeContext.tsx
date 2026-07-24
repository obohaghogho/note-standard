import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { 
  ChatThemePackage, 
  CustomizerSettings, 
  WallpaperConfig, 
  ChatBubbleSettings, 
  ChatTypographySettings 
} from '../types/chatTheme';
import { PRESET_THEMES, ThemeManifestService } from '../services/ThemeManifestService';
import '../styles/chatTheme.css';

const LOCAL_CUSTOMIZER_KEY = 'notestandard_chat_customizer_settings';

interface ChatThemeContextValue {
  activeTheme: ChatThemePackage;
  customizer: CustomizerSettings;
  availableThemes: ChatThemePackage[];
  isSettingsOpen: boolean;
  isGalleryOpen: boolean;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGalleryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTheme: (themeId: string) => void;
  updateCustomizer: (updates: Partial<CustomizerSettings>) => void;
  updateWallpaper: (updates: Partial<WallpaperConfig>) => void;
  updateBubble: (updates: Partial<ChatBubbleSettings>) => void;
  updateTypography: (updates: Partial<ChatTypographySettings>) => void;
  resetToDefault: () => void;
}

const DEFAULT_CUSTOMIZER: CustomizerSettings = {
  bubble: PRESET_THEMES[0].bubble,
  typography: PRESET_THEMES[0].typography,
  wallpaper: PRESET_THEMES[0].wallpaper,
  enableAnimations: true,
  lowPerformanceMode: false,
};

const ChatThemeContext = createContext<ChatThemeContextValue | undefined>(undefined);

export const useChatTheme = () => {
  const context = useContext(ChatThemeContext);
  if (!context) {
    throw new Error('useChatTheme must be used within a ChatThemeProvider');
  }
  return context;
};

export const ChatThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [availableThemes, setAvailableThemes] = useState<ChatThemePackage[]>(() => 
    ThemeManifestService.getAvailableThemes()
  );
  
  const [activeThemeId, setActiveThemeId] = useState<string>(() => 
    ThemeManifestService.getActiveThemeId()
  );

  const activeTheme = useMemo(() => {
    return availableThemes.find(t => t.id === activeThemeId) || PRESET_THEMES[0];
  }, [availableThemes, activeThemeId]);

  const [customizer, setCustomizer] = useState<CustomizerSettings>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_CUSTOMIZER_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('[ChatThemeContext] Failed to load customizer from storage:', e);
    }
    return {
      bubble: activeTheme.bubble,
      typography: activeTheme.typography,
      wallpaper: activeTheme.wallpaper,
      enableAnimations: true,
      lowPerformanceMode: false,
    };
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  // Sync customizer changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_CUSTOMIZER_KEY, JSON.stringify(customizer));
    } catch (e) {
      console.warn('[ChatThemeContext] Failed to persist customizer:', e);
    }
  }, [customizer]);

  // Inject CSS Variables dynamically for smooth theme switching
  useEffect(() => {
    const root = document.documentElement;
    const colors = activeTheme.colors;

    root.style.setProperty('--chat-primary-accent', colors.primaryAccent);
    root.style.setProperty('--chat-secondary-accent', colors.secondaryAccent);
    root.style.setProperty('--chat-bubble-sent-bg', colors.sentBubbleBg);
    root.style.setProperty('--chat-bubble-sent-text', colors.sentBubbleText);
    root.style.setProperty('--chat-bubble-received-bg', colors.receivedBubbleBg);
    root.style.setProperty('--chat-bubble-received-text', colors.receivedBubbleText);
    root.style.setProperty('--chat-timestamp-sent', colors.timestampSent);
    root.style.setProperty('--chat-timestamp-received', colors.timestampReceived);
    root.style.setProperty('--chat-bubble-radius', `${customizer.bubble.borderRadius}px`);
    root.style.setProperty('--chat-bubble-blur', `${customizer.bubble.blur}px`);
    root.style.setProperty('--chat-font-size', `${customizer.typography.fontSize}px`);
    root.style.setProperty('--chat-line-height', `${customizer.typography.lineHeight}`);
    root.style.setProperty('--chat-letter-spacing', `${customizer.typography.letterSpacing}px`);
    root.style.setProperty('--chat-bubble-spacing', `${customizer.typography.bubbleSpacing}px`);
  }, [activeTheme, customizer]);

  const setTheme = useCallback((themeId: string) => {
    const target = availableThemes.find(t => t.id === themeId);
    if (!target) return;

    setActiveThemeId(themeId);
    ThemeManifestService.setActiveThemeId(themeId);

    setCustomizer(prev => ({
      ...prev,
      bubble: target.bubble,
      typography: target.typography,
      wallpaper: target.wallpaper,
    }));
  }, [availableThemes]);

  const updateCustomizer = useCallback((updates: Partial<CustomizerSettings>) => {
    setCustomizer(prev => ({ ...prev, ...updates }));
  }, []);

  const updateWallpaper = useCallback((updates: Partial<WallpaperConfig>) => {
    setCustomizer(prev => ({
      ...prev,
      wallpaper: { ...prev.wallpaper, ...updates }
    }));
  }, []);

  const updateBubble = useCallback((updates: Partial<ChatBubbleSettings>) => {
    setCustomizer(prev => ({
      ...prev,
      bubble: { ...prev.bubble, ...updates }
    }));
  }, []);

  const updateTypography = useCallback((updates: Partial<ChatTypographySettings>) => {
    setCustomizer(prev => ({
      ...prev,
      typography: { ...prev.typography, ...updates }
    }));
  }, []);

  const resetToDefault = useCallback(() => {
    const defaultTheme = PRESET_THEMES[0];
    setActiveThemeId(defaultTheme.id);
    ThemeManifestService.setActiveThemeId(defaultTheme.id);
    setCustomizer({
      bubble: defaultTheme.bubble,
      typography: defaultTheme.typography,
      wallpaper: defaultTheme.wallpaper,
      enableAnimations: true,
      lowPerformanceMode: false,
    });
  }, []);

  const value = useMemo(() => ({
    activeTheme,
    customizer,
    availableThemes,
    isSettingsOpen,
    isGalleryOpen,
    setIsSettingsOpen,
    setIsGalleryOpen,
    setTheme,
    updateCustomizer,
    updateWallpaper,
    updateBubble,
    updateTypography,
    resetToDefault,
  }), [
    activeTheme,
    customizer,
    availableThemes,
    isSettingsOpen,
    isGalleryOpen,
    setTheme,
    updateCustomizer,
    updateWallpaper,
    updateBubble,
    updateTypography,
    resetToDefault,
  ]);

  return (
    <ChatThemeContext.Provider value={value}>
      {children}
    </ChatThemeContext.Provider>
  );
};
