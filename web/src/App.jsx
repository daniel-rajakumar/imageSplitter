import { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';

const TILE_RATIO_W = 3;
const TILE_RATIO_H = 4;

function computeCropLayout(imgW, imgH, rows, cols) {
  const targetAspect = (cols * TILE_RATIO_W) / (rows * TILE_RATIO_H);
  const srcAspect = imgW / imgH;
  let baseW, baseH;
  if (srcAspect > targetAspect) {
    baseH = imgH;
    baseW = baseH * targetAspect;
  } else {
    baseW = imgW;
    baseH = baseW / targetAspect;
  }
  return { baseW, baseH };
}

function computeCropRect(imgW, imgH, rows, cols, zoom, offsetX, offsetY) {
  const { baseW, baseH } = computeCropLayout(imgW, imgH, rows, cols);
  const z = Math.min(Math.max(zoom, 1), 4);
  const sW = Math.max(1, baseW / z);
  const sH = Math.max(1, baseH / z);
  const maxOx = Math.max(0, (imgW - sW) / 2);
  const maxOy = Math.max(0, (imgH - sH) / 2);
  const cx = Math.min(Math.max(offsetX, -maxOx), maxOx);
  const cy = Math.min(Math.max(offsetY, -maxOy), maxOy);
  const rW = Math.min(imgW, Math.max(1, Math.round(sW)));
  const rH = Math.min(imgH, Math.max(1, Math.round(sH)));
  const centX = (imgW - rW) / 2;
  const centY = (imgH - rH) / 2;
  const x = Math.min(Math.max(Math.round(centX + cx), 0), imgW - rW);
  const y = Math.min(Math.max(Math.round(centY + cy), 0), imgH - rH);
  return { x, y, w: rW, h: rH, clampedOx: cx, clampedOy: cy };
}

function generateTiles(img, crop, rows, cols) {
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    const top = crop.y + Math.round((crop.h * r) / rows);
    const bottom = crop.y + Math.round((crop.h * (r + 1)) / rows);
    const tH = bottom - top;
    for (let c = 0; c < cols; c++) {
      const left = crop.x + Math.round((crop.w * c) / cols);
      const right = crop.x + Math.round((crop.w * (c + 1)) / cols);
      const tW = right - left;
      const canvas = document.createElement('canvas');
      canvas.width = tW;
      canvas.height = tH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, left, top, tW, tH, 0, 0, tW, tH);
      tiles.push({
        row: r,
        col: c,
        dataUrl: canvas.toDataURL('image/png'),
      });
    }
  }
  return tiles;
}

function rotateImage(img, clockwise) {
  const canvas = document.createElement('canvas');
  canvas.width = img.height;
  canvas.height = img.width;
  const ctx = canvas.getContext('2d');
  if (clockwise) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(img, 0, 0);
  return canvas;
}

function canvasToImage(canvas) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL();
  });
}

// Minimal Icons Component Library
const Icons = {
  Image: () => <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>,
  Export: () => <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>,
  Reset: () => <svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>,
  Grid: () => <svg viewBox="0 0 24 24"><path d="M3 3v18h18V3H3zm8 16H5v-6h6v6zm0-8H5V5h6v6zm8 8h-6v-6h6v6zm0-8h-6V5h6v6z"/></svg>,
  Crop: () => <svg viewBox="0 0 24 24"><path d="M17 15h2V7c0-1.1-.9-2-2-2H9v2h8v8zM7 17V1H5v4H1v2h4v10c0 1.1.9 2 2 2h10v4h2v-4h4v-2H7z"/></svg>,
  RotateLeft: () => <svg viewBox="0 0 24 24"><path d="M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>,
  RotateRight: () => <svg viewBox="0 0 24 24"><path d="M15.55 5.55L11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11a7.906 7.906 0 00-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42l1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48z"/></svg>,
  Info: () => <svg viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>,
};


