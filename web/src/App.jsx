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
  return { x, y, w: rW, h: rH, clampedOx: x - centX, clampedOy: y - centY };
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
        w: tW,
        h: tH,
        dataUrl: canvas.toDataURL('image/png'),
        canvas,
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

export default function App() {
  const [image, setImage] = useState(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [tiles, setTiles] = useState([]);
  const [cropRect, setCropRect] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);

  const canvasRef = useRef(null);
  const dragStart = useRef(null);
  const fileInputRef = useRef(null);

  // Rebuild tiles when params change
  useEffect(() => {
    if (!image) { setTiles([]); setCropRect(null); return; }
    const crop = computeCropRect(image.width, image.height, rows, cols, zoom, offsetX, offsetY);
    setOffsetX(crop.clampedOx);
    setOffsetY(crop.clampedOy);
    setCropRect(crop);
    setTiles(generateTiles(image, crop, rows, cols));
    drawPreview(image, crop, rows, cols);
  }, [image, rows, cols, zoom, offsetX, offsetY]);

  const drawPreview = useCallback((img, crop, r, c) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const container = canvas.parentElement;
    const maxW = container.clientWidth;
    const maxH = container.clientHeight;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const dW = Math.round(img.width * scale);
    const dH = Math.round(img.height * scale);

    canvas.width = dW;
    canvas.height = dH;
    const ctx = canvas.getContext('2d');

    // Draw image
    ctx.drawImage(img, 0, 0, dW, dH);

    // Shade outside crop
    const cx = crop.x * scale, cy = crop.y * scale;
    const cw = crop.w * scale, ch = crop.h * scale;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, dW, cy);
    ctx.fillRect(0, cy + ch, dW, dH - cy - ch);
    ctx.fillRect(0, cy, cx, ch);
    ctx.fillRect(cx + cw, cy, dW - cx - cw, ch);

    // Crop border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cy, cw, ch);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 0.8;
    for (let i = 1; i < r; i++) {
      const y = cy + (ch * i) / r;
      ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + cw, y); ctx.stroke();
    }
    for (let i = 1; i < c; i++) {
      const x = cx + (cw * i) / c;
      ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x, cy + ch); ctx.stroke();
    }
  }, []);

  const loadFile = useCallback((file) => {
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
  }, []);

  const handleImport = () => fileInputRef.current?.click();

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDropActive(false);
    const file = e.dataTransfer.files[0];
    loadFile(file);
  }, [loadFile]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDropActive(true); };
  const handleDragLeave = () => setIsDropActive(false);

  // Preview drag
  const handleMouseDown = (e) => {
    if (!image || !canvasRef.current) return;
    setIsDragging(true);
    const canvas = canvasRef.current;
    const scale = canvas.width / image.width;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY, scale };
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !dragStart.current) return;
    const { x, y, ox, oy, scale } = dragStart.current;
    const dx = (e.clientX - x) / scale;
    const dy = (e.clientY - y) / scale;
    setOffsetX(ox + dx);
    setOffsetY(oy + dy);
  }, [isDragging]);

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStart.current = null;
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove]);

  // Resize handler for preview
  useEffect(() => {
    if (!image || !cropRect) return;
    const handleResize = () => drawPreview(image, cropRect, rows, cols);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [image, cropRect, rows, cols, drawPreview]);

  const handleRotate = async (clockwise) => {
    if (!image) return;
    const rotated = rotateImage(image, clockwise);
    const newImg = await canvasToImage(rotated);
    setImage(newImg);
    setOffsetX(0);
    setOffsetY(0);
  };

  const handleReset = () => { setZoom(1); setOffsetX(0); setOffsetY(0); };

  const handleExport = () => {
    tiles.forEach((tile) => {
      const link = document.createElement('a');
      link.download = `${fileName || 'tile'}_r${tile.row + 1}_c${tile.col + 1}.png`;
      link.href = tile.dataUrl;
      link.click();
    });
  };

  const handleExportZip = async () => {
    // Simple sequential download
    handleExport();
  };

  return (
    <div className="app">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => loadFile(e.target.files[0])}
      />

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1><span>⊞</span> Image Splitter</h1>
        </div>

        <div className="sidebar-body">
          {/* Source */}
          <div className="section">
            <div className="section-header">
              <span className="section-title">Source</span>
            </div>
            <div className="section-body">
              {image ? (
                <>
                  <div className="source-info">
                    <div className="source-stat">
                      <div className="source-stat-label">Original</div>
                      <div className="source-stat-value">{image.width} × {image.height}</div>
                    </div>
                    {cropRect && (
                      <div className="source-stat">
                        <div className="source-stat-label">Crop</div>
                        <div className="source-stat-value">{cropRect.w} × {cropRect.h}</div>
                      </div>
                    )}
                  </div>
                  <button className="btn btn-secondary" onClick={handleImport}>
                    Change Image
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={handleImport}>
                  Import Image
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          <div className="section">
            <div className="section-header">
              <span className="section-title">Grid</span>
              <span className="section-badge">{rows * cols} tiles</span>
            </div>
            <div className="section-body">
              <Stepper label="Rows" value={rows} onChange={setRows} min={1} max={20} />
              <Stepper label="Columns" value={cols} onChange={setCols} min={1} max={20} />
            </div>
          </div>

          {/* Adjust */}
          <div className="section">
            <div className="section-header">
              <span className="section-title">Adjust</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-icon" onClick={() => handleRotate(false)} disabled={!image} title="Rotate Left">↶</button>
                <button className="btn-icon" onClick={() => handleRotate(true)} disabled={!image} title="Rotate Right">↷</button>
              </div>
            </div>
            <div className="section-body">
              <div className="slider-row">
                <div className="slider-header">
                  <span className="slider-label">Zoom</span>
                  <span className="slider-value">{zoom.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  disabled={!image}
                />
              </div>
              {(zoom > 1.01 || Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1) && (
                <button className="btn btn-danger" onClick={handleReset}>
                  Reset Crop
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={tiles.length === 0}
          >
            ↓ Export {tiles.length} Tiles
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {image ? (
          <>
            <div className="main-toolbar">
              <div className="toolbar-info">
                <span>{fileName}</span>
                <span className="toolbar-dot" />
                <span>{image.width} × {image.height}</span>
                <span className="toolbar-dot" />
                <span>{rows} × {cols} grid</span>
                <span className="toolbar-dot" />
                <span>{rows * cols} tiles</span>
              </div>
              <div className="toolbar-actions">
                <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={handleImport}>
                  Replace
                </button>
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleExport} disabled={tiles.length === 0}>
                  Export
                </button>
              </div>
            </div>
            <div className="main-content">
              <div className="preview-panel">
                <div className="preview-canvas-wrap" onMouseDown={handleMouseDown}>
                  <canvas ref={canvasRef} />
                </div>
              </div>

              {/* Tiles sidebar */}
              <div className="tiles-panel">
                <div className="tiles-header">
                  <span className="tiles-header-title">Tiles</span>
                  <span className="section-badge">{tiles.length}</span>
                </div>
                <div className="tiles-scroll">
                  <div className="tiles-grid">
                    {tiles.map((tile, i) => (
                      <div className="tile-card" key={i}>
                        <img className="tile-image" src={tile.dataUrl} alt={`R${tile.row + 1} C${tile.col + 1}`} />
                        <div className="tile-meta">
                          <span className="tile-label">R{tile.row + 1} C{tile.col + 1}</span>
                          <span className="tile-size">{tile.w}×{tile.h}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div
            className="empty-state"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className={`drop-zone ${isDropActive ? 'active' : ''}`} onClick={handleImport}>
              <div className="drop-icon">📸</div>
              <h2>Drop an image here</h2>
              <p>or click to browse your files</p>
              <button className="btn btn-primary" style={{ maxWidth: 200, margin: '0 auto' }} onClick={(e) => { e.stopPropagation(); handleImport(); }}>
                Choose Image
              </button>
              <div className="drop-or">Supports PNG, JPEG, WebP, and more</div>
              <div className="features-row">
                <div className="feature-item">
                  <div className="feature-icon">🔲</div>
                  <span className="feature-label">3∶4 Tiles</span>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">✂️</div>
                  <span className="feature-label">Crop & Zoom</span>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">📦</div>
                  <span className="feature-label">Export PNG</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Stepper({ label, value, onChange, min, max }) {
  return (
    <div className="stepper-row">
      <span className="stepper-label">{label}</span>
      <div className="stepper-controls">
        <button className="stepper-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
        <span className="stepper-value">{value}</span>
        <button className="stepper-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
      </div>
    </div>
  );
}
