export type WallpaperCategory = 
  | 'solid'
  | 'gradient'
  | 'abstract'
  | 'glass'
  | 'nature'
  | 'space'
  | 'neon'
  | 'amoled'
  | 'minimal'
  | 'luxury'
  | 'pattern'
  | 'animated'
  | 'mesh';

export type BackgroundAnimationType = 
  | 'none'
  | 'particles'
  | 'moving_gradients'
  | 'aurora'
  | 'stars'
  | 'rain'
  | 'snow'
  | 'bokeh'
  | 'waves';

export type FontChoice = 
  | 'inter'
  | 'rounded'
  | 'serif'
  | 'handwriting'
  | 'minimal'
  | 'monospace'
  | 'chat_classic';

export interface ChatThemeColors {
  primaryAccent: string;
  secondaryAccent: string;
  bgSolid?: string;
  bgGradient?: string;
  sentBubbleBg: string;
  sentBubbleText: string;
  sentBubbleBorder?: string;
  receivedBubbleBg: string;
  receivedBubbleText: string;
  receivedBubbleBorder?: string;
  timestampSent: string;
  timestampReceived: string;
  reactionBgSent: string;
  reactionBgReceived: string;
  replyBgSent: string;
  replyBgReceived: string;
}

export interface ChatBubbleSettings {
  borderRadius: number; // in px
  opacity: number;      // 0.2 - 1.0
  blur: number;         // in px
  glassmorphism: boolean;
  elevation: 'none' | 'subtle' | 'medium' | 'high';
}

export interface ChatTypographySettings {
  fontFamily: FontChoice;
  fontSize: number;       // in px (12-22)
  lineHeight: number;     // 1.2 - 1.8
  letterSpacing: number; // in px (-1 to 2)
  bubbleSpacing: number; // in px (2 to 16)
}

export interface WallpaperConfig {
  id: string;
  name: string;
  category: WallpaperCategory;
  url?: string;
  gradient?: string;
  solidColor?: string;
  animationType?: BackgroundAnimationType;
  blur: number;           // 0 - 20px
  brightness: number;     // 20 - 150%
  contrast: number;       // 50 - 150%
  saturation: number;     // 0 - 200%
  opacity: number;        // 0.1 - 1.0
}

export interface CustomizerSettings {
  bubble: ChatBubbleSettings;
  typography: ChatTypographySettings;
  wallpaper: WallpaperConfig;
  enableAnimations: boolean;
  lowPerformanceMode: boolean;
}

export interface ChatThemePackage {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  previewUrl: string;
  category: WallpaperCategory;
  isPremium?: boolean;
  colors: ChatThemeColors;
  bubble: ChatBubbleSettings;
  typography: ChatTypographySettings;
  wallpaper: WallpaperConfig;
  createdAt: string;
  checksum?: string;
}

export interface ThemeGalleryManifest {
  manifestVersion: string;
  updatedAt: string;
  themes: ChatThemePackage[];
}
