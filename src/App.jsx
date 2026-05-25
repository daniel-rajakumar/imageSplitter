'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import JSZip from 'jszip';

const TILE_RATIO_W = 3;
const TILE_RATIO_H = 4;
const ASPECT_PRESETS = [
  { id: 'portrait', label: '3:4', w: 3, h: 4 },
  { id: 'square', label: '1:1', w: 1, h: 1 },
  { id: 'story', label: '9:16', w: 9, h: 16 },
  { id: 'custom', label: 'Custom' },
];
const GRID_PRESETS = [
  { label: '1x3', rows: 1, cols: 3 },
  { label: '2x3', rows: 2, cols: 3 },
  { label: '3x3', rows: 3, cols: 3 },
  { label: '4x3', rows: 4, cols: 3 },
];

function computeCropLayout(imgW, imgH, rows, cols, tileRatioW, tileRatioH) {
  const targetAspect = (cols * tileRatioW) / (rows * tileRatioH);
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

function computeCropRect(imgW, imgH, rows, cols, zoom, offsetX, offsetY, tileRatioW, tileRatioH) {
  const { baseW, baseH } = computeCropLayout(imgW, imgH, rows, cols, tileRatioW, tileRatioH);
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

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Could not create image file.'));
      }
    }, 'image/png');
  });
}

async function generateTileFiles(img, crop, rows, cols, baseName) {
  const files = [];
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
      const blob = await canvasToBlob(canvas);
      files.push(new File([blob], `${baseName}_r${r + 1}_c${c + 1}.png`, { type: 'image/png' }));
    }
  }
  return files;
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

function getDataUrlBase64(dataUrl) {
  return dataUrl.split(',')[1] || '';
}

