import React, { useEffect, useRef } from 'react';
import type { BackgroundAnimationType } from '../../types/chatTheme';

interface ChatCanvasBackgroundProps {
  type: BackgroundAnimationType;
  accentColor?: string;
  lowPerformance?: boolean;
}

export const ChatCanvasBackground: React.FC<ChatCanvasBackgroundProps> = ({
  type,
  accentColor = '#3b82f6',
  lowPerformance = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (type === 'none' || lowPerformance) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener('resize', handleResize);

    // ─── Animation Implementations ───
    if (type === 'particles') {
      const numParticles = 40;
      const particles = Array.from({ length: numParticles }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2.5 + 1,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.5 + 0.2,
      }));

      const render = () => {
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => {
          p.x += p.speedX;
          p.y += p.speedY;

          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = accentColor;
          ctx.globalAlpha = p.alpha;
          ctx.fill();
        });
        animId = requestAnimationFrame(render);
      };
      render();
    } else if (type === 'stars') {
      const numStars = 60;
      const stars = Array.from({ length: numStars }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.5 + 0.5,
        alpha: Math.random(),
        twinkleSpeed: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
      }));

      const render = () => {
        ctx.clearRect(0, 0, width, height);
        stars.forEach(s => {
          s.alpha += s.twinkleSpeed;
          if (s.alpha > 0.9 || s.alpha < 0.1) s.twinkleSpeed *= -1;

          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = Math.max(0.1, Math.min(1, s.alpha));
          ctx.fill();
        });
        animId = requestAnimationFrame(render);
      };
      render();
    } else if (type === 'rain') {
      const drops = Array.from({ length: 45 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        length: Math.random() * 14 + 8,
        speed: Math.random() * 6 + 4,
        alpha: Math.random() * 0.35 + 0.1,
      }));

      const render = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1;

        drops.forEach(d => {
          d.y += d.speed;
          if (d.y > height) {
            d.y = -d.length;
            d.x = Math.random() * width;
          }
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x, d.y + d.length);
          ctx.globalAlpha = d.alpha;
          ctx.stroke();
        });
        animId = requestAnimationFrame(render);
      };
      render();
    } else if (type === 'snow') {
      const flakes = Array.from({ length: 40 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2.5 + 1,
        speed: Math.random() * 1 + 0.5,
        swing: Math.random() * 0.02,
        swingOffset: Math.random() * Math.PI * 2,
      }));

      let step = 0;
      const render = () => {
        ctx.clearRect(0, 0, width, height);
        step += 0.01;

        flakes.forEach(f => {
          f.y += f.speed;
          f.x += Math.sin(step + f.swingOffset) * 0.5;

          if (f.y > height) {
            f.y = -5;
            f.x = Math.random() * width;
          }

          ctx.beginPath();
          ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.6;
          ctx.fill();
        });
        animId = requestAnimationFrame(render);
      };
      render();
    } else if (type === 'bokeh') {
      const orbs = Array.from({ length: 18 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 40 + 20,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.15 + 0.05,
      }));

      const render = () => {
        ctx.clearRect(0, 0, width, height);
        orbs.forEach(o => {
          o.x += o.speedX;
          o.y += o.speedY;

          if (o.x < -o.radius) o.x = width + o.radius;
          if (o.x > width + o.radius) o.x = -o.radius;
          if (o.y < -o.radius) o.y = height + o.radius;
          if (o.y > height + o.radius) o.y = -o.radius;

          const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.radius);
          grad.addColorStop(0, accentColor);
          grad.addColorStop(1, 'transparent');

          ctx.beginPath();
          ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.globalAlpha = o.alpha;
          ctx.fill();
        });
        animId = requestAnimationFrame(render);
      };
      render();
    } else if (type === 'waves') {
      let step = 0;
      const render = () => {
        ctx.clearRect(0, 0, width, height);
        step += 0.015;

        ctx.beginPath();
        ctx.moveTo(0, height * 0.5);
        for (let x = 0; x <= width; x += 10) {
          const y = Math.sin(x * 0.008 + step) * 25 + Math.cos(x * 0.005 + step * 0.8) * 15 + height * 0.5;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, height * 0.4, 0, height);
        grad.addColorStop(0, accentColor);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.08;
        ctx.fill();

        animId = requestAnimationFrame(render);
      };
      render();
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [type, accentColor, lowPerformance]);

  if (type === 'none' || lowPerformance) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0"
      style={{ width: '100%', height: '100%' }}
    />
  );
};
