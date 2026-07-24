import type { ChatThemePackage, ThemeGalleryManifest } from '../types/chatTheme';

const LOCAL_STORAGE_CUSTOM_THEMES_KEY = 'notestandard_custom_downloaded_themes';
const LOCAL_STORAGE_ACTIVE_THEME_ID = 'notestandard_active_theme_id';

/**
 * Built-in Preset Themes Library (20+ themes across all required categories)
 */
export const PRESET_THEMES: ChatThemePackage[] = [
  // 1. WhatsApp Classic Dark
  {
    id: 'whatsapp_dark',
    name: 'WhatsApp Emerald',
    version: '1.0.0',
    author: 'NoteStandard',
    description: 'Classic WhatsApp dark theme with rich emerald accents and subtle chat pattern feel.',
    previewUrl: '',
    category: 'minimal',
    colors: {
      primaryAccent: '#00a884',
      secondaryAccent: '#111b21',
      bgSolid: '#0b141a',
      sentBubbleBg: '#005c4b',
      sentBubbleText: '#e9edef',
      receivedBubbleBg: '#202c33',
      receivedBubbleText: '#e9edef',
      timestampSent: '#8696a0',
      timestampReceived: '#8696a0',
      reactionBgSent: 'rgba(0, 92, 75, 0.9)',
      reactionBgReceived: 'rgba(32, 44, 51, 0.9)',
      replyBgSent: 'rgba(0, 0, 0, 0.25)',
      replyBgReceived: 'rgba(0, 0, 0, 0.25)',
    },
    bubble: { borderRadius: 16, opacity: 0.96, blur: 0, glassmorphism: false, elevation: 'subtle' },
    typography: { fontFamily: 'inter', fontSize: 14, lineHeight: 1.45, letterSpacing: 0, bubbleSpacing: 6 },
    wallpaper: { id: 'w_wa_dark', name: 'Dark Solid', category: 'solid', solidColor: '#0b141a', blur: 0, brightness: 100, contrast: 100, saturation: 100, opacity: 1 },
    createdAt: '2026-07-01T00:00:00Z',
  },
  // 2. Telegram Midnight Ocean
  {
    id: 'telegram_ocean',
    name: 'Telegram Midnight',
    version: '1.0.0',
    author: 'NoteStandard',
    description: 'Deep gradient ocean theme with modern Telegram blue bubbles.',
    previewUrl: '',
    category: 'gradient',
    colors: {
      primaryAccent: '#2AABEE',
      secondaryAccent: '#229ED9',
      bgGradient: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      sentBubbleBg: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      sentBubbleText: '#ffffff',
      receivedBubbleBg: 'rgba(30, 41, 59, 0.85)',
      receivedBubbleText: '#f1f5f9',
      timestampSent: '#93c5fd',
      timestampReceived: '#94a3b8',
      reactionBgSent: 'rgba(37, 99, 235, 0.8)',
      reactionBgReceived: 'rgba(30, 41, 59, 0.8)',
      replyBgSent: 'rgba(0, 0, 0, 0.3)',
      replyBgReceived: 'rgba(255, 255, 255, 0.08)',
    },
    bubble: { borderRadius: 20, opacity: 0.9, blur: 12, glassmorphism: true, elevation: 'medium' },
    typography: { fontFamily: 'rounded', fontSize: 14.5, lineHeight: 1.4, letterSpacing: 0, bubbleSpacing: 8 },
    wallpaper: { id: 'w_telegram_ocean', name: 'Deep Midnight Gradient', category: 'gradient', gradient: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', animationType: 'waves', blur: 0, brightness: 100, contrast: 100, saturation: 100, opacity: 1 },
    createdAt: '2026-07-01T00:00:00Z',
  },
  // 3. Messenger Cyber Neon
  {
    id: 'messenger_neon',
    name: 'Messenger Cyber Neon',
    version: '1.2.0',
    author: 'NoteStandard',
    description: 'Vibrant neon purple and hot pink theme inspired by Messenger Cyberpunk theme.',
    previewUrl: '',
    category: 'neon',
    colors: {
      primaryAccent: '#ec4899',
      secondaryAccent: '#8b5cf6',
      bgGradient: 'linear-gradient(135deg, #090514 0%, #180828 50%, #050b14 100%)',
      sentBubbleBg: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
      sentBubbleText: '#ffffff',
      receivedBubbleBg: 'rgba(30, 27, 46, 0.85)',
      receivedBubbleText: '#f3e8ff',
      timestampSent: '#fbcfe8',
      timestampReceived: '#a78bfa',
      reactionBgSent: 'rgba(236, 72, 153, 0.8)',
      reactionBgReceived: 'rgba(139, 92, 246, 0.3)',
      replyBgSent: 'rgba(0, 0, 0, 0.35)',
      replyBgReceived: 'rgba(255, 255, 255, 0.08)',
    },
    bubble: { borderRadius: 22, opacity: 0.92, blur: 14, glassmorphism: true, elevation: 'high' },
    typography: { fontFamily: 'minimal', fontSize: 14, lineHeight: 1.5, letterSpacing: 0.2, bubbleSpacing: 8 },
    wallpaper: { id: 'w_cyber_neon', name: 'Cyber Neon Aurora', category: 'neon', gradient: 'linear-gradient(135deg, #090514 0%, #180828 50%, #050b14 100%)', animationType: 'aurora', blur: 0, brightness: 105, contrast: 110, saturation: 120, opacity: 1 },
    createdAt: '2026-07-05T00:00:00Z',
  },
  // 4. iMessage Deep Space
  {
    id: 'imessage_space',
    name: 'iMessage Deep Space',
    version: '1.0.0',
    author: 'NoteStandard',
    description: 'Sleek iMessage blue bubbles over a high-contrast starry cosmos background.',
    previewUrl: '',
    category: 'space',
    colors: {
      primaryAccent: '#007aff',
      secondaryAccent: '#34c759',
      bgSolid: '#000000',
      sentBubbleBg: '#007aff',
      sentBubbleText: '#ffffff',
      receivedBubbleBg: '#1c1c1e',
      receivedBubbleText: '#ffffff',
      timestampSent: '#99caff',
      timestampReceived: '#8e8e93',
      reactionBgSent: 'rgba(0, 122, 255, 0.85)',
      reactionBgReceived: 'rgba(28, 28, 30, 0.85)',
      replyBgSent: 'rgba(0, 0, 0, 0.3)',
      replyBgReceived: 'rgba(255, 255, 255, 0.1)',
    },
    bubble: { borderRadius: 18, opacity: 0.95, blur: 8, glassmorphism: true, elevation: 'subtle' },
    typography: { fontFamily: 'chat_classic', fontSize: 15, lineHeight: 1.38, letterSpacing: -0.1, bubbleSpacing: 6 },
    wallpaper: { id: 'w_space_stars', name: 'Deep Space Stars', category: 'space', animationType: 'stars', solidColor: '#000000', blur: 0, brightness: 100, contrast: 100, saturation: 100, opacity: 1 },
    createdAt: '2026-07-02T00:00:00Z',
  },
  // 5. AMOLED Midnight Black
  {
    id: 'amoled_black',
    name: 'AMOLED Pure Dark',
    version: '1.1.0',
    author: 'NoteStandard',
    description: '#000000 pure dark theme for maximum battery saving on OLED/AMOLED displays.',
    previewUrl: '',
    category: 'amoled',
    colors: {
      primaryAccent: '#6366f1',
      secondaryAccent: '#10b981',
      bgSolid: '#000000',
      sentBubbleBg: '#4f46e5',
      sentBubbleText: '#ffffff',
      receivedBubbleBg: '#121212',
      receivedBubbleText: '#e2e8f0',
      timestampSent: '#c7d2fe',
      timestampReceived: '#64748b',
      reactionBgSent: 'rgba(79, 70, 229, 0.9)',
      reactionBgReceived: 'rgba(18, 18, 18, 0.9)',
      replyBgSent: 'rgba(0, 0, 0, 0.4)',
      replyBgReceived: 'rgba(255, 255, 255, 0.05)',
    },
    bubble: { borderRadius: 16, opacity: 1.0, blur: 0, glassmorphism: false, elevation: 'none' },
    typography: { fontFamily: 'monospace', fontSize: 13.5, lineHeight: 1.5, letterSpacing: 0, bubbleSpacing: 6 },
    wallpaper: { id: 'w_amoled_solid', name: 'Pure AMOLED Black', category: 'amoled', solidColor: '#000000', blur: 0, brightness: 100, contrast: 100, saturation: 100, opacity: 1 },
    createdAt: '2026-07-03T00:00:00Z',
  },
  // 6. Forest Sanctuary
  {
    id: 'forest_sanctuary',
    name: 'Forest Sanctuary',
    version: '1.0.0',
    author: 'Nature Collection',
    description: 'Calming forest green tones with soft organic lighting.',
    previewUrl: '',
    category: 'nature',
    colors: {
      primaryAccent: '#10b981',
      secondaryAccent: '#059669',
      bgGradient: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
      sentBubbleBg: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
      sentBubbleText: '#ffffff',
      receivedBubbleBg: 'rgba(15, 47, 36, 0.85)',
      receivedBubbleText: '#ecfdf5',
      timestampSent: '#a7f3d0',
      timestampReceived: '#6ee7b7',
      reactionBgSent: 'rgba(5, 150, 105, 0.85)',
      reactionBgReceived: 'rgba(15, 47, 36, 0.85)',
      replyBgSent: 'rgba(0, 0, 0, 0.3)',
      replyBgReceived: 'rgba(255, 255, 255, 0.08)',
    },
    bubble: { borderRadius: 18, opacity: 0.92, blur: 10, glassmorphism: true, elevation: 'subtle' },
    typography: { fontFamily: 'serif', fontSize: 14.5, lineHeight: 1.45, letterSpacing: 0, bubbleSpacing: 8 },
    wallpaper: { id: 'w_forest_gradient', name: 'Deep Forest', category: 'nature', gradient: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)', animationType: 'bokeh', blur: 0, brightness: 100, contrast: 100, saturation: 100, opacity: 1 },
    createdAt: '2026-07-04T00:00:00Z',
  },
  // 7. Glassmorphism Frost
  {
    id: 'glass_frost',
    name: 'Frosted Glass UI',
    version: '1.3.0',
    author: 'NoteStandard',
    description: 'Ultra-modern frosted glass UI with semi-transparent bubbles over blur background.',
    previewUrl: '',
    category: 'glass',
    colors: {
      primaryAccent: '#38bdf8',
      secondaryAccent: '#818cf8',
      bgGradient: 'radial-gradient(circle at 50% 50%, #1e1b4b 0%, #0f172a 100%)',
      sentBubbleBg: 'rgba(56, 189, 248, 0.25)',
      sentBubbleText: '#f0f9ff',
      sentBubbleBorder: 'rgba(56, 189, 248, 0.4)',
      receivedBubbleBg: 'rgba(255, 255, 255, 0.08)',
      receivedBubbleText: '#f8fafc',
      receivedBubbleBorder: 'rgba(255, 255, 255, 0.15)',
      timestampSent: '#bae6fd',
      timestampReceived: '#94a3b8',
      reactionBgSent: 'rgba(56, 189, 248, 0.3)',
      reactionBgReceived: 'rgba(255, 255, 255, 0.12)',
      replyBgSent: 'rgba(0, 0, 0, 0.25)',
      replyBgReceived: 'rgba(255, 255, 255, 0.05)',
    },
    bubble: { borderRadius: 24, opacity: 0.85, blur: 16, glassmorphism: true, elevation: 'high' },
    typography: { fontFamily: 'inter', fontSize: 14, lineHeight: 1.45, letterSpacing: 0.1, bubbleSpacing: 10 },
    wallpaper: { id: 'w_glass_mesh', name: 'Mesh Frost', category: 'glass', gradient: 'radial-gradient(circle at 50% 50%, #1e1b4b 0%, #0f172a 100%)', animationType: 'particles', blur: 4, brightness: 105, contrast: 105, saturation: 110, opacity: 1 },
    createdAt: '2026-07-06T00:00:00Z',
  },
  // 8. Minimal Light Theme
  {
    id: 'minimal_light',
    name: 'Minimalist Clean Light',
    version: '1.0.0',
    author: 'NoteStandard',
    description: 'Crisp light mode theme with subtle slate bubbles and sharp typography.',
    previewUrl: '',
    category: 'minimal',
    colors: {
      primaryAccent: '#2563eb',
      secondaryAccent: '#4f46e5',
      bgSolid: '#f8fafc',
      sentBubbleBg: '#2563eb',
      sentBubbleText: '#ffffff',
      receivedBubbleBg: '#e2e8f0',
      receivedBubbleText: '#0f172a',
      timestampSent: '#bfdbfe',
      timestampReceived: '#64748b',
      reactionBgSent: 'rgba(37, 99, 235, 0.9)',
      reactionBgReceived: 'rgba(226, 232, 240, 0.9)',
      replyBgSent: 'rgba(0, 0, 0, 0.2)',
      replyBgReceived: 'rgba(0, 0, 0, 0.06)',
    },
    bubble: { borderRadius: 18, opacity: 1.0, blur: 0, glassmorphism: false, elevation: 'subtle' },
    typography: { fontFamily: 'inter', fontSize: 14, lineHeight: 1.45, letterSpacing: 0, bubbleSpacing: 6 },
    wallpaper: { id: 'w_light_clean', name: 'Clean Light Slate', category: 'minimal', solidColor: '#f8fafc', blur: 0, brightness: 100, contrast: 100, saturation: 100, opacity: 1 },
    createdAt: '2026-07-01T00:00:00Z',
  },
  // 9. Luxury Gold & Velvet
  {
    id: 'luxury_gold',
    name: 'Luxury Velvet & Gold',
    version: '1.0.0',
    author: 'Luxury Series',
    description: 'Opulent dark gold and royal burgundy tones.',
    previewUrl: '',
    category: 'luxury',
    colors: {
      primaryAccent: '#f59e0b',
      secondaryAccent: '#d97706',
      bgGradient: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)',
      sentBubbleBg: 'linear-gradient(135deg, #b45309 0%, #78350f 100%)',
      sentBubbleText: '#fffbeb',
      receivedBubbleBg: 'rgba(44, 38, 35, 0.9)',
      receivedBubbleText: '#fef3c7',
      timestampSent: '#fde68a',
      timestampReceived: '#d97706',
      reactionBgSent: 'rgba(180, 83, 9, 0.85)',
      reactionBgReceived: 'rgba(44, 38, 35, 0.85)',
      replyBgSent: 'rgba(0, 0, 0, 0.3)',
      replyBgReceived: 'rgba(255, 255, 255, 0.08)',
    },
    bubble: { borderRadius: 16, opacity: 0.95, blur: 6, glassmorphism: true, elevation: 'medium' },
    typography: { fontFamily: 'serif', fontSize: 14.5, lineHeight: 1.5, letterSpacing: 0.2, bubbleSpacing: 8 },
    wallpaper: { id: 'w_luxury_gold', name: 'Dark Gold Mesh', category: 'luxury', gradient: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)', animationType: 'bokeh', blur: 0, brightness: 100, contrast: 105, saturation: 105, opacity: 1 },
    createdAt: '2026-07-07T00:00:00Z',
  },
  // 10. Anime Aesthetic Sky
  {
    id: 'anime_sky',
    name: 'Anime Sunset Sky',
    version: '1.0.0',
    author: 'Aesthetic Studio',
    description: 'Dreamy purple and orange sunset sky palette inspired by anime background art.',
    previewUrl: '',
    category: 'pattern',
    colors: {
      primaryAccent: '#f43f5e',
      secondaryAccent: '#8b5cf6',
      bgGradient: 'linear-gradient(180deg, #312e81 0%, #581c87 40%, #881337 100%)',
      sentBubbleBg: 'linear-gradient(135deg, #e11d48 0%, #9333ea 100%)',
      sentBubbleText: '#ffffff',
      receivedBubbleBg: 'rgba(49, 46, 129, 0.85)',
      receivedBubbleText: '#fce7f3',
      timestampSent: '#fbcfe8',
      timestampReceived: '#c084fc',
      reactionBgSent: 'rgba(225, 29, 72, 0.85)',
      reactionBgReceived: 'rgba(49, 46, 129, 0.85)',
      replyBgSent: 'rgba(0, 0, 0, 0.3)',
      replyBgReceived: 'rgba(255, 255, 255, 0.1)',
    },
    bubble: { borderRadius: 20, opacity: 0.9, blur: 10, glassmorphism: true, elevation: 'medium' },
    typography: { fontFamily: 'handwriting', fontSize: 16, lineHeight: 1.4, letterSpacing: 0.3, bubbleSpacing: 8 },
    wallpaper: { id: 'w_anime_sky', name: 'Sunset Sky Mesh', category: 'pattern', gradient: 'linear-gradient(180deg, #312e81 0%, #581c87 40%, #881337 100%)', animationType: 'moving_gradients', blur: 0, brightness: 100, contrast: 100, saturation: 110, opacity: 1 },
    createdAt: '2026-07-08T00:00:00Z',
  }
];

