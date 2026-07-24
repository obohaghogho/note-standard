import React from 'react';
import { useChatTheme } from '../../context/ChatThemeContext';
import { ChatCanvasBackground } from './ChatCanvasBackground';

interface ChatWallpaperProps {
  children?: React.ReactNode;
  className?: string;
}

export const ChatWallpaper: React.FC<ChatWallpaperProps> = ({ children, className = '' }) => {
  const { activeTheme, customizer } = useChatTheme();
  const wp = customizer.wallpaper;

  const getBackgroundStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {
      filter: `blur(${wp.blur}px) brightness(${wp.brightness}%) contrast(${wp.contrast}%) saturate(${wp.saturation}%)`,
      opacity: wp.opacity,
    };

    if (wp.solidColor) {
      style.backgroundColor = wp.solidColor;
    } else if (wp.gradient) {
      style.background = wp.gradient;
    } else if (activeTheme.colors.bgGradient) {
      style.background = activeTheme.colors.bgGradient;
    } else if (activeTheme.colors.bgSolid) {
      style.backgroundColor = activeTheme.colors.bgSolid;
    } else if (wp.url) {
      style.backgroundImage = `url("${wp.url}")`;
      style.backgroundSize = 'cover';
      style.backgroundPosition = 'center';
      style.backgroundRepeat = 'no-repeat';
    }

    return style;
  };

  const isMeshAnimated = wp.category === 'mesh' || wp.animationType === 'moving_gradients';

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {/* ─── Wallpaper Layer ─── */}
      <div 
        className={`absolute inset-0 z-0 transition-all duration-300 pointer-events-none ${isMeshAnimated ? 'chat-mesh-animated' : ''}`}
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

      {/* ─── Content Layer ─── */}
      <div className="relative z-10 w-full h-full flex flex-col">
        {children}
      </div>
    </div>
  );
};