export default function App() {
  const [image, setImage] = useState(null);
  const [fileName, setFileName] = useState('');
  
  // Settings
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  
  // UI State
  const [activeTab, setActiveTab] = useState('grid'); // 'grid' | 'crop'
  const [tiles, setTiles] = useState([]);
  const [cropRect, setCropRect] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const canvasRef = useRef(null);
  const dragStart = useRef(null);
  const fileInputRef = useRef(null);

  // Recalculate crop & tiles
  useEffect(() => {
    if (!image) { setTiles([]); setCropRect(null); return; }
    const crop = computeCropRect(image.width, image.height, rows, cols, zoom, offsetX, offsetY);
    // Only update offset state if it was clamped, to avoid infinite loops, but here we just pass it to draw
    setCropRect(crop);
    setTiles(generateTiles(image, crop, rows, cols));
    drawPreview(image, crop, rows, cols);
  }, [image, rows, cols, zoom, offsetX, offsetY]);

  const drawPreview = useCallback((img, crop, r, c) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const container = canvas.parentElement;
    const maxW = container.clientWidth - 32; // padding
    const maxH = container.clientHeight - 32;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const dW = Math.round(img.width * scale);
    const dH = Math.round(img.height * scale);

    canvas.width = dW;
    canvas.height = dH;
    const ctx = canvas.getContext('2d');

    // Draw full image
    ctx.drawImage(img, 0, 0, dW, dH);

    // Apply exact preview shade mapping to match iOS native styles exactly
    const cx = crop.x * scale, cy = crop.y * scale;
    const cw = crop.w * scale, ch = crop.h * scale;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'; // Darker shade for pro look
    ctx.fillRect(0, 0, dW, cy);
    ctx.fillRect(0, cy + ch, dW, dH - cy - ch);
    ctx.fillRect(0, cy, cx, ch);
    ctx.fillRect(cx + cw, cy, dW - cx - cw, ch);

    // Crop border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cy, cw, ch);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    for (let i = 1; i < r; i++) {
      const y = cy + (ch * i) / r;
      ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + cw, y); ctx.stroke();
    }
    for (let i = 1; i < c; i++) {
      const x = cx + (cw * i) / c;
      ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x, cy + ch); ctx.stroke();
    }
  }, []);

  const loadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setFileName(file.name.replace(/\.[^.]+$/, ''));
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setZoom(1);
        setOffsetX(0);
        setOffsetY(0);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleImport = () => fileInputRef.current?.click();

  // Touch & Mouse Dragging
  const getCoordinates = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const handlePointerDown = (e) => {
    if (!image || !canvasRef.current) return;
    setIsDragging(true);
    const pos = getCoordinates(e);
    const canvas = canvasRef.current;
    const scale = canvas.width / image.width;
    dragStart.current = { x: pos.x, y: pos.y, ox: offsetX, oy: offsetY, scale };
  };

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || !dragStart.current) return;
    const pos = getCoordinates(e);
    const { x, y, ox, oy, scale } = dragStart.current;
    setOffsetX(ox + (pos.x - x) / scale);
    setOffsetY(oy + (pos.y - y) / scale);
  }, [isDragging, offsetX, offsetY]);

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStart.current = null;
  };

  useEffect(() => {
    if (isDragging) {
      const moveHandler = (e) => handlePointerMove(e);
      window.addEventListener('mousemove', moveHandler);
      window.addEventListener('touchmove', moveHandler, { passive: false });
      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('touchend', handlePointerUp);
      return () => {
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('touchmove', moveHandler);
        window.removeEventListener('mouseup', handlePointerUp);
        window.removeEventListener('touchend', handlePointerUp);
      };
    }
  }, [isDragging, handlePointerMove]);

  // Window Resize
  useEffect(() => {
    if (!image || !cropRect) return;
    const handleResize = () => drawPreview(image, cropRect, rows, cols);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [image, cropRect, rows, cols, drawPreview]);

  // Actions
  const handleRotate = async (clockwise) => {
    if (!image) return;
    const rotated = rotateImage(image, clockwise);
    const newImg = await canvasToImage(rotated);
    setImage(newImg);
    setOffsetX(0);
    setOffsetY(0);
  };

  const handleExport = () => {
    tiles.forEach((tile) => {
      const link = document.createElement('a');
      link.download = `${fileName || 'tile'}_r${tile.row + 1}_c${tile.col + 1}.png`;
      link.href = tile.dataUrl;
      link.click();
    });
  };

  if (!image) {
    return (
      <div className="app">
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => loadFile(e.target.files[0])} />
        <div className="empty-state">
          <Icons.Image />
          <p>Import an image to start editing</p>
          <button className="primary-btn" onClick={handleImport}>Choose Image</button>
        </div>
      </div>
    );
  }

  const isAdjusted = zoom > 1.01 || Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1;

  return (
    <div className="app">
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => loadFile(e.target.files[0])} />
      
      {/* Top Bar */}
      <header className="top-bar">
        <div className="top-bar-left">
          <button className="icon-btn" onClick={handleImport} title="Open Image">
            <Icons.Image />
          </button>
          
          <button 
            className="icon-btn" 
            onClick={() => { setZoom(1); setOffsetX(0); setOffsetY(0); }} 
            disabled={!isAdjusted}
            title="Reset Crop"
          >
            <Icons.Reset />
          </button>
        </div>
        
        <div className="top-bar-title">{fileName}</div>

        <div className="top-bar-right">
          <button className="text-btn" onClick={handleExport} disabled={tiles.length === 0}>
            Export
          </button>
        </div>
      </header>

      {/* Main Canvas Area */}
      <main className="preview-area">
        <div 
          className="preview-canvas-wrap" 
          onMouseDown={handlePointerDown} 
          onTouchStart={handlePointerDown}
        >
          <canvas ref={canvasRef} />
        </div>
      </main>

      {/* Bottom Control Sheets */}
      <footer className="bottom-panel">
        
        {/* Active Tool Row */}
        <div className="tool-content">
          {activeTab === 'grid' && (
            <div className="tool-row">
              <div className="stepper-group">
                <span className="stepper-label">Rows</span>
                <div className="stepper-controls">
                  <button className="stepper-btn" onClick={() => setRows(Math.max(1, rows - 1))}>−</button>
                  <span className="stepper-value">{rows}</span>
                  <button className="stepper-btn" onClick={() => setRows(Math.min(20, rows + 1))}>+</button>
                </div>
              </div>
              <div className="stepper-group">
                <span className="stepper-label">Columns</span>
                <div className="stepper-controls">
                  <button className="stepper-btn" onClick={() => setCols(Math.max(1, cols - 1))}>−</button>
                  <span className="stepper-value">{cols}</span>
                  <button className="stepper-btn" onClick={() => setCols(Math.min(20, cols + 1))}>+</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'crop' && (
            <div className="tool-row" style={{ gap: '16px' }}>
              <button className="icon-btn" style={{ background: 'var(--bg-surface)' }} onClick={() => handleRotate(false)}>
                <Icons.RotateLeft />
              </button>

              <div className="slider-group">
                <div className="slider-header">
                  <span>Zoom</span>
                  <span className="slider-value">{zoom.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                />
              </div>

              <button className="icon-btn" style={{ background: 'var(--bg-surface)' }} onClick={() => handleRotate(true)}>
                <Icons.RotateRight />
              </button>
            </div>
          )}

          {activeTab === 'info' && cropRect && (
            <div className="tool-row" style={{ gap: '24px' }}>
              <div className="info-stat">
                <span className="stepper-label">Original</span>
                <span className="info-value">{image.width} × {image.height}</span>
              </div>
              <div className="info-stat">
                <span className="stepper-label">Crop Area</span>
                <span className="info-value">{cropRect.w} × {cropRect.h}</span>
              </div>
              <div className="info-stat">
                <span className="stepper-label">Tile Size</span>
                <span className="info-value">{Math.round(cropRect.w / cols)} × {Math.round(cropRect.h / rows)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Tab Selector Row */}
        <div className="bottom-tabs">
          <button 
            className={`tab-btn ${activeTab === 'grid' ? 'active' : ''}`}
            onClick={() => setActiveTab('grid')}
          >
            <Icons.Grid />
            Grid
          </button>
          
          <button 
            className={`tab-btn ${activeTab === 'crop' ? 'active' : ''}`}
            onClick={() => setActiveTab('crop')}
          >
            <Icons.Crop />
            Crop
          </button>
          
          <button 
            className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            <Icons.Info />
            Info
          </button>
        </div>

      </footer>
    </div>
  );
}
