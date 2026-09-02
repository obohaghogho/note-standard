import React from 'react';
import { useChatTheme } from '../../context/ChatThemeContext';
import { ChatCanvasBackground } from './ChatCanvasBackground';
import { WallpaperEngine } from './WallpaperEngine';

interface ChatWallpaperProps {
  children?: React.ReactNode;
  className?: string;
  chatId?: string;
}

export const ChatWallpaper: React.FC<ChatWallpaperProps> = ({ children, className = '', chatId }) => {
  const { activeTheme, customizer } = useChatTheme();
  const wp = customizer.wallpaper;

  const getBackgroundStyle = (): React.CSSProperties => {
    // When WallpaperEngine renders, keep fallback layer transparent so wallpaper is crisp
    return {
      background: 'transparent',
      transition: 'opacity 150ms ease, filter 150ms ease, background 150ms ease',
    };
  };

  const isMeshAnimated = wp.category === 'mesh' || wp.animationType === 'moving_gradients';

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {/* ─── Wallpaper Engine Backdrop Layer (High performance canvas/gradient/doodle) ─── */}
      <div className="absolute inset-0 z-0 transition-opacity duration-150 ease-out pointer-events-none">
        <WallpaperEngine chatId={chatId} />
      </div>

      {/* ─── Secondary Theme Fallback Layer ─── */}
      <div 
        className={`absolute inset-0 z-0 transition-all duration-150 ease-out pointer-events-none opacity-40 ${isMeshAnimated ? 'chat-mesh-animated' : ''}`}
        style={getBackgroundStyle()}
      />

      {/* ─── Canvas Particle/Animation Layer ─── */}
      {customizer.enableAnimations && wp.animationType && wp.animationType !== 'none' && (
        <ChatCanvasBackground
          type={wp.animationType}
          accentColor={activeTheme.colors.primaryAccent}
          lowPerformance={customizer.lowPerformanceMode}
        />
      )}

      {/* ─── Content Layer (Messages & Controls) ─── */}
      <div className="relative z-10 w-full h-full flex flex-col">
        {children}
      </div>
    </div>
  );
};