// Minimal Icons Component Library
const Icons = {
  Image: () => <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>,
  Export: () => <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>,
  Reset: () => <svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>,
  Grid: () => <svg viewBox="0 0 24 24"><path d="M3 3v18h18V3H3zm8 16H5v-6h6v6zm0-8H5V5h6v6zm8 8h-6v-6h6v6zm0-8h-6V5h6v6z"/></svg>,
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
  const [aspectPreset, setAspectPreset] = useState('portrait');
  const [tileRatioW, setTileRatioW] = useState(TILE_RATIO_W);
  const [tileRatioH, setTileRatioH] = useState(TILE_RATIO_H);
  
  // UI State
  const [activeTab, setActiveTab] = useState('grid'); // 'grid' | 'info'
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  });

  const canvasRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStart = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const liveZoom = useRef(1);
  const pinchStart = useRef(null);
  const previewFrame = useRef(null);
  const pendingPreview = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const drawPreview = useCallback((img, crop, r, c) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const container = canvas.parentElement;
    const maxW = container.clientWidth - 32; // padding
    const maxH = container.clientHeight - 32;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const dW = Math.round(img.width * scale);
    const dH = Math.round(img.height * scale);
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const backingW = Math.round(dW * pixelRatio);
    const backingH = Math.round(dH * pixelRatio);

    if (canvas.width !== backingW || canvas.height !== backingH) {
      canvas.width = backingW;
      canvas.height = backingH;
      canvas.style.width = `${dW}px`;
      canvas.style.height = `${dH}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, dW, dH);

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

  const cropRect = useMemo(() => {
    if (!image) return null;
    return computeCropRect(image.width, image.height, rows, cols, zoom, offsetX, offsetY, tileRatioW, tileRatioH);
  }, [image, rows, cols, zoom, offsetX, offsetY, tileRatioW, tileRatioH]);

  const tileCount = rows * cols;

  const schedulePreviewDraw = useCallback((img, crop, r, c) => {
    pendingPreview.current = { img, crop, r, c };
    if (previewFrame.current !== null) return;

    previewFrame.current = requestAnimationFrame(() => {
      previewFrame.current = null;
      const next = pendingPreview.current;
      pendingPreview.current = null;
      if (next) drawPreview(next.img, next.crop, next.r, next.c);
    });
  }, [drawPreview]);

  useEffect(() => {
    if (!image || !cropRect) return;
    liveZoom.current = zoom;
    dragOffset.current = { x: cropRect.clampedOx, y: cropRect.clampedOy };
    schedulePreviewDraw(image, cropRect, rows, cols);
  }, [image, cropRect, rows, cols, schedulePreviewDraw, zoom]);

  useEffect(() => () => {
    if (previewFrame.current !== null) {
      cancelAnimationFrame(previewFrame.current);
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

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const resetCropPosition = () => {
    liveZoom.current = 1;
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  const applyGridPreset = (preset) => {
    setRows(preset.rows);
    setCols(preset.cols);
    resetCropPosition();
  };

  const applyAspectPreset = (preset) => {
    setAspectPreset(preset.id);
    if (preset.id !== 'custom') {
      setTileRatioW(preset.w);
      setTileRatioH(preset.h);
      resetCropPosition();
    }
  };

  const adjustCustomRatio = (axis, delta) => {
    setAspectPreset('custom');
    resetCropPosition();
    if (axis === 'w') {
      setTileRatioW((value) => Math.min(32, Math.max(1, value + delta)));
    } else {
      setTileRatioH((value) => Math.min(32, Math.max(1, value + delta)));
    }
  };

  // Touch & Mouse Dragging
  const getCoordinates = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const getTouchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handlePointerDown = (e) => {
    if (!image || !canvasRef.current) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    const pos = getCoordinates(e);
    const canvas = canvasRef.current;
    const scale = canvas.getBoundingClientRect().width / image.width;
    dragStart.current = { x: pos.x, y: pos.y, ox: dragOffset.current.x, oy: dragOffset.current.y, scale };
  };

  const handleTouchStart = (e) => {
    if (!image || !canvasRef.current) return;

    if (e.touches.length >= 2) {
      if (e.cancelable) e.preventDefault();
      isDraggingRef.current = false;
      setIsDragging(false);
      dragStart.current = null;
      pinchStart.current = {
        distance: getTouchDistance(e.touches),
        zoom: liveZoom.current,
      };
      return;
    }

    if (!pinchStart.current) {
      handlePointerDown(e);
    }
  };

  const handlePinchMove = useCallback((e) => {
    if (!image || !pinchStart.current || e.touches.length < 2) return;
    if (e.cancelable) e.preventDefault();

    const distance = getTouchDistance(e.touches);
    if (pinchStart.current.distance <= 0) return;

    const nextZoom = Math.min(4, Math.max(1, pinchStart.current.zoom * (distance / pinchStart.current.distance)));
    liveZoom.current = nextZoom;

    const nextCrop = computeCropRect(
      image.width,
      image.height,
      rows,
      cols,
      nextZoom,
      dragOffset.current.x,
      dragOffset.current.y,
      tileRatioW,
      tileRatioH,
    );
    dragOffset.current = { x: nextCrop.clampedOx, y: nextCrop.clampedOy };
    schedulePreviewDraw(image, nextCrop, rows, cols);
  }, [cols, image, rows, schedulePreviewDraw, tileRatioH, tileRatioW]);

  const handlePointerMove = useCallback((e) => {
    if (e.touches?.length >= 2) {
      handlePinchMove(e);
      return;
    }

    if (!isDraggingRef.current || !dragStart.current) return;
    if (e.cancelable) e.preventDefault();
    const pos = getCoordinates(e);
    const { x, y, ox, oy, scale } = dragStart.current;
    const nextCrop = computeCropRect(
      image.width,
      image.height,
      rows,
      cols,
      zoom,
      ox + (pos.x - x) / scale,
      oy + (pos.y - y) / scale,
      tileRatioW,
      tileRatioH,
    );
    dragOffset.current = { x: nextCrop.clampedOx, y: nextCrop.clampedOy };
    schedulePreviewDraw(image, nextCrop, rows, cols);
  }, [cols, handlePinchMove, image, rows, schedulePreviewDraw, tileRatioH, tileRatioW, zoom]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    isDraggingRef.current = false;
    dragStart.current = null;
    setOffsetX(dragOffset.current.x);
    setOffsetY(dragOffset.current.y);
  }, []);

  const finishPinch = useCallback(() => {
    if (!pinchStart.current) return;
    pinchStart.current = null;
    setZoom(liveZoom.current);
    setOffsetX(dragOffset.current.x);
    setOffsetY(dragOffset.current.y);
  }, []);

  useEffect(() => {
    if (isDragging) {
      const moveHandler = (e) => handlePointerMove(e);
      window.addEventListener('mousemove', moveHandler);
      window.addEventListener('mouseup', handlePointerUp);
      return () => {
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('mouseup', handlePointerUp);
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp]);

  useEffect(() => {
    const touchMoveHandler = (e) => handlePointerMove(e);
    const touchEndHandler = (e) => {
      if (pinchStart.current && e.touches.length < 2) {
        finishPinch();
        return;
      }

      if (!pinchStart.current && e.touches.length === 0) {
        handlePointerUp();
      }
    };

    window.addEventListener('touchmove', touchMoveHandler, { passive: false });
    window.addEventListener('touchend', touchEndHandler);
    window.addEventListener('touchcancel', touchEndHandler);
    return () => {
      window.removeEventListener('touchmove', touchMoveHandler);
      window.removeEventListener('touchend', touchEndHandler);
      window.removeEventListener('touchcancel', touchEndHandler);
    };
  }, [finishPinch, handlePointerMove, handlePointerUp]);

  // Window Resize
  useEffect(() => {
    if (!image || !cropRect) return;
    const handleResize = () => schedulePreviewDraw(image, cropRect, rows, cols);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [image, cropRect, rows, cols, schedulePreviewDraw]);

  // Actions
  const handleRotate = async (clockwise) => {
    if (!image) return;
    const rotated = rotateImage(image, clockwise);
    const newImg = await canvasToImage(rotated);
    setImage(newImg);
    resetCropPosition();
  };

  const handleExport = async () => {
    if (!image || !cropRect || tileCount === 0 || isExporting) return;

    setIsExporting(true);
    try {
      const zip = new JSZip();
      const baseName = fileName || 'tiles';
      const tiles = generateTiles(image, cropRect, rows, cols);

      tiles.forEach((tile) => {
        const name = `${baseName}_r${tile.row + 1}_c${tile.col + 1}.png`;
        zip.file(name, getDataUrlBase64(tile.dataUrl), { base64: true });
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${baseName}_tiles.zip`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveImages = async () => {
    if (!image || !cropRect || tileCount === 0 || isExporting) return;

    setIsExporting(true);
    try {
      const baseName = fileName || 'tiles';
      const files = await generateTileFiles(image, cropRect, rows, cols, baseName);

      if (navigator.canShare?.({ files })) {
        await navigator.share({
          files,
          title: 'Image Splitter',
          text: tileCount === 1 ? 'Save this image.' : 'Save these image tiles.',
        });
        return;
      }

      const zip = new JSZip();
      files.forEach((file) => zip.file(file.name, file));
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${baseName}_tiles.zip`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error(error);
      }
    } finally {
      setIsExporting(false);
    }
  };

  if (!image) {
    return (
      <div className="app">
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => loadFile(e.target.files[0])} />
        <div className="empty-state">
          <Icons.Image />
          <p>Import an image to start editing</p>
          <button className="primary-btn" onClick={handleImport}>Choose Image</button>
          {installPrompt && !isStandalone && (
            <button className="text-btn install-empty-btn" onClick={handleInstall}>
              Install App
            </button>
          )}
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

          {installPrompt && !isStandalone && (
            <button className="text-btn install-btn" onClick={handleInstall}>
              Install
            </button>
          )}

          <button className="icon-btn" onClick={() => handleRotate(false)} title="Rotate Left">
            <Icons.RotateLeft />
          </button>

          <button className="icon-btn" onClick={() => handleRotate(true)} title="Rotate Right">
            <Icons.RotateRight />
          </button>
          
          <button 
            className="icon-btn" 
            onClick={resetCropPosition}
            disabled={!isAdjusted}
            title="Reset Crop"
          >
            <Icons.Reset />
          </button>
        </div>
        
        <div className="top-bar-title">{fileName}</div>

        <div className="top-bar-right">
          <button className="text-btn save-btn" onClick={handleSaveImages} disabled={tileCount === 0 || isExporting}>
            {isExporting ? 'Saving' : tileCount === 1 ? 'Save Image' : 'Save Images'}
          </button>

          <button className="text-btn download-btn" onClick={handleExport} disabled={tileCount === 0 || isExporting}>
            {isExporting ? 'Exporting' : 'Export'}
          </button>
        </div>
      </header>

      {/* Main Canvas Area */}
      <main className="preview-area">
        <div 
          className="preview-canvas-wrap" 
          onMouseDown={handlePointerDown} 
          onTouchStart={handleTouchStart}
        >
          <canvas ref={canvasRef} />
        </div>
      </main>

      {/* Bottom Control Sheets */}
      <footer className="bottom-panel">
        
        {/* Active Tool Row */}
        <div className="tool-content">
          {activeTab === 'grid' && (
            <div className="tool-stack">
              <div className="preset-row" aria-label="Grid presets">
                {GRID_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    className={`preset-btn ${rows === preset.rows && cols === preset.cols ? 'active' : ''}`}
                    onClick={() => applyGridPreset(preset)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="preset-row" aria-label="Aspect ratio presets">
                {ASPECT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`preset-btn ${aspectPreset === preset.id ? 'active' : ''}`}
                    onClick={() => applyAspectPreset(preset)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {aspectPreset === 'custom' && (
                <div className="compact-stepper-row">
                  <div className="stepper-group compact-stepper">
                    <span className="stepper-label">W</span>
                    <div className="stepper-controls">
                      <button className="stepper-btn" onClick={() => adjustCustomRatio('w', -1)}>−</button>
                      <span className="stepper-value">{tileRatioW}</span>
                      <button className="stepper-btn" onClick={() => adjustCustomRatio('w', 1)}>+</button>
                    </div>
                  </div>
                  <div className="stepper-group compact-stepper">
                    <span className="stepper-label">H</span>
                    <div className="stepper-controls">
                      <button className="stepper-btn" onClick={() => adjustCustomRatio('h', -1)}>−</button>
                      <span className="stepper-value">{tileRatioH}</span>
                      <button className="stepper-btn" onClick={() => adjustCustomRatio('h', 1)}>+</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="tool-row">
                <div className="stepper-group">
                  <span className="stepper-label">Rows</span>
                  <div className="stepper-controls">
                    <button className="stepper-btn" onClick={() => { setRows(Math.max(1, rows - 1)); resetCropPosition(); }}>−</button>
                    <span className="stepper-value">{rows}</span>
                    <button className="stepper-btn" onClick={() => { setRows(Math.min(20, rows + 1)); resetCropPosition(); }}>+</button>
                  </div>
                </div>
                <div className="stepper-group">
                  <span className="stepper-label">Columns</span>
                  <div className="stepper-controls">
                    <button className="stepper-btn" onClick={() => { setCols(Math.max(1, cols - 1)); resetCropPosition(); }}>−</button>
                    <span className="stepper-value">{cols}</span>
                    <button className="stepper-btn" onClick={() => { setCols(Math.min(20, cols + 1)); resetCropPosition(); }}>+</button>
                  </div>
                </div>
              </div>
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
              <div className="info-stat">
                <span className="stepper-label">Tile Ratio</span>
                <span className="info-value">{tileRatioW}:{tileRatioH}</span>
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
