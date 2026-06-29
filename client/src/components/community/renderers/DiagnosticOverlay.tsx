import React from 'react';

interface DiagnosticOverlayProps {
  pluginId: string;
  version: number;
  renderTimeMs: number;
}

export const DiagnosticOverlay: React.FC<DiagnosticOverlayProps> = ({ pluginId, version, renderTimeMs }) => {
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div className="absolute top-2 right-2 pointer-events-none z-50">
      <div className="bg-black/80 backdrop-blur-sm text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg border border-white/10 flex flex-col items-end opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-green-400 font-bold">{pluginId.toUpperCase()} v{version}</span>
        <span className="text-gray-300">{renderTimeMs.toFixed(1)}ms</span>
        <span className="text-blue-300">Sanitized ✓</span>
      </div>
    </div>
  );
};
