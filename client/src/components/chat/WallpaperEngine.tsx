import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useWallpaper, WallpaperConfig } from '../../context/WallpaperContext';

interface WallpaperEngineProps {
  chatId?: string;
  previewConfig?: WallpaperConfig; // Used for live previews in customization modal
}

export const WallpaperEngine: React.FC<WallpaperEngineProps> = ({ chatId, previewConfig }) => {
  const { getWallpaper, isBatterySaverActive, isReducedMotionActive } = useWallpaper();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameId = useRef<number | null>(null);

  // Determine active configuration (live preview override or saved preference)
  const config = useMemo(() => {
    return previewConfig || getWallpaper(chatId);
  }, [previewConfig, getWallpaper, chatId]);

  // CSS Filter styles for wallpaper adjustments
  const filterStyle = useMemo(() => {
    return {
      filter: `
        blur(${config.blur}px) 
        brightness(${config.brightness}%) 
        contrast(${config.contrast}%) 
        saturation(${config.saturation}%)
      `,
      transform: `scale(${config.zoom})`,
      opacity: config.opacity,
      transition: 'filter 0.3s ease, transform 0.3s ease, opacity 0.3s ease',
    };
  }, [config.blur, config.brightness, config.contrast, config.saturation, config.zoom, config.opacity]);

  // Glass overlay dimming style
  const dimStyle = useMemo(() => {
    return {
      backgroundColor: `rgba(0, 0, 0, ${config.dimming / 100})`,
      transition: 'background-color 0.3s ease',
    };
  }, [config.dimming]);

  // Generate WhatsApp style doodle URL
  const doodleBackgroundStyle = useMemo(() => {
    if (config.type !== 'doodle') return {};
    const strokeColor = config.colors?.[1] || 'rgba(255,255,255,0.03)';
    const baseColor = config.colors?.[0] || '#0f172a';
    
    const encodedSvg = encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <g fill="none" stroke="${strokeColor}" stroke-width="0.8" opacity="0.35">
          <!-- Chat Bubble -->
          <path d="M20 20h20v12H26l-6 6v-6h-6V20z"/>
          <!-- Star -->
          <path d="M70 20l2 5 5 1-4 4 1 5-5-3-5 3 1-5-4-4 5-1z"/>
          <!-- Heart -->
          <path d="M125 20c-3-3-7-3-10 0l-5 5-5-5c-3-3-7-3-10 0s-3 7 0 10l15 15 15-15c3-3 3-7 0-10z"/>
          <!-- Envelope -->
          <rect x="20" y="80" width="20" height="12" rx="2"/>
          <path d="M20 80l10 7 10-7"/>
          <!-- Music Note -->
          <path d="M75 80v18c0 3-1.5 5-4.5 5s-4.5-2-4.5-5 1.5-5 4.5-5v-10h7v3"/>
          <!-- Smiley -->
          <circle cx="120" cy="85" r="10"/>
          <path d="M116 88a4 4 0 0 0 8 0"/>
          <!-- Phone Call -->
          <path d="M25 130h10v20H25zm2 0v-3a4 4 0 0 1 8 0v3"/>
          <!-- Double Checks -->
          <path d="M70 135l4 4 8-8m2 0l-8 8"/>
          <!-- Document Note -->
          <rect x="115" y="130" width="16" height="22" rx="2"/>
          <path d="M119 136h8m-8 4h8m-8 4h6"/>
        </g>
      </svg>
    `);
    
    return {
      backgroundColor: baseColor,
      backgroundImage: `url("data:image/svg+xml;utf8,${encodedSvg}")`,
      backgroundSize: '160px 160px',
      backgroundRepeat: 'repeat',
    };
  }, [config.type, config.colors]);

  // ─── HIGH PERFORMANCE CANVAS ANIMATION ENGINE ───
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Reset previous animation loop
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }

    const typesWithCanvas = ['aurora', 'mesh', 'waves', 'particles', 'stars', 'fireflies', 'rain', 'snow', 'glass'];
    if (!typesWithCanvas.includes(config.type)) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let particles: any[] = [];
    let isTabVisible = true;

    // Adjust canvas resolution for high DPI displays (cap at 2.0 for performance)
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      
      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      width = parent.clientWidth;
      height = parent.clientHeight;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      
      initParticles();
    };

    // Scale particle count based on battery saver and performance override settings
    const getTargetParticleCount = () => {
      if (isBatterySaverActive || isReducedMotionActive) return Math.min(config.particleCount, 15);
      return config.particleCount;
    };

    const initParticles = () => {
      particles = [];
      const count = getTargetParticleCount();
      
      if (config.type === 'particles') {
        const pColors = config.colors || ['#3b82f6', '#ec4899', '#8b5cf6'];
        for (let i = 0; i < count; i++) {
          particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 40 + 20,
            vx: (Math.random() - 0.5) * 0.4 * config.speed,
            vy: (Math.random() - 0.5) * 0.4 * config.speed,
            color: pColors[Math.floor(Math.random() * pColors.length)],
            alpha: Math.random() * 0.2 + 0.05
          });
        }
      } else if (config.type === 'stars') {
        for (let i = 0; i < count * 1.5; i++) {
          particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 1.5 + 0.5,
            alpha: Math.random() * 0.8 + 0.1,
            twinkleSpeed: (Math.random() * 0.015 + 0.005) * config.speed,
            increasing: Math.random() > 0.5
          });
        }
      } else if (config.type === 'fireflies') {
        const fColors = config.colors || ['#10b981', '#34d399', '#059669'];
        for (let i = 0; i < count; i++) {
          particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 3 + 1,
            vx: (Math.random() - 0.5) * 0.6 * config.speed,
            vy: (Math.random() - 0.5) * 0.6 * config.speed,
            color: fColors[Math.floor(Math.random() * fColors.length)],
            alpha: Math.random() * 0.8 + 0.1,
            pulseSpeed: (Math.random() * 0.02 + 0.01) * config.speed,
            increasing: Math.random() > 0.5,
            angle: Math.random() * Math.PI * 2
          });
        }
      } else if (config.type === 'rain') {
        for (let i = 0; i < count * 2; i++) {
          particles.push({
            x: Math.random() * width,
            y: Math.random() * -height,
            length: Math.random() * 15 + 10,
            vy: (Math.random() * 8 + 6) * config.speed,
            vx: -1,
            opacity: Math.random() * 0.15 + 0.05
          });
        }
      } else if (config.type === 'snow') {
        for (let i = 0; i < count; i++) {
          particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 2.5 + 1,
            vy: (Math.random() * 1 + 0.5) * config.speed,
            vx: (Math.random() - 0.5) * 0.3 * config.speed,
            opacity: Math.random() * 0.5 + 0.1,
            swingSpeed: (Math.random() * 0.02 + 0.01) * config.speed,
            swingAngle: Math.random() * Math.PI
          });
        }
      }
    };

    // ─── RENDER LOOP ───
    let waveOffset = 0;
    const render = () => {
      if (!isTabVisible) return;
      ctx.clearRect(0, 0, width, height);

      // 1. Draw static background
      const baseColors = config.colors || ['#09090b'];
      if (config.type === 'glass') {
        ctx.fillStyle = baseColors[0] || '#0f1220';
        ctx.fillRect(0, 0, width, height);
        // Draw decorative glass blobs
        ctx.fillStyle = baseColors[1] || '#4f46e5';
        ctx.beginPath();
        ctx.arc(width * 0.25, height * 0.25, Math.min(width, height) * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = baseColors[2] || '#db2777';
        ctx.beginPath();
        ctx.arc(width * 0.75, height * 0.75, Math.min(width, height) * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (config.type === 'waves') {
        ctx.fillStyle = baseColors[0] || '#020b14';
        ctx.fillRect(0, 0, width, height);
      }

      // If animation is disabled via battery saver or reduced motion
      const isMotionDisabled = isReducedMotionActive || (isBatterySaverActive && config.type !== 'stars');

      // 2. Draw animated entities
      if (config.type === 'particles') {
        particles.forEach(p => {
          ctx.beginPath();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();

          if (!isMotionDisabled) {
            p.x += p.vx;
            p.y += p.vy;

            // Bounce check
            if (p.x - p.radius < 0 || p.x + p.radius > width) p.vx *= -1;
            if (p.y - p.radius < 0 || p.y + p.radius > height) p.vy *= -1;
          }
        });
      } else if (config.type === 'stars') {
        particles.forEach(p => {
          ctx.beginPath();
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = p.alpha;
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();

          if (!isMotionDisabled) {
            if (p.increasing) {
              p.alpha += p.twinkleSpeed;
              if (p.alpha >= 0.95) p.increasing = false;
            } else {
              p.alpha -= p.twinkleSpeed;
              if (p.alpha <= 0.05) p.increasing = true;
            }
          }
        });
      } else if (config.type === 'fireflies') {
        particles.forEach(p => {
          ctx.beginPath();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.shadowBlur = 10;
          ctx.shadowColor = p.color;
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0; // reset

          if (!isMotionDisabled) {
            // Random movement drift
            p.angle += (Math.random() - 0.5) * 0.1;
            p.x += Math.cos(p.angle) * 0.25 * config.speed;
            p.y += Math.sin(p.angle) * 0.25 * config.speed;

            // Twinkle/glow pulsing
            if (p.increasing) {
              p.alpha += p.pulseSpeed;
              if (p.alpha >= 0.85) p.increasing = false;
            } else {
              p.alpha -= p.pulseSpeed;
              if (p.alpha <= 0.15) p.increasing = true;
            }

            // Boundary wrapping
            if (p.x < -10) p.x = width + 10;
            if (p.x > width + 10) p.x = -10;
            if (p.y < -10) p.y = height + 10;
            if (p.y > height + 10) p.y = -10;
          }
        });
      } else if (config.type === 'rain') {
        ctx.strokeStyle = 'rgba(173, 216, 230, 0.4)';
        ctx.lineWidth = 1.2;
        particles.forEach(p => {
          ctx.beginPath();
          ctx.globalAlpha = p.opacity;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx, p.y + p.length);
          ctx.stroke();

          if (!isMotionDisabled) {
            p.x += p.vx;
            p.y += p.vy;

            if (p.y > height) {
              p.y = Math.random() * -50;
              p.x = Math.random() * width;
            }
          }
        });
      } else if (config.type === 'snow') {
        ctx.fillStyle = '#ffffff';
        particles.forEach(p => {
          ctx.beginPath();
          ctx.globalAlpha = p.opacity;
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();

          if (!isMotionDisabled) {
            p.y += p.vy;
            p.x += p.vx + Math.sin(p.swingAngle) * 0.15;
            p.swingAngle += p.swingSpeed;

            if (p.y > height) {
              p.y = -10;
              p.x = Math.random() * width;
            }
            if (p.x < -10) p.x = width + 10;
            if (p.x > width + 10) p.x = -10;
          }
        });
      } else if (config.type === 'waves') {
        const waveCount = config.particleCount || 3;
        const waveColors = baseColors.slice(1);
        ctx.globalAlpha = 0.15;

        for (let w = 0; w < waveCount; w++) {
          ctx.fillStyle = waveColors[w % waveColors.length] || '#0369a1';
          ctx.beginPath();
          ctx.moveTo(0, height);
          
          const freq = (0.002 + w * 0.001);
          const amp = (35 + w * 15);
          
          for (let x = 0; x <= width; x += 10) {
            const y = height * 0.65 + Math.sin(x * freq + waveOffset + w * 2) * amp;
            ctx.lineTo(x, y);
          }
          
          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fill();
        }

        if (!isMotionDisabled) {
          waveOffset += 0.006 * config.speed;
        }
      }

      ctx.globalAlpha = 1.0; // reset opacity

      // Re-trigger loop only if motion is not disabled or if it twinkles (which requires redraws)
      if (!isMotionDisabled || config.type === 'stars') {
        animationFrameId.current = requestAnimationFrame(render);
      }
    };

    // Initialize layout and events
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });

    // Handle Page Visibility state to preserve battery
    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        render();
      } else if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Run first frame
    render();

    // Clean up all events
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [config.type, config.colors, config.speed, config.particleCount, isBatterySaverActive, isReducedMotionActive]);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-0 select-none overflow-hidden"
      style={{
        ...doodleBackgroundStyle,
        backgroundColor: config.type === 'color' ? config.colors?.[0] : undefined
      }}
    >
      {/* 1. Static Gradients / Aurora / Glass elements */}
      {config.type === 'gradient' && (
        <div 
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${config.colors?.join(', ') || '#1e3a8a, #0f172a'})`,
            ...filterStyle
          }}
        />
      )}

      {config.type === 'aurora' && (
        <div 
          className="absolute inset-0 bg-theme-aurora"
          style={filterStyle}
        />
      )}

      {config.type === 'mesh' && (
        <div 
          className="absolute inset-0 bg-theme-lavender"
          style={filterStyle}
        />
      )}

      {config.type === 'grid' && (
        <div 
          className="absolute inset-0 bg-theme-grid"
          style={filterStyle}
        />
      )}

      {config.type === 'glass' && (
        <div 
          className="absolute inset-0"
          style={{
            backdropFilter: `blur(${config.blur}px)`,
            WebkitBackdropFilter: `blur(${config.blur}px)`,
            ...filterStyle
          }}
        />
      )}

      {/* 2. Interactive Canvas rendering */}
      {['aurora', 'mesh', 'waves', 'particles', 'stars', 'fireflies', 'rain', 'snow', 'glass'].includes(config.type) && (
        <canvas 
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={filterStyle}
        />
      )}

      {/* 3. Static Custom uploaded Image */}
      {config.type === 'image' && config.customUrl && (
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${config.customUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            ...filterStyle
          }}
        />
      )}

      {/* 4. Muted loop video wallpapers */}
      {config.type === 'video' && config.customUrl && !isBatterySaverActive && !isReducedMotionActive && (
        <video
          src={config.customUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={filterStyle}
        />
      )}

      {/* 5. Custom dark dimming layer */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none"
        style={dimStyle}
      />
    </div>
  );
};
