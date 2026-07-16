/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useRef, useState } from 'react';
import { Network, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

interface GraphNode {
  id: string;
  type: string;
  label: string;
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  confidence: number;
}

const NODE_COLORS: Record<string, string> = {
  post:       '#2563EB',
  wiki:       '#16A34A',
  collection: '#F59E0B',
  space:      '#0EA5E9',
  creator:    '#DC2626',
};

// Simple force-directed layout (no D3 dependency — pure DOM/SVG)
function layoutNodes(nodes: GraphNode[], width: number, height: number): GraphNode[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;
  const angleStep = (2 * Math.PI) / Math.max(nodes.length, 1);

  return nodes.map((node, i) => ({
    ...node,
    x: i === 0 ? centerX : centerX + radius * Math.cos(i * angleStep),
    y: i === 0 ? centerY : centerY + radius * Math.sin(i * angleStep),
  }));
}

// Demo data
const DEMO_NODES: GraphNode[] = [
  { id: 'post-1', type: 'post', label: 'React Hooks Guide' },
  { id: 'wiki-1', type: 'wiki', label: 'Hooks Reference' },
  { id: 'col-1', type: 'collection', label: 'Best Tutorials' },
  { id: 'post-2', type: 'post', label: 'useEffect Explained' },
  { id: 'creator-1', type: 'creator', label: 'Alex Dev' },
  { id: 'post-3', type: 'post', label: 'Performance Tips' },
];

const DEMO_EDGES: GraphEdge[] = [
  { source: 'post-1', target: 'wiki-1', type: 'references', confidence: 1.0 },
  { source: 'post-1', target: 'col-1', type: 'contains', confidence: 1.0 },
  { source: 'post-2', target: 'wiki-1', type: 'similar_to', confidence: 0.85 },
  { source: 'creator-1', target: 'post-1', type: 'created_by', confidence: 1.0 },
  { source: 'post-3', target: 'col-1', type: 'contains', confidence: 1.0 },
  { source: 'post-1', target: 'post-3', type: 'co_viewed', confidence: 0.72 },
];

export const TopicGraphVisualizer: React.FC<{ spaceId: string }> = ({ spaceId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);

  const laidOutNodes = layoutNodes(DEMO_NODES, dimensions.width, dimensions.height);
  const nodeMap = Object.fromEntries(laidOutNodes.map(n => [n.id, n]));

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height: Math.max(height, 400) });
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="bg-elevated border border-border rounded-card shadow-sm overflow-hidden flex flex-col" style={{ height: '70vh' }}>
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface shrink-0">
        <h2 className="font-bold text-heading flex items-center gap-2">
          <Network size={20} className="text-primary" /> Topic Graph
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.min(z + 0.15, 2))} className="p-2 bg-elevated border border-border rounded-button hover:bg-border text-heading transition-colors"><ZoomIn size={16}/></button>
          <button onClick={() => setZoom(z => Math.max(z - 0.15, 0.5))} className="p-2 bg-elevated border border-border rounded-button hover:bg-border text-heading transition-colors"><ZoomOut size={16}/></button>
          <button onClick={() => setZoom(1)} className="p-2 bg-elevated border border-border rounded-button hover:bg-border text-heading transition-colors"><RefreshCw size={16}/></button>
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 py-2 border-b border-border bg-elevated flex items-center gap-4 flex-wrap shrink-0">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-muted capitalize">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            {type}
          </div>
        ))}
      </div>

      {/* Graph Canvas */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-background">
        <svg
          width="100%"
          height="100%"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.2s ease' }}
        >
          {/* Edges */}
          {DEMO_EDGES.map((edge, i) => {
            const src = nodeMap[edge.source];
            const tgt = nodeMap[edge.target];
            if (!src || !tgt) return null;
            const opacity = 0.3 + edge.confidence * 0.6;
            return (
              <g key={i}>
                <line
                  x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke="#6B7280" strokeWidth={1.5} strokeOpacity={opacity}
                  strokeDasharray={edge.confidence < 0.9 ? '5,4' : ''}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {laidOutNodes.map((node) => {
            const color = NODE_COLORS[node.type] ?? '#6B7280';
            const isSelected = selectedNode?.id === node.id;
            return (
              <g key={node.id} onClick={() => setSelectedNode(isSelected ? null : node)} style={{ cursor: 'pointer' }}>
                <circle cx={node.x} cy={node.y} r={isSelected ? 22 : 16} fill={color} opacity={0.15} />
                <circle cx={node.x} cy={node.y} r={isSelected ? 14 : 10} fill={color} />
                {isSelected && <circle cx={node.x} cy={node.y} r={22} fill="none" stroke={color} strokeWidth={2} />}
                <text x={node.x} y={(node.y ?? 0) + 28} textAnchor="middle" fontSize="11" fill="currentColor" className="text-body" dominantBaseline="hanging">
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Info Panel */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 bg-surface border border-border rounded-card p-4 shadow-lg w-64 z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS[selectedNode.type] ?? '#6B7280' }} />
              <h4 className="font-bold text-heading text-sm">{selectedNode.label}</h4>
            </div>
            <p className="text-xs text-muted capitalize">Type: {selectedNode.type}</p>
            <p className="text-xs text-muted mt-1">
              Connections: {DEMO_EDGES.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length}
            </p>
            <button className="mt-3 text-xs font-bold text-primary hover:underline">Open →</button>
          </div>
        )}
      </div>
    </div>
  );
};
