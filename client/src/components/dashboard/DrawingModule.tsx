import React, { useRef, useState, useEffect } from 'react';
import { Button } from '../common/Button';
import { Pen, Eraser, Trash2, Download, UploadCloud, Loader2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '';

interface DrawingModuleProps {
  noteId: string;
}

export const DrawingModule: React.FC<DrawingModuleProps> = ({ noteId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(3);
  const [isEraser, setIsEraser] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedDrawings, setSavedDrawings] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  useEffect(() => {
    fetchDrawings();
  }, [noteId]);

  const fetchDrawings = async () => {
    setLoadingFiles(true);
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.get(`${API_URL}/api/notes/${noteId}/files`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Filter for drawing images (we can assume anything starting with 'drawing-' or just images)
      const drawings = data.filter((f: any) => f.mime_type.startsWith('image/'));
      setSavedDrawings(drawings);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set background to dark
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Scale coordinates based on actual canvas size vs displayed size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: ((e as MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as MouseEvent).clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const { x, y } = getCoordinates(e.nativeEvent);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const { x, y } = getCoordinates(e.nativeEvent);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.strokeStyle = isEraser ? '#1e1e1e' : color;
    ctx.lineWidth = isEraser ? brushSize * 3 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const saveDrawing = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setUploading(true);
    try {
      // Convert to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b as Blob), 'image/png');
      });

      const file = new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' });
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const { data } = await axios.post(
        `${API_URL}/api/notes/${noteId}/files`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data"
          }
        }
      );
      
      setSavedDrawings(prev => [data, ...prev]);
      toast.success("Drawing saved to note!");
      clearCanvas();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to save drawing");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-neutral-900/40 border border-white/10 rounded-xl p-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEraser(false)}
              className={`p-2 rounded-lg transition-colors ${!isEraser ? 'bg-emerald-500/20 text-emerald-400' : 'text-neutral-400 hover:bg-white/5'}`}
              title="Pen"
            >
              <Pen size={18} />
            </button>
            <button
              onClick={() => setIsEraser(true)}
              className={`p-2 rounded-lg transition-colors ${isEraser ? 'bg-emerald-500/20 text-emerald-400' : 'text-neutral-400 hover:bg-white/5'}`}
              title="Eraser"
            >
              <Eraser size={18} />
            </button>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => { setColor(e.target.value); setIsEraser(false); }}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
              title="Color"
            />
            <input
              type="range"
              min="1"
              max="20"
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              className="w-24 accent-emerald-500"
              title="Brush Size"
            />
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={clearCanvas} className="text-red-400 hover:text-red-300 hover:bg-red-400/10">
              <Trash2 size={16} className="mr-2" /> Clear
            </Button>
            <Button size="sm" onClick={saveDrawing} disabled={uploading}>
              {uploading ? <Loader2 size={16} className="animate-spin mr-2" /> : <UploadCloud size={16} className="mr-2" />}
              Save Drawing
            </Button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="relative w-full overflow-hidden rounded-lg border border-white/5 bg-[#1e1e1e] touch-none">
          <canvas
            ref={canvasRef}
            width={800}
            height={400}
            className="w-full h-auto cursor-crosshair block touch-none"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
      </div>

      {/* Gallery of saved drawings */}
      {savedDrawings.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Saved Drawings & Images</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {savedDrawings.map((img) => (
              <div key={img.id} className="relative aspect-video rounded-lg overflow-hidden border border-white/10 group bg-black/50">
                <img 
                  src={`${API_URL}/api/notes/${noteId}/files/${img.id}/download`} 
                  alt={img.file_name}
                  className="w-full h-full object-contain"
                  crossOrigin="use-credentials"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                   <a 
                     href={`${API_URL}/api/notes/${noteId}/files/${img.id}/download`}
                     download={img.file_name}
                     className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                   >
                     <Download size={16} />
                   </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