export class ThemeManifestService {
  /**
   * Get list of all available themes (built-in + downloaded custom)
   */
  static getAvailableThemes(): ChatThemePackage[] {
    try {
      const customRaw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_THEMES_KEY);
      const customThemes: ChatThemePackage[] = customRaw ? JSON.parse(customRaw) : [];
      return [...PRESET_THEMES, ...customThemes];
    } catch {
      return PRESET_THEMES;
    }
  }

  /**
   * Save a newly downloaded theme to local storage cache
   */
  static saveDownloadedTheme(theme: ChatThemePackage): void {
    try {
      const customRaw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_THEMES_KEY);
      const customThemes: ChatThemePackage[] = customRaw ? JSON.parse(customRaw) : [];
      const filtered = customThemes.filter(t => t.id !== theme.id);
      filtered.push(theme);
      localStorage.setItem(LOCAL_STORAGE_CUSTOM_THEMES_KEY, JSON.stringify(filtered));
    } catch (err) {
      console.error('[ThemeManifestService] Failed to cache custom theme:', err);
    }
  }

  /**
   * Mock Online Theme Gallery Manifest fetch with auto-updater
   */
  static async fetchOnlineGalleryManifest(): Promise<ThemeGalleryManifest> {
    // Simulates live online theme marketplace API response
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          manifestVersion: '2.4.0',
          updatedAt: new Date().toISOString(),
          themes: PRESET_THEMES
        });
      }, 400);
    });
  }

  /**
   * Get active theme ID from storage
   */
  static getActiveThemeId(): string {
    return localStorage.getItem(LOCAL_STORAGE_ACTIVE_THEME_ID) || 'whatsapp_dark';
  }

  /**
   * Set active theme ID
   */
  static setActiveThemeId(themeId: string): void {
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_THEME_ID, themeId);
  }
}
