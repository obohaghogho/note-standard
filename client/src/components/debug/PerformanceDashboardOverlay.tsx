import React, { useEffect, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';

export const PerformanceDashboardOverlay: React.FC = () => {
  const metrics = useChatStore((state) => state.metrics);
  const [fps, setFps] = useState(60);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const calcFps = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(calcFps);
    };

    animId = requestAnimationFrame(calcFps);
    return () => cancelAnimationFrame(animId);
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-3 left-3 z-50 px-2.5 py-1 text-xs font-mono bg-black/80 hover:bg-black text-green-400 border border-green-500/30 rounded shadow-lg backdrop-blur-md"
      >
        ⚡ {fps} FPS
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 left-3 z-50 w-72 p-3 bg-gray-950/95 border border-blue-500/30 rounded-xl shadow-2xl backdrop-blur-xl text-xs font-mono text-gray-200">
      <div className="flex justify-between items-center pb-2 mb-2 border-b border-gray-800">
        <span className="font-bold text-blue-400 flex items-center gap-1.5">
          ⚡ Perf Dashboard
        </span>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white text-sm font-bold"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="text-gray-400">FPS:</span>
          <span className={fps >= 55 ? 'text-green-400 font-bold' : 'text-amber-400 font-bold'}>
            {fps} FPS
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Render Time:</span>
          <span className={metrics.renderTimeMs < 8 ? 'text-green-400' : 'text-red-400 font-bold'}>
            {metrics.renderTimeMs} ms {metrics.renderTimeMs < 8 ? '(Target <8ms)' : '⚠️ Exceeds Budget'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Socket RTT:</span>
          <span className="text-blue-400">{metrics.socketRttMs || '<10'} ms</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Priority Queue:</span>
          <span className="text-purple-400">{metrics.queueLength} tasks</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Target Local Send:</span>
          <span className="text-green-400">&lt; 5 ms (0ms perceived)</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Status Machine:</span>
          <span className="text-emerald-400">Active (Strict)</span>
        </div>
      </div>
    </div>
  );
};
